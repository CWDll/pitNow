import { NextResponse } from "next/server";

import { supabase } from "@/src/lib/supabase";

type ReservationStatus =
  | "CONFIRMED"
  | "CHECKED_IN"
  | "IN_USE"
  | "COMPLETED"
  | "CANCELLED";

interface CheckoutRequestBody {
  reservationId: string;
  helperVerifyRequested?: boolean;
}

interface ReservationRow {
  id: string;
  status: ReservationStatus;
  start_time: string;
  end_time: string;
  total_price: number | string;
  selected_task_count: number | null;
  helper_verify_requested: boolean | null;
  helper_verify_fee: number | string | null;
}

interface CheckoutRow {
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

  const { reservationId, helperVerifyRequested } = payload as Record<
    string,
    unknown
  >;

  if (typeof reservationId !== "string") {
    return null;
  }

  if (
    typeof helperVerifyRequested !== "undefined" &&
    typeof helperVerifyRequested !== "boolean"
  ) {
    return null;
  }

  const normalizedReservationId = reservationId.trim();

  if (!normalizedReservationId) {
    return null;
  }

  return {
    reservationId: normalizedReservationId,
    helperVerifyRequested,
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
  const parsedValue =
    typeof value === "number" ? value : Number.parseFloat(String(value));

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
  const roundedBlocks = Math.ceil(diffMinutes / 60);
  const rawExtraFee = roundedBlocks * hourlyPrice;

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
  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return errorResponse(
      400,
      "INVALID_JSON",
      "요청 본문(JSON)이 올바르지 않습니다.",
    );
  }

  const body = parseAndValidateBody(payload);

  if (!body) {
    return errorResponse(
      400,
      "INVALID_INPUT",
      "reservationId는 필수 문자열입니다.",
    );
  }

  const { reservationId, helperVerifyRequested } = body;

  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select(
      "id, status, start_time, end_time, total_price, selected_task_count, helper_verify_requested, helper_verify_fee",
    )
    .eq("id", reservationId)
    .maybeSingle<ReservationRow>();

  if (reservationError) {
    console.error("RESERVATION SELECT ERROR:", reservationError);
    return errorResponse(500, "DB_ERROR", "예약 조회 중 오류가 발생했습니다.");
  }

  if (!reservation) {
    return errorResponse(
      404,
      "RESERVATION_NOT_FOUND",
      "예약을 찾을 수 없습니다.",
    );
  }

  if (reservation.status !== "CHECKED_IN" && reservation.status !== "IN_USE") {
    return errorResponse(
      400,
      "INVALID_RESERVATION_STATUS",
      "CHECKED_IN 또는 IN_USE 상태의 예약만 체크아웃할 수 있습니다.",
    );
  }

  const { data: existingCheckout, error: checkoutLookupError } = await supabase
    .from("checkouts")
    .select("id")
    .eq("reservation_id", reservationId)
    .maybeSingle<CheckoutRow>();

  if (checkoutLookupError) {
    console.error("CHECKOUT LOOKUP ERROR:", checkoutLookupError);
    return errorResponse(
      500,
      "DB_ERROR",
      "체크아웃 정보 조회 중 오류가 발생했습니다.",
    );
  }

  if (existingCheckout) {
    return errorResponse(
      409,
      "ALREADY_CHECKED_OUT",
      "이미 체크아웃된 예약입니다.",
    );
  }

  const startTime = parseIsoDate(reservation.start_time);
  const endTime = parseIsoDate(reservation.end_time);
  const totalPrice = toFiniteNumber(reservation.total_price);
  const persistedHelperVerifyFee =
    reservation.helper_verify_fee === null
      ? 0
      : (toFiniteNumber(reservation.helper_verify_fee) ?? 0);
  const selectedTaskCount =
    typeof reservation.selected_task_count === "number" &&
    Number.isInteger(reservation.selected_task_count) &&
    reservation.selected_task_count > 0
      ? reservation.selected_task_count
      : 0;
  const isHelperAlreadyRequested = reservation.helper_verify_requested === true;

  if (!startTime || !endTime || totalPrice === null) {
    return errorResponse(
      500,
      "INVALID_RESERVATION_DATA",
      "예약 데이터가 올바르지 않습니다.",
    );
  }

  const now = new Date();
  const extraFee = calculateExtraFee({
    now,
    startTime,
    endTime,
    totalPrice,
  });

  if (extraFee === null) {
    return errorResponse(
      500,
      "FEE_CALCULATION_ERROR",
      "초과요금 계산 중 오류가 발생했습니다.",
    );
  }

  const shouldApplyHelperVerify =
    helperVerifyRequested === true || isHelperAlreadyRequested;
  const helperVerifyFee = shouldApplyHelperVerify
    ? Math.max(persistedHelperVerifyFee, 5000 + selectedTaskCount * 2000)
    : 0;

  if (
    shouldApplyHelperVerify &&
    (!isHelperAlreadyRequested || persistedHelperVerifyFee !== helperVerifyFee)
  ) {
    const { error: helperUpdateError } = await supabase
      .from("reservations")
      .update({
        helper_verify_requested: true,
        helper_verify_fee: helperVerifyFee,
      })
      .eq("id", reservationId);

    if (helperUpdateError) {
      console.error("HELPER VERIFY UPDATE ERROR:", helperUpdateError);
      return errorResponse(
        500,
        "DB_ERROR",
        "헬퍼 작업 확인 정보 저장 중 오류가 발생했습니다.",
      );
    }
  }

  const { error: insertCheckoutError } = await supabase
    .from("checkouts")
    .insert({
      reservation_id: reservationId,
      extra_fee: extraFee,
    });

  if (insertCheckoutError) {
    console.error("CHECKOUT INSERT ERROR:", insertCheckoutError);

    if (insertCheckoutError.code === "23505") {
      return errorResponse(
        409,
        "ALREADY_CHECKED_OUT",
        "이미 체크아웃된 예약입니다.",
      );
    }

    return errorResponse(
      500,
      "DB_ERROR",
      "체크아웃 저장 중 오류가 발생했습니다.",
    );
  }

  const { data: updatedReservation, error: updateReservationError } =
    await supabase
      .from("reservations")
      .update({ status: "COMPLETED" })
      .eq("id", reservationId)
      .in("status", ["CHECKED_IN", "IN_USE"])
      .select("id")
      .maybeSingle<{ id: string }>();

  if (updateReservationError) {
    console.error("RESERVATION UPDATE ERROR:", updateReservationError);
    await rollbackCheckoutInsert(reservationId);
    return errorResponse(
      500,
      "DB_ERROR",
      "예약 상태 변경 중 오류가 발생했습니다.",
    );
  }

  if (!updatedReservation) {
    await rollbackCheckoutInsert(reservationId);
    return errorResponse(
      409,
      "STATUS_CONFLICT",
      "예약 상태가 변경되어 체크아웃을 완료할 수 없습니다.",
    );
  }

  return NextResponse.json({
    success: true,
    status: "COMPLETED" as const,
    extraFee,
    helperVerifyFee,
    totalSettlement: Number(
      (totalPrice + extraFee + helperVerifyFee).toFixed(2),
    ),
  });
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
