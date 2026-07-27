import { NextResponse } from "next/server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireRequestUser } from "@/src/lib/auth";
import { getSupabaseEnvErrorResponse, hasSupabaseEnv } from "@/src/lib/supabase";
import { transitionReservationStatus } from "@/src/lib/reservation-status";
import {
  CHECKIN_EARLY_MINUTES,
  getCheckinWindowState,
} from "@/src/lib/checkin-window";

type ReservationStatus =
  | "CONFIRMED"
  | "CHECKED_IN"
  | "IN_USE"
  | "COMPLETED"
  | "CANCELLED";

interface CheckinRequestBody {
  reservationId: string;
  frontImg: string;
  rearImg: string;
  leftImg: string;
  rightImg: string;
}

interface ReservationRow {
  id: string;
  partner_id: string;
  reservation_type: "SELF_SERVICE" | "SHOP_SERVICE";
  status: ReservationStatus;
  start_time: string;
  end_time: string;
}

interface CheckinRow {
  id: string;
}

interface VerificationRow {
  method: "QR" | "MANUAL_CODE";
  partner_id: string;
}

interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

function errorResponse(status: number, code: string, message: string) {
  const body: ApiErrorBody = {
    success: false,
    error: {
      code,
      message,
    },
  };

  return NextResponse.json(body, { status });
}

function parseAndValidateBody(payload: unknown): CheckinRequestBody | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const {
    reservationId,
    frontImg,
    rearImg,
    leftImg,
    rightImg,
  } = payload as Record<string, unknown>;

  if (
    typeof reservationId !== "string" ||
    typeof frontImg !== "string" ||
    typeof rearImg !== "string" ||
    typeof leftImg !== "string" ||
    typeof rightImg !== "string"
  ) {
    return null;
  }

  const normalizedBody: CheckinRequestBody = {
    reservationId: reservationId.trim(),
    frontImg: frontImg.trim(),
    rearImg: rearImg.trim(),
    leftImg: leftImg.trim(),
    rightImg: rightImg.trim(),
  };

  if (
    !normalizedBody.reservationId ||
    !normalizedBody.frontImg ||
    !normalizedBody.rearImg ||
    !normalizedBody.leftImg ||
    !normalizedBody.rightImg
  ) {
    return null;
  }

  return normalizedBody;
}

async function rollbackCheckinInsert(
  db: SupabaseClient,
  reservationId: string,
): Promise<void> {
  const { error } = await db
    .from("checkins")
    .delete()
    .eq("reservation_id", reservationId);

  if (error) {
    console.error("CHECKIN ROLLBACK ERROR:", error);
  }
}

