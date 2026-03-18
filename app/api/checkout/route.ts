import { NextResponse } from "next/server";

import { getSupabaseEnvErrorResponse, hasSupabaseEnv, supabase } from "@/src/lib/supabase";

type ReservationStatus =
  | "CONFIRMED"
  | "CHECKED_IN"
  | "IN_USE"
  | "COMPLETED"
  | "CANCELLED";

type ReservationType = "SELF_SERVICE" | "SHOP_SERVICE";

interface CheckoutRequestBody {
  reservationId: string;
}

interface ReservationRow {
  id: string;
  status: ReservationStatus;
  start_time: string;
  end_time: string;
  total_price: number | string;
}

interface CheckoutRow {
  id: string;
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

function parseAndValidateBody(payload: unknown): CheckoutRequestBody | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const { reservationId } = payload as Record<string, unknown>;

  if (typeof reservationId !== "string") {
    return null;
  }

  const normalizedReservationId = reservationId.trim();

  if (!normalizedReservationId) {
    return null;
  }

  return {
    reservationId: normalizedReservationId,
  };
}

function parseIsoDate(dateText: string): Date | null {
  const parsedDate = new Date(dateText);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
}

function toFiniteNumber(value: number | string): number | null {
  const parsedValue = typeof value === "number" ? value : Number.parseFloat(String(value));

  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return parsedValue;
}

function calculateExtraFee(params: {
  now: Date;
  startTime: Date;
  endTime: Date;
  totalPrice: number;
}): number | null {
  const { now, startTime, endTime, totalPrice } = params;

  const totalDurationMs = endTime.getTime() - startTime.getTime();

  if (totalDurationMs <= 0) {
    return null;
  }

  const totalHours = totalDurationMs / (1000 * 60 * 60);
  const hourlyPrice = totalPrice / totalHours;

  if (!Number.isFinite(hourlyPrice) || hourlyPrice < 0) {
    return null;
  }

  const diffMs = now.getTime() - endTime.getTime();

  if (diffMs <= 0) {
    return 0;
  }

  const diffMinutes = diffMs / (1000 * 60);
  const roundedBlocks = Math.ceil(diffMinutes / 30);
  const halfHourFee = hourlyPrice / 2;
  const rawExtraFee = roundedBlocks * halfHourFee;

  if (!Number.isFinite(rawExtraFee) || rawExtraFee < 0) {
    return null;
  }

  return Number(rawExtraFee.toFixed(2));
}

async function rollbackCheckoutInsert(reservationId: string): Promise<void> {
  const { error } = await supabase
    .from("checkouts")
    .delete()
    .eq("reservation_id", reservationId);

  if (error) {
    console.error("CHECKOUT ROLLBACK ERROR:", error);
  }
}

export async function POST(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "요청 본문(JSON)이 올바르지 않습니다.");
  }

  const body = parseAndValidateBody(payload);

  if (!body) {
    return errorResponse(400, "INVALID_INPUT", "reservationId는 필수 문자열입니다.");
  }

  const { reservationId } = body;

  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("id, status, start_time, end_time, total_price")
    .eq("id", reservationId)
    .maybeSingle<ReservationRow>();

  if (reservationError) {
    console.error("RESERVATION SELECT ERROR:", reservationError);
    return errorResponse(500, "DB_ERROR", "예약 조회 중 오류가 발생했습니다.");
  }

  if (!reservation) {
    return errorResponse(404, "RESERVATION_NOT_FOUND", "예약을 찾을 수 없습니다.");
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

  const reservationType: ReservationType = existingCheckin ? "SELF_SERVICE" : "SHOP_SERVICE";
  const validStatuses =
    reservationType === "SHOP_SERVICE"
      ? ["CONFIRMED", "IN_USE"]
      : ["CHECKED_IN", "IN_USE"];

  if (!validStatuses.includes(reservation.status)) {
    return errorResponse(400, "INVALID_RESERVATION_STATUS", "현재 예약 상태에서는 체크아웃을 진행할 수 없습니다.");
  }

  const { data: existingCheckout, error: checkoutLookupError } = await supabase
    .from("checkouts")
    .select("id")
    .eq("reservation_id", reservationId)
    .maybeSingle<CheckoutRow>();

  if (checkoutLookupError) {
    console.error("CHECKOUT LOOKUP ERROR:", checkoutLookupError);
    return errorResponse(500, "DB_ERROR", "체크아웃 정보 조회 중 오류가 발생했습니다.");
  }

  if (existingCheckout) {
    return errorResponse(409, "ALREADY_CHECKED_OUT", "이미 체크아웃된 예약입니다.");
  }

  const startTime = parseIsoDate(reservation.start_time);
  const endTime = parseIsoDate(reservation.end_time);
  const totalPrice = toFiniteNumber(reservation.total_price);

  if (!startTime || !endTime || totalPrice === null) {
    return errorResponse(500, "INVALID_RESERVATION_DATA", "예약 데이터가 올바르지 않습니다.");
  }

  const now = new Date();
  const extraFee =
    reservationType === "SHOP_SERVICE"
      ? 0
      : calculateExtraFee({
          now,
          startTime,
          endTime,
          totalPrice,
        });

  if (extraFee === null) {
    return errorResponse(500, "FEE_CALCULATION_ERROR", "초과요금 계산 중 오류가 발생했습니다.");
  }

  const { error: insertCheckoutError } = await supabase.from("checkouts").insert({
    reservation_id: reservationId,
    extra_fee: extraFee,
  });

  if (insertCheckoutError) {
    console.error("CHECKOUT INSERT ERROR:", insertCheckoutError);

    if (insertCheckoutError.code === "23505") {
      return errorResponse(409, "ALREADY_CHECKED_OUT", "이미 체크아웃된 예약입니다.");
    }

    return errorResponse(500, "DB_ERROR", "체크아웃 저장 중 오류가 발생했습니다.");
  }

  const { data: updatedReservation, error: updateReservationError } = await supabase
    .from("reservations")
    .update({ status: "COMPLETED" })
    .eq("id", reservationId)
    .in("status", validStatuses)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updateReservationError) {
    console.error("RESERVATION UPDATE ERROR:", updateReservationError);
    await rollbackCheckoutInsert(reservationId);
    return errorResponse(500, "DB_ERROR", "예약 상태 변경 중 오류가 발생했습니다.");
  }

  if (!updatedReservation) {
    await rollbackCheckoutInsert(reservationId);
    return errorResponse(409, "STATUS_CONFLICT", "예약 상태가 변경되어 체크아웃을 완료할 수 없습니다.");
  }

  return NextResponse.json({
    success: true,
    status: "COMPLETED" as const,
    extraFee,
  });
}

function methodNotAllowed() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "POST 메서드만 사용할 수 있습니다.",
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
