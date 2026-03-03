import { NextResponse } from "next/server";

import { supabase } from "@/src/lib/supabase";

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

async function rollbackCheckinInsert(reservationId: string): Promise<void> {
  const { error } = await supabase
    .from("checkins")
    .delete()
    .eq("reservation_id", reservationId);

  if (error) {
    console.error("CHECKIN ROLLBACK ERROR:", error);
  }
}

export async function POST(req: Request) {
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

  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("id, status")
    .eq("id", reservationId)
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

  const { data: existingCheckin, error: checkinLookupError } = await supabase
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

  const { error: insertCheckinError } = await supabase.from("checkins").insert({
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

  const { data: updatedReservation, error: updateReservationError } = await supabase
    .from("reservations")
    .update({ status: "CHECKED_IN" })
    .eq("id", reservationId)
    .eq("status", "CONFIRMED")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updateReservationError) {
    console.error("RESERVATION UPDATE ERROR:", updateReservationError);
    await rollbackCheckinInsert(reservationId);
    return errorResponse(500, "DB_ERROR", "예약 상태 변경 중 오류가 발생했습니다.");
  }

  if (!updatedReservation) {
    await rollbackCheckinInsert(reservationId);
    return errorResponse(
      409,
      "STATUS_CONFLICT",
      "예약 상태가 변경되어 체크인을 완료할 수 없습니다.",
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