export async function POST(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  const { auth } = authResult;
  const db = auth.client;

  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "요청 본문(JSON)이 올바르지 않습니다.");
  }

  const body = parseAndValidateBody(payload);

  if (!body) {
    return errorResponse(
      400,
      "INVALID_INPUT",
      "reservationId와 frontImg/rearImg/leftImg/rightImg는 모두 필수 문자열입니다.",
    );
  }

  const { reservationId, frontImg, rearImg, leftImg, rightImg } = body;

  const { data: reservation, error: reservationError } = await db
    .from("reservations")
    .select("id,partner_id,reservation_type,status,start_time,end_time")
    .eq("id", reservationId)
    .eq("user_id", auth.userId)
    .maybeSingle<ReservationRow>();

  if (reservationError) {
    console.error("RESERVATION SELECT ERROR:", reservationError);
    return errorResponse(500, "DB_ERROR", "예약 조회 중 오류가 발생했습니다.");
  }

  if (!reservation) {
    return errorResponse(404, "RESERVATION_NOT_FOUND", "예약을 찾을 수 없습니다.");
  }

  if (reservation.reservation_type !== "SELF_SERVICE") {
    return errorResponse(
      400,
      "SHOP_CHECKIN_PHOTOS_NOT_REQUIRED",
      "정비 맡기기 예약은 정비소 도착 인증만으로 체크인이 완료됩니다.",
    );
  }

  if (reservation.status !== "CONFIRMED") {
    return errorResponse(
      400,
      "INVALID_RESERVATION_STATUS",
      "CONFIRMED 상태의 예약만 체크인할 수 있습니다.",
    );
  }

  const checkinWindowState = getCheckinWindowState({
    startTime: reservation.start_time,
    endTime: reservation.end_time,
  });

  if (checkinWindowState === "NOT_OPEN") {
    return errorResponse(
      409,
      "CHECKIN_NOT_OPEN",
      `체크인은 예약 시작 ${CHECKIN_EARLY_MINUTES}분 전부터 가능합니다.`,
    );
  }

  if (checkinWindowState === "CLOSED") {
    return errorResponse(
      409,
      "CHECKIN_WINDOW_CLOSED",
      "예약 종료 시각이 지나 체크인할 수 없습니다. 정비소에 문의해 주세요.",
    );
  }

  if (checkinWindowState === "INVALID") {
    return errorResponse(
      500,
      "INVALID_RESERVATION_TIME",
      "예약 시간 정보가 올바르지 않습니다.",
    );
  }

  const { data: verification, error: verificationError } = await db
    .from("reservation_checkin_verifications")
    .select("partner_id,method")
    .eq("reservation_id", reservationId)
    .maybeSingle<VerificationRow>();

  if (verificationError) {
    console.error("CHECKIN VERIFICATION LOOKUP ERROR:", verificationError);
    return errorResponse(
      500,
      "DB_ERROR",
      "정비소 도착 인증 확인 중 오류가 발생했습니다.",
    );
  }

  if (!verification || verification.partner_id !== reservation.partner_id) {
    return errorResponse(
      409,
      "PARTNER_CHECKIN_VERIFICATION_REQUIRED",
      "정비소 QR 또는 수동 코드로 먼저 도착 인증을 완료해 주세요.",
    );
  }

  const { data: existingCheckin, error: checkinLookupError } = await db
    .from("checkins")
    .select("id")
    .eq("reservation_id", reservationId)
    .maybeSingle<CheckinRow>();

  if (checkinLookupError) {
    console.error("CHECKIN LOOKUP ERROR:", checkinLookupError);
    return errorResponse(500, "DB_ERROR", "체크인 정보 조회 중 오류가 발생했습니다.");
  }

  if (existingCheckin) {
    return errorResponse(409, "ALREADY_CHECKED_IN", "이미 체크인된 예약입니다.");
  }

  const { error: insertCheckinError } = await db.from("checkins").insert({
    reservation_id: reservationId,
    front_img: frontImg,
    rear_img: rearImg,
    left_img: leftImg,
    right_img: rightImg,
  });

  if (insertCheckinError) {
    console.error("CHECKIN INSERT ERROR:", insertCheckinError);

    if (insertCheckinError.code === "23505") {
      return errorResponse(409, "ALREADY_CHECKED_IN", "이미 체크인된 예약입니다.");
    }

    return errorResponse(500, "DB_ERROR", "체크인 저장 중 오류가 발생했습니다.");
  }

  const transitionResult = await transitionReservationStatus({
    reservationId,
    fromStatus: "CONFIRMED",
    toStatus: "CHECKED_IN",
    actorType: "USER",
    actorUserId: auth.source === "supabase" ? auth.userId : null,
    reason: "checkin_completed",
    client: db,
    metadata: {
      photoCount: 4,
      verificationMethod: verification.method,
    },
  });

  if (!transitionResult.ok) {
    await rollbackCheckinInsert(db, reservationId);
    const status = transitionResult.code === "STATUS_CONFLICT" ? 409 : 500;
    return errorResponse(
      status,
      transitionResult.code,
      transitionResult.code === "STATUS_CONFLICT"
        ? "예약 상태가 변경되어 체크인을 완료할 수 없습니다."
        : transitionResult.message,
    );
  }

  return NextResponse.json({ success: true, status: "CHECKED_IN" as const });
}

function methodNotAllowed() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "POST 메서드만 허용됩니다.",
      },
    },
    {
      status: 405,
      headers: {
        Allow: "POST",
      },
    },
  );
}

export function GET() {
  return methodNotAllowed();
}

export function PUT() {
  return methodNotAllowed();
}

export function PATCH() {
  return methodNotAllowed();
}

export function DELETE() {
  return methodNotAllowed();
}

export function OPTIONS() {
  return methodNotAllowed();
}
