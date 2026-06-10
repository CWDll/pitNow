import { NextResponse } from "next/server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireRequestUser } from "@/src/lib/auth";
import { getSupabaseEnvErrorResponse, hasSupabaseEnv } from "@/src/lib/supabase";
import { logReservationStatusChange } from "@/src/lib/reservation-status";

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
  status: ReservationStatus;
}

interface CheckinRow {
  id: string;
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
    .select("id, status")
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

  if (reservation.status !== "CONFIRMED") {
    return errorResponse(
      400,
      "INVALID_RESERVATION_STATUS",
      "CONFIRMED 상태의 예약만 체크인할 수 있습니다.",
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

  const { data: updatedReservation, error: updateReservationError } = await db
    .from("reservations")
    .update({ status: "CHECKED_IN" })
    .eq("id", reservationId)
    .eq("status", "CONFIRMED")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updateReservationError) {
    console.error("RESERVATION UPDATE ERROR:", updateReservationError);
    await rollbackCheckinInsert(db, reservationId);
    return errorResponse(500, "DB_ERROR", "예약 상태 변경 중 오류가 발생했습니다.");
  }

  if (!updatedReservation) {
    await rollbackCheckinInsert(db, reservationId);
    return errorResponse(
      409,
      "STATUS_CONFLICT",
      "예약 상태가 변경되어 체크인을 완료할 수 없습니다.",
    );
  }

  const logResult = await logReservationStatusChange({
    reservationId,
    fromStatus: "CONFIRMED",
    toStatus: "CHECKED_IN",
    actorType: "USER",
    actorUserId: auth.source === "supabase" ? auth.userId : null,
    reason: "checkin_completed",
    client: db,
    metadata: {
      photoCount: 4,
    },
  });

  if (!logResult.ok && !logResult.skippedMissingTable) {
    await db
      .from("reservations")
      .update({ status: "CONFIRMED" })
      .eq("id", reservationId)
      .eq("status", "CHECKED_IN");
    await rollbackCheckinInsert(db, reservationId);
    return errorResponse(
      500,
      "STATUS_LOG_ERROR",
      "예약 상태 변경 로그 저장에 실패했습니다.",
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
