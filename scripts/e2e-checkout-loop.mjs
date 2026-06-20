#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_EMAIL = "pitnow-e2e@example.com";
const DEFAULT_PASSWORD = "Pitnow-e2e-password-2026!";
const TEST_PLATE_NUMBER = "E2E 2026";
const TEST_PHOTO_URL = "https://example.com/pitnow-e2e-photo.jpg";

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

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function formatStep(label, value = "") {
  console.log(`✓ ${label}${value ? `: ${value}` : ""}`);
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
  const client = createClient(supabaseUrl, anonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session?.access_token) {
    throw new Error(`테스트 유저 로그인 실패: ${error?.message ?? "no session"}`);
  }

  return data.session.access_token;
}

async function ensureVehicle({ admin, userId }) {
  const { data: existingVehicle, error: lookupError } = await admin
    .from("vehicles")
    .select("id")
    .eq("user_id", userId)
    .eq("plate_number", TEST_PLATE_NUMBER)
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
      plate_number: TEST_PLATE_NUMBER,
      model: "PitNow E2E",
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
  const { data, error } = await admin
    .from("bays")
    .select("id, partner_id, partners!inner(hourly_price)")
    .eq("is_active", true)
    .limit(20);

  if (error) {
    throw new Error(`테스트 베이 조회 실패: ${error.message}`);
  }

  const bay = (data ?? []).find((row) => {
    const partner = Array.isArray(row.partners) ? row.partners[0] : row.partners;
    const hourlyPrice = Number(partner?.hourly_price ?? 0);
    return Number.isFinite(hourlyPrice) && hourlyPrice > 0;
  });

  if (!bay) {
    throw new Error("시간당 요금이 설정된 active bay가 없습니다.");
  }

  return bay.id;
}

async function getSelfTaskCode(admin) {
  const { data, error } = await admin
    .from("self_maintenance_tasks")
    .select("code")
    .eq("is_active", true)
    .eq("is_legal", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`셀프 작업 조회 실패: ${error.message}`);
  }

  if (!data?.code) {
    throw new Error("법적으로 허용된 active self task가 없습니다.");
  }

  return data.code;
}

async function apiRequest({ baseUrl, token, path, method = "GET", body }) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `${method} ${path} 실패 (${response.status}): ${JSON.stringify(payload)}`,
    );
  }

  return payload;
}

async function createPaidReservationWithFreeWindow(params) {
  const { baseUrl, token, bayId, vehicleId, taskCode } = params;
  const startBase = addHours(new Date(), 24 * 30);

  for (let attempt = 0; attempt < 72; attempt += 1) {
    const start = addHours(startBase, attempt * 3);
    start.setUTCMinutes(0, 0, 0);
    const end = addHours(start, 2);

    try {
      const reservation = {
        reservationType: "SELF_SERVICE",
        bayId,
        vehicleId,
        taskIds: [taskCode],
        agreeOnlySelectedTasks: true,
        consentMethod: "CHECKBOX",
        helperVerifyRequested: false,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      };
      const preparedPayment = await apiRequest({
        baseUrl,
        token,
        path: "/api/payments/prepare",
        method: "POST",
        body: {
          method: "CARD",
          reservation,
        },
      });

      const confirmedPayment = await apiRequest({
        baseUrl,
        token,
        path: "/api/payments/confirm",
        method: "POST",
        body: {
          paymentId: preparedPayment.paymentId,
          providerOrderId: preparedPayment.providerOrderId,
          amount: preparedPayment.amount,
        },
      });

      return {
        paymentId: preparedPayment.paymentId,
        reservationId: confirmedPayment.reservationId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      };
    } catch (error) {
      if (!String(error.message).includes("RESERVATION_OVERLAP")) {
        throw error;
      }
    }
  }

  throw new Error("예약 가능한 테스트 시간대를 찾지 못했습니다.");
}

