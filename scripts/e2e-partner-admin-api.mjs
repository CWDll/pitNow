#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ADMIN_EMAIL = "pitnow-e2e-partner-admin@example.com";
const OUTSIDER_EMAIL = "pitnow-e2e-partner-outsider@example.com";
const DEFAULT_PASSWORD = "Pitnow-partner-admin-e2e-2026!";
const TEST_PLATE_PREFIX = "PAE2E";

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

function formatKstDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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

  return data.session.access_token;
}

async function apiRequest({
  baseUrl,
  token,
  path,
  method = "GET",
  body,
  expectedStatus = 200,
  expectedErrorCode,
}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);

  if (response.status !== expectedStatus) {
    throw new Error(
      `${method} ${path} expected ${expectedStatus}, got ${response.status}: ${JSON.stringify(
        payload,
      )}`,
    );
  }

  if (
    expectedErrorCode &&
    (!payload?.error || payload.error.code !== expectedErrorCode)
  ) {
    throw new Error(
      `${method} ${path} expected error code ${expectedErrorCode}, got ${JSON.stringify(
        payload,
      )}`,
    );
  }

  return payload;
}

async function getTestBay(admin) {
  const { data, error } = await admin
    .from("bays")
    .select("id,partner_id,name,is_active,partners!inner(id,name,hourly_price)")
    .limit(50);

  if (error) {
    throw new Error(`테스트 베이 조회 실패: ${error.message}`);
  }

  const bay = (data ?? []).find((row) => {
    const partner = Array.isArray(row.partners) ? row.partners[0] : row.partners;
    const hourlyPrice = Number(partner?.hourly_price ?? 0);
    return Number.isFinite(hourlyPrice) && hourlyPrice > 0;
  });

  if (!bay) {
    throw new Error("시간당 요금이 설정된 테스트 베이가 없습니다.");
  }

  const partner = Array.isArray(bay.partners) ? bay.partners[0] : bay.partners;

  return {
    id: bay.id,
    partnerId: bay.partner_id,
    name: bay.name,
    isActive: bay.is_active,
    partnerName: partner.name,
    hourlyPrice: Number(partner.hourly_price),
  };
}

async function ensurePartnerAdmin({ admin, userId, partnerId }) {
  const { error } = await admin.from("partner_admins").upsert(
    {
      user_id: userId,
      partner_id: partnerId,
      role: "OWNER",
      is_active: true,
    },
    {
      onConflict: "user_id,partner_id",
    },
  );

  if (error) {
    throw new Error(`partner_admins 연결 실패: ${error.message}`);
  }
}

