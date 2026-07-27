#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PARTNER_EMAIL = "pitnow-e2e-partner-admin@example.com";
const CUSTOMER_EMAIL = "pitnow-e2e-shop-customer@example.com";
const PASSWORD = "Pitnow-partner-checkin-e2e-2026!";

function loadEnvFile(path) {
  try {
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const value = trimmed
        .slice(index + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // CI may inject all variables without an env file.
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 필요합니다.`);
  return value;
}

function pass(message) {
  console.log(`✓ ${message}`);
}

async function findUser(admin, email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email === email);
    if (user) return user;
    if (data.users.length < 100) return null;
  }
  return null;
}

async function ensureUser(admin, email) {
  const existing = await findUser(admin, email);
  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("사용자 갱신 실패");
    return data.user;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("사용자 생성 실패");
  return data.user;
}

async function signIn(url, anonKey, email) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error || !data.session?.access_token) {
    throw error ?? new Error("로그인 토큰 없음");
  }
  return data.session.access_token;
}

async function request({
  baseUrl,
  token,
  path,
  method = "GET",
  body,
  status = 200,
  code,
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

  if (response.status !== status) {
    throw new Error(
      `${method} ${path}: expected ${status}, got ${response.status} ${JSON.stringify(payload)}`,
    );
  }
  if (code && payload?.error?.code !== code) {
    throw new Error(
      `${method} ${path}: expected ${code}, got ${JSON.stringify(payload)}`,
    );
  }
  return payload;
}

async function findAvailableShopSeed(admin) {
  const { data, error } = await admin
    .from("partner_package_prices")
    .select(
      "partner_id,package_id,labor_price,partners!inner(name),service_packages!inner(name,duration_minutes,is_active)",
    )
    .eq("is_active", true)
    .limit(50);
  if (error) throw error;

  for (const price of data ?? []) {
    const packageRow = Array.isArray(price.service_packages)
      ? price.service_packages[0]
      : price.service_packages;
    if (!packageRow?.is_active) continue;

    const { data: bays, error: bayError } = await admin
      .from("bays")
      .select("id,name")
      .eq("partner_id", price.partner_id)
      .eq("is_active", true);
    if (bayError) throw bayError;

    for (const bay of bays ?? []) {
      const start = new Date(Date.now() + 10 * 60 * 1000);
      const duration = Number(packageRow.duration_minutes) || 60;
      const end = new Date(start.getTime() + duration * 60 * 1000);
      const blockedUntil = new Date(end.getTime() + 60 * 60 * 1000);
      const { data: conflict, error: conflictError } = await admin
        .from("reservations")
        .select("id")
        .eq("bay_id", bay.id)
        .in("status", ["CONFIRMED", "CHECKED_IN", "IN_USE"])
        .lt("start_time", blockedUntil.toISOString())
        .gt("blocked_until", start.toISOString())
        .limit(1)
        .maybeSingle();
      if (conflictError) throw conflictError;
      if (!conflict) {
        const partner = Array.isArray(price.partners)
          ? price.partners[0]
          : price.partners;
        return {
          partnerId: price.partner_id,
          partnerName: partner?.name ?? "테스트 정비소",
          packageId: price.package_id,
          packageName: packageRow.name,
          price: Number(price.labor_price),
          duration,
          bayId: bay.id,
          start,
          end,
          blockedUntil,
        };
      }
    }
  }

  throw new Error("현재 시각에 사용할 수 있는 Shop 테스트 베이가 없습니다.");
}

async function main() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const baseUrl = (
    process.env.PITNOW_E2E_BASE_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const records = { reservationId: "", vehicleId: "" };

  try {
    const [partnerUser, customerUser, seed] = await Promise.all([
      ensureUser(admin, PARTNER_EMAIL),
      ensureUser(admin, CUSTOMER_EMAIL),
      findAvailableShopSeed(admin),
    ]);
    pass(`테스트 정비소 선택: ${seed.partnerName}`);

    const { error: membershipError } = await admin.from("partner_admins").upsert(
      {
        user_id: partnerUser.id,
        partner_id: seed.partnerId,
        role: "OWNER",
        is_active: true,
      },
      { onConflict: "user_id,partner_id" },
    );
    if (membershipError) throw membershipError;

    const { data: vehicle, error: vehicleError } = await admin
      .from("vehicles")
      .insert({
        user_id: customerUser.id,
        plate_number: `SHOP-${Date.now().toString().slice(-6)}`,
        model: "PitNow Shop E2E",
        year: 2026,
        type_label: "세단",
        vehicle_weight_kg: 1400,
        is_active: false,
      })
      .select("id")
      .single();
    if (vehicleError || !vehicle) throw vehicleError ?? new Error("차량 생성 실패");
    records.vehicleId = vehicle.id;

    const { data: reservation, error: reservationError } = await admin
      .from("reservations")
      .insert({
        user_id: customerUser.id,
        vehicle_id: vehicle.id,
        partner_id: seed.partnerId,
        bay_id: seed.bayId,
        reservation_type: "SHOP_SERVICE",
        package_id: seed.packageId,
        start_time: seed.start.toISOString(),
        end_time: seed.end.toISOString(),
        reserved_end_time: seed.end.toISOString(),
        blocked_until: seed.blockedUntil.toISOString(),
        duration_minutes: seed.duration,
        selected_task_count: 0,
        helper_verify_requested: false,
        helper_verify_fee: 0,
        status: "CONFIRMED",
        total_price: seed.price,
      })
      .select("id")
      .single();
    if (reservationError || !reservation) {
      throw reservationError ?? new Error("Shop 예약 생성 실패");
    }
    records.reservationId = reservation.id;
    pass("Shop CHECKED_IN 전 테스트 예약 생성");

    const [partnerToken, customerToken] = await Promise.all([
      signIn(supabaseUrl, anonKey, PARTNER_EMAIL),
      signIn(supabaseUrl, anonKey, CUSTOMER_EMAIL),
    ]);

    const credentialPayload = await request({
      baseUrl,
      token: partnerToken,
      path: `/api/partner-admin/checkin-credentials?partnerId=${seed.partnerId}`,
    });
    const manualCode = credentialPayload.credential?.manualCode;
    const qrValue = credentialPayload.credential?.qrValue;
    if (!manualCode || !qrValue) throw new Error("체크인 인증정보 응답 누락");
    pass("Partner QR·수동 코드 조회");

    await request({
      baseUrl,
      token: customerToken,
      path: "/api/checkin/verify-partner",
      method: "POST",
      body: {
        reservationId: reservation.id,
        method: "MANUAL_CODE",
        credential: "PIT-WRNG-CODE",
      },
      status: 403,
      code: "PARTNER_CHECKIN_CREDENTIAL_INVALID",
    });
    pass("잘못된 수동 코드 거부");

    await request({
      baseUrl,
      token: customerToken,
      path: "/api/checkin/verify-partner",
      method: "POST",
      body: {
        reservationId: reservation.id,
        method: "MANUAL_CODE",
        credential: manualCode,
      },
    });
    const { data: manualVerification } = await admin
      .from("reservation_checkin_verifications")
      .select("method")
      .eq("reservation_id", reservation.id)
      .single();
    if (manualVerification?.method !== "MANUAL_CODE") {
      throw new Error("수동 코드 인증 방식이 저장되지 않았습니다.");
    }
    pass("사용자 수동 코드 도착 인증 및 CHECKED_IN 전환");

    const { error: resetStatusError } = await admin
      .from("reservations")
      .update({ status: "CONFIRMED" })
      .eq("id", reservation.id);
    if (resetStatusError) throw resetStatusError;
    await Promise.all([
      admin
        .from("reservation_checkin_verifications")
        .delete()
        .eq("reservation_id", reservation.id),
      admin
        .from("reservation_status_logs")
        .delete()
        .eq("reservation_id", reservation.id),
    ]);

    await request({
      baseUrl,
      token: customerToken,
      path: "/api/checkin/verify-partner",
      method: "POST",
      body: {
        reservationId: reservation.id,
        method: "QR",
        credential: qrValue,
      },
    });
    pass("사용자 QR 도착 인증 및 CHECKED_IN 전환");

    await request({
      baseUrl,
      token: customerToken,
      path: `/api/reservations/${reservation.id}/start`,
      method: "POST",
      status: 403,
      code: "PARTNER_WORK_START_REQUIRED",
    });
    pass("Shop 사용자 직접 작업 시작 403");

    await request({
      baseUrl,
      token: partnerToken,
      path: `/api/partner-admin/reservations/${reservation.id}/status`,
      method: "POST",
      body: { action: "START" },
    });
    pass("Partner 작업 시작 및 IN_USE 전환");

    await request({
      baseUrl,
      token: customerToken,
      path: "/api/checkout",
      method: "POST",
      body: { reservationId: reservation.id },
      status: 403,
      code: "PARTNER_COMPLETION_REQUIRED",
    });
    pass("Shop 사용자 직접 작업 완료 403");

    await request({
      baseUrl,
      token: partnerToken,
      path: `/api/partner-admin/reservations/${reservation.id}/status`,
      method: "POST",
      body: { action: "COMPLETE" },
    });
    pass("Partner 작업 완료 및 COMPLETED 전환");

    const [
      { data: finalReservation },
      { data: checkout },
      { data: logs },
      { data: auditLogs },
    ] =
      await Promise.all([
        admin
          .from("reservations")
          .select("status")
          .eq("id", reservation.id)
          .single(),
        admin
          .from("checkouts")
          .select("extra_fee,total_settlement")
          .eq("reservation_id", reservation.id)
          .single(),
        admin
          .from("reservation_status_logs")
          .select("from_status,to_status,actor_type")
          .eq("reservation_id", reservation.id)
          .order("created_at"),
        admin
          .from("partner_admin_audit_logs")
          .select("action,target_type,reservation_id")
          .eq("reservation_id", reservation.id),
      ]);

    if (finalReservation?.status !== "COMPLETED") {
      throw new Error("최종 예약 상태가 COMPLETED가 아닙니다.");
    }
    if (
      Number(checkout?.extra_fee) !== 0 ||
      Number(checkout?.total_settlement) !== seed.price
    ) {
      throw new Error("Shop 완료 정산 row가 예약 선결제 금액과 다릅니다.");
    }
    const transitions = (logs ?? []).map(
      (log) => `${log.from_status}->${log.to_status}:${log.actor_type}`,
    );
    if (
      !transitions.includes("CONFIRMED->CHECKED_IN:USER") ||
      !transitions.includes("CHECKED_IN->IN_USE:PARTNER") ||
      !transitions.includes("IN_USE->COMPLETED:PARTNER")
    ) {
      throw new Error(`상태 전환 로그가 올바르지 않습니다: ${transitions}`);
    }
    const auditActions = new Set((auditLogs ?? []).map((log) => log.action));
    if (
      !auditActions.has("SHOP_WORK_STARTED") ||
      !auditActions.has("SHOP_WORK_COMPLETED")
    ) {
      throw new Error("Shop 작업 시작/완료 Partner 감사 로그가 없습니다.");
    }
    pass("최종 정산, USER/PARTNER 상태 로그와 감사 로그 확인");
    console.log("Partner check-in + Shop work E2E passed");
  } finally {
    if (records.reservationId) {
      await admin.from("reservations").delete().eq("id", records.reservationId);
    }
    if (records.vehicleId) {
      await admin.from("vehicles").delete().eq("id", records.vehicleId);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