async function forceReservationOverdue({ admin, reservationId }) {
  const start = addHours(new Date(), -3);
  const end = addHours(new Date(), -2);
  start.setUTCMinutes(0, 0, 0);
  end.setUTCMinutes(0, 0, 0);

  const { error } = await admin
    .from("reservations")
    .update({
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      reserved_end_time: end.toISOString(),
      blocked_until: addHours(end, 1).toISOString(),
    })
    .eq("id", reservationId);

  if (error) {
    throw new Error(`초과요금 테스트 시간 조정 실패: ${error.message}`);
  }

  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

async function verifyDatabase({ admin, reservationId }) {
  const [
    reservationResult,
    reservationPaymentResult,
    settlementPaymentResult,
    checkinResult,
    checkoutResult,
    statusLogResult,
  ] = await Promise.all([
    admin
      .from("reservations")
      .select("id,status,total_price")
      .eq("id", reservationId)
      .maybeSingle(),
    admin
      .from("payments")
      .select("id,status,amount,reservation_id,payment_purpose")
      .eq("reservation_id", reservationId)
      .eq("payment_purpose", "RESERVATION")
      .maybeSingle(),
    admin
      .from("payments")
      .select("id,status,amount,reservation_id,checkout_id,payment_purpose")
      .eq("reservation_id", reservationId)
      .eq("payment_purpose", "CHECKOUT_SETTLEMENT")
      .maybeSingle(),
    admin
      .from("checkins")
      .select("id,front_img,rear_img,left_img,right_img")
      .eq("reservation_id", reservationId)
      .maybeSingle(),
    admin
      .from("checkouts")
      .select(
        "id,base_price,extra_fee,helper_verify_fee,total_settlement,tool_check_completed,cleaning_completed,waste_disposal_completed,checkout_photo_1,checkout_photo_2",
      )
      .eq("reservation_id", reservationId)
      .maybeSingle(),
    admin
      .from("reservation_status_logs")
      .select("from_status,to_status,actor_type,reason")
      .eq("reservation_id", reservationId)
      .order("created_at", { ascending: true }),
  ]);

  if (reservationResult.error) {
    throw new Error(`예약 검증 실패: ${reservationResult.error.message}`);
  }

  if (reservationPaymentResult.error) {
    throw new Error(`예약 결제 검증 실패: ${reservationPaymentResult.error.message}`);
  }

  if (settlementPaymentResult.error) {
    throw new Error(
      `사후정산 결제 검증 실패: ${settlementPaymentResult.error.message}`,
    );
  }

  if (checkinResult.error) {
    throw new Error(`체크인 검증 실패: ${checkinResult.error.message}`);
  }

  if (checkoutResult.error) {
    throw new Error(`체크아웃 검증 실패: ${checkoutResult.error.message}`);
  }

  if (statusLogResult.error) {
    throw new Error(`상태 로그 검증 실패: ${statusLogResult.error.message}`);
  }

  const reservation = reservationResult.data;
  const reservationPayment = reservationPaymentResult.data;
  const settlementPayment = settlementPaymentResult.data;
  const checkin = checkinResult.data;
  const checkout = checkoutResult.data;
  const statusLogs = statusLogResult.data ?? [];

  if (reservation?.status !== "COMPLETED") {
    throw new Error(`최종 예약 상태가 COMPLETED가 아닙니다: ${reservation?.status}`);
  }

  if (reservationPayment?.status !== "RESERVATION_CONFIRMED") {
    throw new Error(
      `예약 결제 상태가 RESERVATION_CONFIRMED가 아닙니다: ${reservationPayment?.status}`,
    );
  }

  if (Number(checkout?.extra_fee ?? 0) <= 0) {
    throw new Error("초과요금이 생성되지 않았습니다.");
  }

  if (settlementPayment?.status !== "SETTLEMENT_CONFIRMED") {
    throw new Error(
      `사후정산 결제 상태가 SETTLEMENT_CONFIRMED가 아닙니다: ${settlementPayment?.status}`,
    );
  }

  if (
    !checkin?.front_img ||
    !checkin.rear_img ||
    !checkin.left_img ||
    !checkin.right_img
  ) {
    throw new Error("체크인 사진 4장 DB 저장 검증 실패");
  }

  if (
    !checkout?.tool_check_completed ||
    !checkout.cleaning_completed ||
    !checkout.waste_disposal_completed ||
    !checkout.checkout_photo_1 ||
    !checkout.checkout_photo_2
  ) {
    throw new Error("체크아웃 체크리스트/사진 DB 저장 검증 실패");
  }

  const transitions = statusLogs.map(
    (log) => `${log.from_status ?? "NULL"}->${log.to_status}`,
  );
  const expectedTransitions = [
    "NULL->CONFIRMED",
    "CONFIRMED->CHECKED_IN",
    "CHECKED_IN->IN_USE",
    "IN_USE->COMPLETED",
  ];

  for (const transition of expectedTransitions) {
    if (!transitions.includes(transition)) {
      throw new Error(`상태 전환 로그 누락: ${transition}`);
    }
  }

  return {
    paymentAmount: Number(reservationPayment.amount),
    settlementPaymentAmount: Number(settlementPayment.amount),
    totalPrice: Number(reservation.total_price),
    extraFee: Number(checkout.extra_fee),
    totalSettlement: Number(checkout.total_settlement),
    transitions,
  };
}

async function main() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));

  const supabaseUrl = assertEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = assertEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = assertEnv("SUPABASE_SERVICE_ROLE_KEY");
  const baseUrl = process.env.PITNOW_E2E_BASE_URL ?? "http://localhost:3000";
  const email = process.env.PITNOW_E2E_EMAIL ?? DEFAULT_EMAIL;
  const password = process.env.PITNOW_E2E_PASSWORD ?? DEFAULT_PASSWORD;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const user = await ensureTestUser({ admin, email, password });
  formatStep("테스트 유저 준비", user.email ?? user.id);

  const token = await signIn({ supabaseUrl, anonKey, email, password });
  formatStep("테스트 유저 로그인");

  const [vehicleId, bayId, taskCode] = await Promise.all([
    ensureVehicle({ admin, userId: user.id }),
    getActiveBay(admin),
    getSelfTaskCode(admin),
  ]);
  formatStep("테스트 차량 준비", vehicleId);
  formatStep("테스트 베이 선택", bayId);
  formatStep("테스트 작업 선택", taskCode);

  const reservation = await createPaidReservationWithFreeWindow({
    baseUrl,
    token,
    bayId,
    vehicleId,
    taskCode,
  });
  formatStep("FAKE 결제 승인", reservation.paymentId);
  formatStep("예약 생성", reservation.reservationId);

  await apiRequest({
    baseUrl,
    token,
    path: "/api/checkin",
    method: "POST",
    body: {
      reservationId: reservation.reservationId,
      frontImg: `${TEST_PHOTO_URL}?phase=checkin&field=front`,
      rearImg: `${TEST_PHOTO_URL}?phase=checkin&field=rear`,
      leftImg: `${TEST_PHOTO_URL}?phase=checkin&field=left`,
      rightImg: `${TEST_PHOTO_URL}?phase=checkin&field=right`,
    },
  });
  formatStep("체크인 완료");

  await apiRequest({
    baseUrl,
    token,
    path: `/api/reservations/${reservation.reservationId}/start`,
    method: "POST",
  });
  formatStep("이용 시작 완료");

  const overdueWindow = await forceReservationOverdue({
    admin,
    reservationId: reservation.reservationId,
  });
  formatStep("초과요금 테스트 시간 조정", overdueWindow.endTime);

  const checkoutResponse = await apiRequest({
    baseUrl,
    token,
    path: "/api/checkout",
    method: "POST",
    body: {
      reservationId: reservation.reservationId,
      toolCheckCompleted: true,
      cleaningCompleted: true,
      wasteDisposalCompleted: true,
      helperVerifyRequested: false,
      checkoutPhoto1: `${TEST_PHOTO_URL}?phase=checkout&field=photo-1`,
      checkoutPhoto2: `${TEST_PHOTO_URL}?phase=checkout&field=photo-2`,
    },
  });
  formatStep("체크아웃 완료");

  if (Number(checkoutResponse.settlementAmountDue ?? 0) <= 0) {
    throw new Error(
      `사후정산 결제 금액이 생성되지 않았습니다: ${JSON.stringify(checkoutResponse)}`,
    );
  }

  const settlementPayment = await apiRequest({
    baseUrl,
    token,
    path: "/api/payments/settlement/prepare",
    method: "POST",
    body: {
      reservationId: reservation.reservationId,
      method: "CARD",
    },
  });
  formatStep("사후정산 FAKE 결제 준비", settlementPayment.paymentId);

  await apiRequest({
    baseUrl,
    token,
    path: "/api/payments/settlement/confirm",
    method: "POST",
    body: {
      paymentId: settlementPayment.paymentId,
      providerOrderId: settlementPayment.providerOrderId,
      amount: settlementPayment.amount,
    },
  });
  formatStep("사후정산 FAKE 결제 승인");

  const verification = await verifyDatabase({
    admin,
    reservationId: reservation.reservationId,
  });
  formatStep("DB 검증 완료");

  console.log(
    JSON.stringify(
      {
        success: true,
        reservationId: reservation.reservationId,
        paymentId: reservation.paymentId,
        settlementPaymentId: settlementPayment.paymentId,
        startTime: reservation.startTime,
        endTime: reservation.endTime,
        paymentAmount: verification.paymentAmount,
        settlementPaymentAmount: verification.settlementPaymentAmount,
        totalPrice: verification.totalPrice,
        extraFee: verification.extraFee,
        totalSettlement: verification.totalSettlement,
        transitions: verification.transitions,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("E2E checkout loop failed");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