async function createVehicle({ admin, userId, runId }) {
  const { data, error } = await admin
    .from("vehicles")
    .insert({
      user_id: userId,
      plate_number: `${TEST_PLATE_PREFIX}-${runId}`,
      model: "PitNow Partner API E2E",
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

async function getLegalSelfTaskId(admin) {
  const { data, error } = await admin
    .from("self_maintenance_tasks")
    .select("id")
    .eq("is_legal", true)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`셀프 정비 작업 조회 실패: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error("활성화된 법적 허용 셀프 정비 작업이 없습니다.");
  }

  return data.id;
}

async function createReservation({ admin, userId, vehicleId, bay }) {
  const startBase = addHours(new Date(), 24 * 180);

  for (let attempt = 0; attempt < 72; attempt += 1) {
    const start = addHours(startBase, attempt * 4);
    start.setUTCMinutes(0, 0, 0);
    const end = addHours(start, 1);
    const blockedUntil = addHours(end, 1);

    const { data, error } = await admin
      .from("reservations")
      .insert({
        user_id: userId,
        vehicle_id: vehicleId,
        partner_id: bay.partnerId,
        bay_id: bay.id,
        reservation_type: "SELF_SERVICE",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        reserved_end_time: end.toISOString(),
        blocked_until: blockedUntil.toISOString(),
        duration_minutes: 60,
        selected_task_count: 1,
        helper_verify_requested: false,
        helper_verify_fee: 0,
        status: "CONFIRMED",
        total_price: bay.hourlyPrice,
      })
      .select("id,start_time,end_time")
      .single();

    if (data) {
      return data;
    }

    const message = error?.message ?? "unknown";

    if (
      message.includes("no_overlap") ||
      message.includes("conflicting key value violates exclusion constraint")
    ) {
      continue;
    }

    throw new Error(`테스트 예약 생성 실패: ${message}`);
  }

  throw new Error("테스트 예약 가능한 시간대를 찾지 못했습니다.");
}

async function findAvailabilityBlockWindow({ admin, bay, startAfter }) {
  const startBase = addHours(startAfter, 72);

  for (let attempt = 0; attempt < 72; attempt += 1) {
    const startsAt = addHours(startBase, attempt * 4);
    startsAt.setUTCMinutes(0, 0, 0);
    const endsAt = addHours(startsAt, 1);

    const { data, error } = await admin
      .from("partner_availability_blocks")
      .select("id")
      .eq("partner_id", bay.partnerId)
      .eq("is_active", true)
      .lt("starts_at", endsAt.toISOString())
      .gt("ends_at", startsAt.toISOString())
      .or(`bay_id.is.null,bay_id.eq.${bay.id}`)
      .limit(1);

    if (error) {
      throw new Error(`예약 차단 시간 조회 실패: ${error.message}`);
    }

    if ((data ?? []).length === 0) {
      return {
        startsAt,
        endsAt,
      };
    }
  }

  throw new Error("테스트 예약 차단 가능 시간대를 찾지 못했습니다.");
}

async function cleanup(admin, records) {
  const tasks = [];

  if (records.partnerAdminUserId && records.auditSince) {
    tasks.push(
      admin
        .from("partner_admin_audit_logs")
        .delete()
        .eq("actor_user_id", records.partnerAdminUserId)
        .gte("created_at", records.auditSince),
    );
  }

  if (records.noteIds?.length) {
    tasks.push(
      admin.from("partner_reservation_notes").delete().in("id", records.noteIds),
    );
  }

  if (records.blockId) {
    tasks.push(
      admin.from("partner_availability_blocks").delete().eq("id", records.blockId),
    );
  }

  if (records.reservationId) {
    tasks.push(admin.from("reservations").delete().eq("id", records.reservationId));
  }

  if (records.vehicleId) {
    tasks.push(admin.from("vehicles").delete().eq("id", records.vehicleId));
  }

  for (const task of tasks) {
    const { error } = await task;

    if (error) {
      console.warn(`cleanup warning: ${error.message}`);
    }
  }

  if (records.bayId && typeof records.originalBayActive === "boolean") {
    const { error } = await admin
      .from("bays")
      .update({ is_active: records.originalBayActive })
      .eq("id", records.bayId);

    if (error) {
      console.warn(`bay restore warning: ${error.message}`);
    }
  }
}

async function getPartnerAdminAuditLogs({ admin, partnerId, actorUserId, since }) {
  const { data, error } = await admin
    .from("partner_admin_audit_logs")
    .select(
      "id,partner_id,actor_user_id,action,target_type,target_id,reservation_id,before_state,after_state,metadata,created_at",
    )
    .eq("partner_id", partnerId)
    .eq("actor_user_id", actorUserId)
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`partner admin audit 로그 조회 실패: ${error.message}`);
  }

  return data ?? [];
}

function countAuditAction(logs, action) {
  return logs.filter((log) => log.action === action).length;
}

function assertAuditLog(logs, predicate, message) {
  if (!logs.some(predicate)) {
    throw new Error(message);
  }
}

async function main() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));

  const supabaseUrl = assertEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = assertEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = assertEnv("SUPABASE_SERVICE_ROLE_KEY");
  const baseUrl = process.env.PITNOW_E2E_BASE_URL ?? "http://localhost:3000";
  const runId = String(Date.now()).slice(-8);
  const records = {
    noteIds: [],
  };

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    const [partnerAdminUser] = await Promise.all([
      ensureTestUser({
        admin,
        email: ADMIN_EMAIL,
        password: DEFAULT_PASSWORD,
      }),
      ensureTestUser({
        admin,
        email: OUTSIDER_EMAIL,
        password: DEFAULT_PASSWORD,
      }),
    ]);
    formatStep("테스트 유저 준비");

    const bay = await getTestBay(admin);
    records.bayId = bay.id;
    records.originalBayActive = bay.isActive;
    formatStep("테스트 정비소/베이 선택", `${bay.partnerName} / ${bay.name}`);

    await ensurePartnerAdmin({
      admin,
      userId: partnerAdminUser.id,
      partnerId: bay.partnerId,
    });
    records.partnerAdminUserId = partnerAdminUser.id;
    formatStep("partner_admins 연결");

    const [adminToken, outsiderToken] = await Promise.all([
      signIn({
        supabaseUrl,
        anonKey,
        email: ADMIN_EMAIL,
        password: DEFAULT_PASSWORD,
      }),
      signIn({
        supabaseUrl,
        anonKey,
        email: OUTSIDER_EMAIL,
        password: DEFAULT_PASSWORD,
      }),
    ]);
    formatStep("테스트 유저 로그인");
    records.auditSince = new Date(Date.now() - 1000).toISOString();

    records.vehicleId = await createVehicle({
      admin,
      userId: partnerAdminUser.id,
      runId,
    });
    const legalTaskId = await getLegalSelfTaskId(admin);
    const reservation = await createReservation({
      admin,
      userId: partnerAdminUser.id,
      vehicleId: records.vehicleId,
      bay,
    });
    records.reservationId = reservation.id;
    const reservationDate = formatKstDate(new Date(reservation.start_time));
    formatStep("테스트 예약 생성", reservation.id);

    const mePayload = await apiRequest({
      baseUrl,
      token: adminToken,
      path: "/api/partner-admin/me",
    });
    if (
      !Array.isArray(mePayload.partners) ||
      !mePayload.partners.some((partner) => partner.partnerId === bay.partnerId)
    ) {
      throw new Error("/api/partner-admin/me 응답에 테스트 정비소가 없습니다.");
    }
    formatStep("me API 확인");

    const baysPayload = await apiRequest({
      baseUrl,
      token: adminToken,
      path: `/api/partner-admin/bays?partnerId=${bay.partnerId}`,
    });
    if (!baysPayload.bays?.some((item) => item.id === bay.id)) {
      throw new Error("bays API 응답에 테스트 베이가 없습니다.");
    }
    formatStep("bays API 확인");

    await apiRequest({
      baseUrl,
      token: adminToken,
      path: `/api/partner-admin/bays/${bay.id}`,
      method: "PATCH",
      body: { isActive: !bay.isActive },
    });
    await apiRequest({
      baseUrl,
      token: adminToken,
      path: `/api/partner-admin/bays/${bay.id}`,
      method: "PATCH",
      body: { isActive: bay.isActive },
    });
    formatStep("bay 활성 상태 변경/복구 API 확인");

    const reservationsPayload = await apiRequest({
      baseUrl,
      token: adminToken,
      path: `/api/partner-admin/reservations?partnerId=${bay.partnerId}&date=${reservationDate}`,
    });
    if (
      !reservationsPayload.reservations?.some(
        (item) => item.id === reservation.id,
      )
    ) {
      throw new Error("reservations API 응답에 테스트 예약이 없습니다.");
    }
    formatStep("reservations API 확인");

    const detailPayload = await apiRequest({
      baseUrl,
      token: adminToken,
      path: `/api/partner-admin/reservations/${reservation.id}`,
    });
    if (detailPayload.reservation?.id !== reservation.id) {
      throw new Error("reservation detail API 응답 예약 ID가 일치하지 않습니다.");
    }
    formatStep("reservation detail API 확인");

    await apiRequest({
      baseUrl,
      token: outsiderToken,
      path: `/api/partner-admin/reservations/${reservation.id}`,
      expectedStatus: 403,
    });
    formatStep("비권한 유저 reservation detail 403 확인");

    const blockWindow = await findAvailabilityBlockWindow({
      admin,
      bay,
      startAfter: new Date(reservation.end_time),
    });
    const blockStart = blockWindow.startsAt;
    const blockEnd = blockWindow.endsAt;
    const blockPayload = await apiRequest({
      baseUrl,
      token: adminToken,
      path: "/api/partner-admin/availability-blocks",
      method: "POST",
      body: {
        partnerId: bay.partnerId,
        bayId: bay.id,
        startsAt: blockStart.toISOString(),
        endsAt: blockEnd.toISOString(),
        reason: `partner admin api e2e ${runId}`,
      },
    });
    records.blockId = blockPayload.block?.id;
    if (!records.blockId) {
      throw new Error("availability block 생성 응답에 block id가 없습니다.");
    }
    formatStep("availability block 생성 API 확인");

    const activeBlocksPayload = await apiRequest({
      baseUrl,
      token: adminToken,
      path: `/api/partner-admin/availability-blocks?partnerId=${bay.partnerId}`,
    });
    if (
      !activeBlocksPayload.blocks?.some((block) => block.id === records.blockId)
    ) {
      throw new Error("availability block 조회 응답에 활성 테스트 block이 없습니다.");
    }
    formatStep("availability block 조회 API 확인");

    await apiRequest({
      baseUrl,
      token: adminToken,
      path: "/api/partner-admin/availability-blocks",
      method: "POST",
      body: {
        partnerId: bay.partnerId,
        bayId: bay.id,
        startsAt: blockStart.toISOString(),
        endsAt: blockEnd.toISOString(),
        reason: `partner admin api e2e overlap ${runId}`,
      },
      expectedStatus: 400,
      expectedErrorCode: "AVAILABILITY_BLOCK_OVERLAP",
    });
    formatStep("availability block 중복 생성 거부 확인");

    await apiRequest({
      baseUrl,
      token: outsiderToken,
      path: "/api/partner-admin/availability-blocks",
      method: "POST",
      body: {
        partnerId: bay.partnerId,
        bayId: bay.id,
        startsAt: addHours(blockEnd, 1).toISOString(),
        endsAt: addHours(blockEnd, 2).toISOString(),
        reason: `partner admin api e2e outsider ${runId}`,
      },
      expectedStatus: 403,
      expectedErrorCode: "PARTNER_ADMIN_FORBIDDEN",
    });
    formatStep("비권한 유저 availability block 생성 403 확인");

    await apiRequest({
      baseUrl,
      token: adminToken,
      path: "/api/payments/prepare",
      method: "POST",
      body: {
        method: "CARD",
        reservation: {
          reservationType: "SELF_SERVICE",
          bayId: bay.id,
          vehicleId: records.vehicleId,
          taskIds: [legalTaskId],
          agreeOnlySelectedTasks: true,
          consentMethod: "CHECKBOX",
          helperVerifyRequested: false,
          startTime: blockStart.toISOString(),
          endTime: blockEnd.toISOString(),
        },
      },
      expectedStatus: 400,
      expectedErrorCode: "PARTNER_AVAILABILITY_BLOCKED",
    });
    formatStep("결제 준비 단계 availability block 거부 확인");

    await apiRequest({
      baseUrl,
      token: adminToken,
      path: `/api/partner-admin/availability-blocks/${records.blockId}`,
      method: "PATCH",
      body: {
        reason: `partner admin api e2e updated ${runId}`,
      },
    });
    await apiRequest({
      baseUrl,
      token: adminToken,
      path: `/api/partner-admin/availability-blocks/${records.blockId}`,
      method: "PATCH",
      body: {
        isActive: false,
      },
    });
    formatStep("availability block 수정/해제 API 확인");

    const inactiveBlocksPayload = await apiRequest({
      baseUrl,
      token: adminToken,
      path: `/api/partner-admin/availability-blocks?partnerId=${bay.partnerId}&includeInactive=true`,
    });
    if (
      !inactiveBlocksPayload.blocks?.some(
        (block) => block.id === records.blockId && block.isActive === false,
      )
    ) {
      throw new Error("includeInactive 조회 응답에 해제된 테스트 block이 없습니다.");
    }
    formatStep("availability block includeInactive 조회 확인");

    const createdNotes = [];

    const defaultNotePayload = await apiRequest({
      baseUrl,
      token: adminToken,
      path: `/api/partner-admin/reservations/${reservation.id}/notes`,
      method: "POST",
      body: {
        body: `partner admin api e2e note default ${runId}`,
      },
    });
    if (defaultNotePayload.note?.noteType !== "NOTE") {
      throw new Error("noteType 기본값 NOTE 응답이 올바르지 않습니다.");
    }
    createdNotes.push(defaultNotePayload.note);
    records.noteIds.push(defaultNotePayload.note.id);
    formatStep("reservation note 기본 타입 생성 API 확인");

    await apiRequest({
      baseUrl,
      token: adminToken,
      path: `/api/partner-admin/reservations/${reservation.id}/notes`,
      method: "POST",
      body: {
        noteType: "ISSUE",
        body: "   ",
      },
      expectedStatus: 400,
      expectedErrorCode: "INVALID_INPUT",
    });
    formatStep("reservation note 빈 본문 거부 확인");

    await apiRequest({
      baseUrl,
      token: outsiderToken,
      path: `/api/partner-admin/reservations/${reservation.id}/notes`,
      method: "POST",
      body: {
        noteType: "ISSUE",
        body: `partner admin api e2e forbidden note ${runId}`,
      },
      expectedStatus: 403,
      expectedErrorCode: "PARTNER_ADMIN_FORBIDDEN",
    });
    formatStep("비권한 유저 reservation note 생성 403 확인");

    for (const noteType of ["DELAY", "NO_SHOW", "ISSUE"]) {
      const notePayload = await apiRequest({
        baseUrl,
        token: adminToken,
        path: `/api/partner-admin/reservations/${reservation.id}/notes`,
        method: "POST",
        body: {
          noteType,
          body: `partner admin api e2e ${noteType.toLowerCase()} ${runId}`,
        },
      });

      if (!notePayload.note?.id) {
        throw new Error(`${noteType} note 생성 응답에 note id가 없습니다.`);
      }

      createdNotes.push(notePayload.note);
      records.noteIds.push(notePayload.note.id);
    }
    formatStep("reservation operational notes 생성 API 확인");

    const notesPayload = await apiRequest({
      baseUrl,
      token: adminToken,
      path: `/api/partner-admin/reservations/${reservation.id}/notes`,
    });
    for (const note of createdNotes) {
      if (!notesPayload.notes?.some((item) => item.id === note.id)) {
        throw new Error(`notes API 응답에 ${note.noteType} 테스트 note가 없습니다.`);
      }
    }
    formatStep("reservation notes 조회 API 확인");

    const resolvedNotePayload = await apiRequest({
      baseUrl,
      token: adminToken,
      path: `/api/partner-admin/reservation-notes/${records.noteIds.at(-1)}`,
      method: "PATCH",
      body: { isResolved: true },
    });
    if (resolvedNotePayload.note?.isResolved !== true) {
      throw new Error("note 해결 처리 응답이 올바르지 않습니다.");
    }
    formatStep("reservation note 해결 API 확인");

    const reopenedNotePayload = await apiRequest({
      baseUrl,
      token: adminToken,
      path: `/api/partner-admin/reservation-notes/${records.noteIds.at(-1)}`,
      method: "PATCH",
      body: { isResolved: false },
    });
    if (
      reopenedNotePayload.note?.isResolved !== false ||
      reopenedNotePayload.note?.resolvedAt !== null ||
      reopenedNotePayload.note?.resolvedBy !== null
    ) {
      throw new Error("note 다시 열기 응답이 올바르지 않습니다.");
    }
    formatStep("reservation note 다시 열기 API 확인");

    await apiRequest({
      baseUrl,
      token: outsiderToken,
      path: `/api/partner-admin/reservation-notes/${records.noteIds.at(-1)}`,
      method: "PATCH",
      body: { isResolved: true },
      expectedStatus: 403,
      expectedErrorCode: "PARTNER_ADMIN_FORBIDDEN",
    });
    formatStep("비권한 유저 reservation note 수정 403 확인");

    const auditLogs = await getPartnerAdminAuditLogs({
      admin,
      partnerId: bay.partnerId,
      actorUserId: partnerAdminUser.id,
      since: records.auditSince,
    });

    if (countAuditAction(auditLogs, "BAY_ACTIVE_UPDATED") < 2) {
      throw new Error("bay 활성 상태 변경 audit 로그가 부족합니다.");
    }

    assertAuditLog(
      auditLogs,
      (log) =>
        log.action === "BAY_ACTIVE_UPDATED" &&
        log.target_type === "BAY" &&
        log.target_id === bay.id &&
        log.before_state?.isActive === bay.isActive &&
        log.after_state?.isActive === !bay.isActive,
      "bay 비활성/활성 변경 audit before/after 상태가 없습니다.",
    );

    assertAuditLog(
      auditLogs,
      (log) =>
        log.action === "AVAILABILITY_BLOCK_CREATED" &&
        log.target_type === "AVAILABILITY_BLOCK" &&
        log.target_id === records.blockId,
      "availability block 생성 audit 로그가 없습니다.",
    );

    assertAuditLog(
      auditLogs,
      (log) =>
        log.action === "AVAILABILITY_BLOCK_UPDATED" &&
        log.target_type === "AVAILABILITY_BLOCK" &&
        log.target_id === records.blockId,
      "availability block 수정 audit 로그가 없습니다.",
    );

    assertAuditLog(
      auditLogs,
      (log) =>
        log.action === "AVAILABILITY_BLOCK_DEACTIVATED" &&
        log.target_type === "AVAILABILITY_BLOCK" &&
        log.target_id === records.blockId &&
        log.before_state?.isActive === true &&
        log.after_state?.isActive === false,
      "availability block 해제 audit 로그가 없습니다.",
    );

    if (countAuditAction(auditLogs, "RESERVATION_NOTE_CREATED") < 4) {
      throw new Error("reservation note 생성 audit 로그가 부족합니다.");
    }

    assertAuditLog(
      auditLogs,
      (log) =>
        log.action === "RESERVATION_NOTE_CREATED" &&
        log.target_type === "RESERVATION_NOTE" &&
        log.reservation_id === reservation.id &&
        log.metadata?.noteType === "ISSUE",
      "ISSUE note 생성 audit 로그가 없습니다.",
    );

    assertAuditLog(
      auditLogs,
      (log) =>
        log.action === "RESERVATION_NOTE_RESOLVED" &&
        log.target_type === "RESERVATION_NOTE" &&
        log.target_id === records.noteIds.at(-1) &&
        log.before_state?.isResolved === false &&
        log.after_state?.isResolved === true,
      "reservation note 해결 audit 로그가 없습니다.",
    );

    assertAuditLog(
      auditLogs,
      (log) =>
        log.action === "RESERVATION_NOTE_REOPENED" &&
        log.target_type === "RESERVATION_NOTE" &&
        log.target_id === records.noteIds.at(-1) &&
        log.before_state?.isResolved === true &&
        log.after_state?.isResolved === false,
      "reservation note 다시 열기 audit 로그가 없습니다.",
    );
    formatStep("partner-admin audit 로그 저장 확인");

    console.log("partner-admin API E2E passed");
  } finally {
    await cleanup(admin, records);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
