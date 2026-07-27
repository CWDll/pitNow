import { NextResponse } from "next/server";

import type {
  ReservationStatus,
  ReservationType,
} from "@/src/domain/types";
import { requireRequestUser } from "@/src/lib/auth";
import {
  CHECKIN_EARLY_MINUTES,
  getCheckinWindowState,
} from "@/src/lib/checkin-window";
import {
  extractQrToken,
  normalizeManualCode,
  secureTextEqual,
} from "@/src/lib/partner-checkin-credentials";
import { transitionReservationStatus } from "@/src/lib/reservation-status";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";

type VerificationMethod = "QR" | "MANUAL_CODE";

interface ReservationRow {
  id: string;
  partner_id: string;
  reservation_type: ReservationType;
  status: ReservationStatus;
  start_time: string;
  end_time: string;
}

interface CredentialRow {
  qr_token: string;
  manual_code: string;
}

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

export async function POST(req: Request) {
  if (!hasSupabaseEnv || !supabaseAdmin) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "요청 본문이 올바르지 않습니다.");
  }

  const source =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const reservationId = String(source.reservationId ?? "").trim();
  const method = source.method;
  const rawCredential = String(source.credential ?? "").trim();

  if (
    !reservationId ||
    (method !== "QR" && method !== "MANUAL_CODE") ||
    !rawCredential
  ) {
    return jsonError(
      400,
      "INVALID_INPUT",
      "예약 ID와 QR 또는 수동 인증 코드를 입력해 주세요.",
    );
  }

  const { data: reservation, error: reservationError } = await supabaseAdmin
    .from("reservations")
    .select("id,partner_id,reservation_type,status,start_time,end_time")
    .eq("id", reservationId)
    .eq("user_id", authResult.auth.userId)
    .maybeSingle<ReservationRow>();

  if (reservationError) {
    console.error("PARTNER CHECKIN RESERVATION LOOKUP ERROR:", reservationError);
    return jsonError(500, "DB_ERROR", "예약 조회 중 오류가 발생했습니다.");
  }

  if (!reservation) {
    return jsonError(404, "RESERVATION_NOT_FOUND", "예약을 찾을 수 없습니다.");
  }

  if (reservation.status !== "CONFIRMED") {
    return jsonError(
      409,
      "INVALID_RESERVATION_STATUS",
      "예약 확정 상태에서만 체크인할 수 있습니다.",
    );
  }

  const windowState = getCheckinWindowState({
    startTime: reservation.start_time,
    endTime: reservation.end_time,
  });

  if (windowState === "NOT_OPEN") {
    return jsonError(
      409,
      "CHECKIN_NOT_OPEN",
      `체크인은 예약 시작 ${CHECKIN_EARLY_MINUTES}분 전부터 가능합니다.`,
    );
  }

  if (windowState === "CLOSED") {
    return jsonError(
      409,
      "CHECKIN_WINDOW_CLOSED",
      "예약 종료 시각이 지나 체크인할 수 없습니다. 정비소에 문의해 주세요.",
    );
  }

  if (windowState === "INVALID") {
    return jsonError(
      500,
      "INVALID_RESERVATION_TIME",
      "예약 시간 정보가 올바르지 않습니다.",
    );
  }

  const { data: credential, error: credentialError } = await supabaseAdmin
    .from("partner_checkin_credentials")
    .select("qr_token,manual_code")
    .eq("partner_id", reservation.partner_id)
    .eq("is_active", true)
    .maybeSingle<CredentialRow>();

  if (credentialError) {
    console.error("PARTNER CHECKIN CREDENTIAL LOOKUP ERROR:", credentialError);
    return jsonError(500, "DB_ERROR", "정비소 체크인 정보를 확인하지 못했습니다.");
  }

  if (!credential) {
    return jsonError(
      409,
      "PARTNER_CHECKIN_NOT_CONFIGURED",
      "정비소 체크인 정보가 아직 발급되지 않았습니다. 정비소에 문의해 주세요.",
    );
  }

  const actual =
    method === "QR"
      ? extractQrToken(rawCredential)
      : normalizeManualCode(rawCredential);
  const expected =
    method === "QR" ? credential.qr_token : credential.manual_code;

  if (!secureTextEqual(actual, expected)) {
    return jsonError(
      403,
      "PARTNER_CHECKIN_CREDENTIAL_INVALID",
      "현재 예약한 정비소의 체크인 코드가 아닙니다.",
    );
  }

  const verification = {
    reservation_id: reservation.id,
    partner_id: reservation.partner_id,
    method: method as VerificationMethod,
    verified_by: authResult.auth.userId,
    verified_at: new Date().toISOString(),
  };
  const { error: verificationError } = await supabaseAdmin
    .from("reservation_checkin_verifications")
    .upsert(verification, { onConflict: "reservation_id" });

  if (verificationError) {
    console.error("PARTNER CHECKIN VERIFICATION INSERT ERROR:", verificationError);
    return jsonError(500, "DB_ERROR", "도착 인증을 저장하지 못했습니다.");
  }

  if (reservation.reservation_type === "SHOP_SERVICE") {
    const transitionResult = await transitionReservationStatus({
      reservationId: reservation.id,
      fromStatus: "CONFIRMED",
      toStatus: "CHECKED_IN",
      actorType: "USER",
      actorUserId: authResult.auth.userId,
      reason: "partner_arrival_verified",
      client: supabaseAdmin,
      metadata: { method },
    });

    if (!transitionResult.ok) {
      await supabaseAdmin
        .from("reservation_checkin_verifications")
        .delete()
        .eq("reservation_id", reservation.id);
      return jsonError(
        transitionResult.code === "STATUS_CONFLICT" ? 409 : 500,
        transitionResult.code,
        transitionResult.message,
      );
    }
  }

  return NextResponse.json({
    success: true,
    method,
    status:
      reservation.reservation_type === "SHOP_SERVICE"
        ? "CHECKED_IN"
        : "CONFIRMED",
    requiresPhotos: reservation.reservation_type === "SELF_SERVICE",
  });
}
