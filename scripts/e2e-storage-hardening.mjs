#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BUCKET = "reservation-photos";
const OWNER_EMAIL = "pitnow-e2e-storage-owner@example.com";
const OTHER_EMAIL = "pitnow-e2e-storage-other@example.com";
const DEFAULT_PASSWORD = "Pitnow-storage-e2e-2026!";
const TEST_PREFIX = "e2e-storage-hardening";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

function loadEnvFile(path) {
  try {
    const content = readFileSync(path, "utf8");

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const rawValue = trimmed.slice(index + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, "");

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local is optional for CI where env vars may already be injected.
  }
}

function assertEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다.`);
  }

  return value;
}

function formatStep(label, value = "") {
  console.log(`✓ ${label}${value ? `: ${value}` : ""}`);
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

async function findUserByEmail(admin, email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 100,
    });

    if (error) {
      throw new Error(`테스트 유저 조회 실패: ${error.message}`);
    }

    const user = data.users.find((candidate) => candidate.email === email);

    if (user) {
      return user;
    }

    if (data.users.length < 100) {
      return null;
    }
  }

  return null;
}

async function ensureTestUser({ admin, email, password }) {
  const existingUser = await findUserByEmail(admin, email);

  if (existingUser) {
    const { error } = await admin.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
    });

    if (error) {
      throw new Error(`테스트 유저 비밀번호 갱신 실패: ${error.message}`);
    }

    return existingUser;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`테스트 유저 생성 실패: ${error?.message ?? "unknown"}`);
  }

  return data.user;
}

async function signIn({ supabaseUrl, anonKey, email, password }) {
  const client = createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session?.access_token) {
    throw new Error(`테스트 유저 로그인 실패: ${error?.message ?? "no session"}`);
  }

  return client;
}

async function ensureVehicle({ admin, userId, plateNumber }) {
  const { data: existingVehicle, error: lookupError } = await admin
    .from("vehicles")
    .select("id")
    .eq("user_id", userId)
    .eq("plate_number", plateNumber)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`테스트 차량 조회 실패: ${lookupError.message}`);
  }

  if (existingVehicle) {
    return existingVehicle.id;
  }

  const { data, error } = await admin
    .from("vehicles")
    .insert({
      user_id: userId,
      plate_number: plateNumber,
      model: "PitNow Storage E2E",
      year: 2026,
      type_label: "테스트",
      is_active: false,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`테스트 차량 생성 실패: ${error?.message ?? "unknown"}`);
  }

  return data.id;
}

async function getActiveBay(admin) {
  const { data: bays, error } = await admin
    .from("bays")
    .select("id, partner_id")
    .eq("is_active", true)
    .limit(50);

  if (error) {
    throw new Error(`테스트 베이 조회 실패: ${error.message}`);
  }

  for (const bay of bays ?? []) {
    const { data: partner, error: partnerError } = await admin
      .from("partners")
      .select("id, hourly_price")
      .eq("id", bay.partner_id)
      .gt("hourly_price", 0)
      .maybeSingle();

    if (partnerError) {
      throw new Error(`테스트 파트너 조회 실패: ${partnerError.message}`);
    }

    if (partner) {
      return {
        bayId: bay.id,
        partnerId: partner.id,
        hourlyPrice: Number(partner.hourly_price),
      };
    }
  }

  throw new Error("시간당 요금이 설정된 active bay가 없습니다.");
}

async function createReservation({ admin, userId, vehicleId, bay, status, slot }) {
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const start = addHours(new Date(), 24 * 240 + slot * 4 + attempt * 24);
    start.setUTCMinutes(0, 0, 0);
    const end = addHours(start, 1);
    const blockedUntil = addHours(end, 1);

    const { data, error } = await admin
      .from("reservations")
      .insert({
        user_id: userId,
        vehicle_id: vehicleId,
        bay_id: bay.bayId,
        partner_id: bay.partnerId,
        reservation_type: "SELF_SERVICE",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        reserved_end_time: end.toISOString(),
        blocked_until: blockedUntil.toISOString(),
        duration_minutes: 60,
        selected_task_count: 1,
        helper_verify_requested: false,
        helper_verify_fee: 0,
        status,
        total_price: bay.hourlyPrice,
      })
      .select("id, status")
      .single();

    if (data) {
      return data.id;
    }

    const message = error?.message ?? "unknown";

    if (
      message.includes("no_overlap") ||
      message.includes("conflicting key value violates exclusion constraint")
    ) {
      continue;
    }

    throw new Error(
      `${status} 테스트 예약 생성 실패: ${message}`,
    );
  }

  throw new Error(`${status} 테스트 예약 가능한 시간대를 찾지 못했습니다.`);
}

async function expectUpload({ client, path, shouldSucceed, label, uploadedPaths }) {
  const { error } = await client.storage.from(BUCKET).upload(path, PNG_BYTES, {
    contentType: "image/png",
    upsert: false,
  });

  if (shouldSucceed && error) {
    throw new Error(`${label} 업로드가 실패했습니다: ${error.message}`);
  }

  if (!shouldSucceed && !error) {
    uploadedPaths.push(path);
    throw new Error(`${label} 업로드가 성공하면 안 됩니다.`);
  }

  if (shouldSucceed) {
    uploadedPaths.push(path);
  }

  formatStep(label, shouldSucceed ? "허용" : "거부");
}

async function cleanup({ admin, reservationIds, uploadedPaths }) {
  if (uploadedPaths.length > 0) {
    const { error } = await admin.storage.from(BUCKET).remove(uploadedPaths);

    if (error) {
      console.warn(`Storage cleanup warning: ${error.message}`);
    }
  }

  if (reservationIds.length > 0) {
    const { error } = await admin
      .from("reservations")
      .delete()
      .in("id", reservationIds);

    if (error) {
      console.warn(`Reservation cleanup warning: ${error.message}`);
    }
  }
}

async function main() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));

  const supabaseUrl = assertEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = assertEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = assertEnv("SUPABASE_SERVICE_ROLE_KEY");
  const password = process.env.PITNOW_E2E_STORAGE_PASSWORD ?? DEFAULT_PASSWORD;
  const ownerEmail = process.env.PITNOW_E2E_STORAGE_OWNER_EMAIL ?? OWNER_EMAIL;
  const otherEmail = process.env.PITNOW_E2E_STORAGE_OTHER_EMAIL ?? OTHER_EMAIL;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const anon = createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const uploadedPaths = [];
  const reservationIds = [];
  const runId = crypto.randomUUID();

  try {
    const [owner, other] = await Promise.all([
      ensureTestUser({ admin, email: ownerEmail, password }),
      ensureTestUser({ admin, email: otherEmail, password }),
    ]);
    formatStep("테스트 유저 준비", owner.email ?? owner.id);
    formatStep("다른 유저 준비", other.email ?? other.id);

    const [ownerClient, otherClient, bay, vehicleId] = await Promise.all([
      signIn({ supabaseUrl, anonKey, email: ownerEmail, password }),
      signIn({ supabaseUrl, anonKey, email: otherEmail, password }),
      getActiveBay(admin),
      ensureVehicle({
        admin,
        userId: owner.id,
        plateNumber: "STORAGE E2E",
      }),
    ]);
    formatStep("소유자 로그인");
    formatStep("다른 유저 로그인");
    formatStep("테스트 베이 선택", bay.bayId);

    const confirmedReservationId = await createReservation({
      admin,
      userId: owner.id,
      vehicleId,
      bay,
      status: "CONFIRMED",
      slot: 0,
    });
    reservationIds.push(confirmedReservationId);
    const checkedInReservationId = await createReservation({
      admin,
      userId: owner.id,
      vehicleId,
      bay,
      status: "CHECKED_IN",
      slot: 1,
    });
    reservationIds.push(checkedInReservationId);
    const cancelledReservationId = await createReservation({
      admin,
      userId: owner.id,
      vehicleId,
      bay,
      status: "CANCELLED",
      slot: 2,
    });
    reservationIds.push(cancelledReservationId);
    formatStep("상태별 테스트 예약 생성", reservationIds.join(", "));

    const path = (phase, reservationId, label) =>
      `${phase}/${reservationId}/${TEST_PREFIX}-${runId}-${label}.png`;

    await expectUpload({
      client: ownerClient,
      path: path("checkin", confirmedReservationId, "confirmed-owner-checkin"),
      shouldSucceed: true,
      label: "CONFIRMED 소유자 checkin",
      uploadedPaths,
    });
    await expectUpload({
      client: ownerClient,
      path: path("checkout", confirmedReservationId, "confirmed-owner-checkout"),
      shouldSucceed: false,
      label: "CONFIRMED 소유자 checkout",
      uploadedPaths,
    });
    await expectUpload({
      client: otherClient,
      path: path("checkin", confirmedReservationId, "confirmed-other-checkin"),
      shouldSucceed: false,
      label: "다른 유저 checkin",
      uploadedPaths,
    });
    await expectUpload({
      client: anon,
      path: path("checkin", confirmedReservationId, "confirmed-anon-checkin"),
      shouldSucceed: false,
      label: "익명 checkin",
      uploadedPaths,
    });
    await expectUpload({
      client: ownerClient,
      path: path("inspection", confirmedReservationId, "invalid-phase"),
      shouldSucceed: false,
      label: "잘못된 phase",
      uploadedPaths,
    });
    await expectUpload({
      client: ownerClient,
      path: path("checkin", checkedInReservationId, "checked-in-owner-checkin"),
      shouldSucceed: false,
      label: "CHECKED_IN 소유자 checkin",
      uploadedPaths,
    });
    await expectUpload({
      client: ownerClient,
      path: path("checkout", checkedInReservationId, "checked-in-owner-checkout"),
      shouldSucceed: true,
      label: "CHECKED_IN 소유자 checkout",
      uploadedPaths,
    });
    await expectUpload({
      client: ownerClient,
      path: path("checkin", cancelledReservationId, "cancelled-owner-checkin"),
      shouldSucceed: false,
      label: "CANCELLED 소유자 checkin",
      uploadedPaths,
    });
    await expectUpload({
      client: ownerClient,
      path: path("checkout", cancelledReservationId, "cancelled-owner-checkout"),
      shouldSucceed: false,
      label: "CANCELLED 소유자 checkout",
      uploadedPaths,
    });

    console.log(
      JSON.stringify(
        {
          success: true,
          reservationIds: {
            confirmed: confirmedReservationId,
            checkedIn: checkedInReservationId,
            cancelled: cancelledReservationId,
          },
          uploadedObjectCount: uploadedPaths.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanup({ admin, reservationIds, uploadedPaths });
  }
}

main().catch((error) => {
  console.error("E2E storage hardening failed");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
