import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireRequestUser } from "@/src/lib/auth";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
} from "@/src/lib/supabase";
import { transitionReservationStatus } from "@/src/lib/reservation-status";

type ReservationStatus =
  | "CONFIRMED"
  | "CHECKED_IN"
  | "IN_USE"
  | "COMPLETED"
  | "CANCELLED";

type ReservationType = "SELF_SERVICE" | "SHOP_SERVICE";
const HELPER_VERIFY_BASE_FEE = 5000;

interface CheckoutRequestBody {
  reservationId: string;
  helperVerifyRequested?: boolean;
  toolCheckCompleted?: boolean;
  cleaningCompleted?: boolean;
  wasteDisposalCompleted?: boolean;
  checkoutPhoto1?: string;
  checkoutPhoto2?: string;
}

interface ReservationRow {
  id: string;
  status: ReservationStatus;
  reservation_type?: string | null;
  start_time: string;
  end_time: string;
  reserved_end_time?: string | null;
  blocked_until?: string | null;
  total_price: number | string;
  helper_verify_requested?: boolean | null;
  helper_verify_fee?: number | string | null;
}

interface CheckoutRow {
  id: string;
}

interface ReservationTaskFeeRow {
  self_maintenance_tasks:
    | {
        helper_verify_unit_fee: number | string;
      }
    | Array<{
        helper_verify_unit_fee: number | string;
      }>;
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
  const {
    toolCheckCompleted,
    cleaningCompleted,
    wasteDisposalCompleted,
    checkoutPhoto1,
    checkoutPhoto2,
  } = payload as Record<string, unknown>;

  if (typeof reservationId !== "string") {
    return null;
  }

  if (
    typeof helperVerifyRequested !== "undefined" &&
    typeof helperVerifyRequested !== "boolean"
  ) {
    return null;
  }

  if (
    typeof toolCheckCompleted !== "undefined" &&
    typeof toolCheckCompleted !== "boolean"
  ) {
    return null;
  }

  if (
    typeof cleaningCompleted !== "undefined" &&
    typeof cleaningCompleted !== "boolean"
  ) {
    return null;
  }

  if (
    typeof wasteDisposalCompleted !== "undefined" &&
    typeof wasteDisposalCompleted !== "boolean"
  ) {
    return null;
  }

  if (
    typeof checkoutPhoto1 !== "undefined" &&
    typeof checkoutPhoto1 !== "string"
  ) {
    return null;
  }

  if (
    typeof checkoutPhoto2 !== "undefined" &&
    typeof checkoutPhoto2 !== "string"
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
    toolCheckCompleted,
    cleaningCompleted,
    wasteDisposalCompleted,
    checkoutPhoto1:
      typeof checkoutPhoto1 === "string" && checkoutPhoto1.trim()
        ? checkoutPhoto1.trim()
        : undefined,
    checkoutPhoto2:
      typeof checkoutPhoto2 === "string" && checkoutPhoto2.trim()
        ? checkoutPhoto2.trim()
        : undefined,
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

function normalizeReservationType(
  value: string | null | undefined,
): ReservationType {
  if (value === "SHOP_SERVICE") {
    return "SHOP_SERVICE";
  }

  return "SELF_SERVICE";
}

function normalizeTaskFee(
  value: ReservationTaskFeeRow["self_maintenance_tasks"],
): number {
  const task = Array.isArray(value) ? value[0] : value;
  const rawFee = task?.helper_verify_unit_fee;
  const fee =
    typeof rawFee === "number" ? rawFee : Number.parseFloat(String(rawFee));

  if (!Number.isFinite(fee) || fee < 0) {
    return 0;
  }

  return fee;
}

function calculateExtraFee(params: {
  now: Date;
  startTime: Date;
  reservedEndTime: Date;
  basePrice: number;
}): number | null {
  const { now, startTime, reservedEndTime, basePrice } = params;

  const totalDurationMs = reservedEndTime.getTime() - startTime.getTime();

  if (totalDurationMs <= 0) {
    return null;
  }

  const totalHours = totalDurationMs / (1000 * 60 * 60);
  const hourlyPrice = basePrice / totalHours;

  if (!Number.isFinite(hourlyPrice) || hourlyPrice < 0) {
    return null;
  }

  const diffMs = now.getTime() - reservedEndTime.getTime();

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

async function rollbackCheckoutInsert(
  db: SupabaseClient,
  reservationId: string,
): Promise<void> {
  const { error } = await db
    .from("checkouts")
    .delete()
    .eq("reservation_id", reservationId);

  if (error) {
    console.error("CHECKOUT ROLLBACK ERROR:", error);
  }
}

async function calculateCheckoutHelperVerifyFee(params: {
  db: SupabaseClient;
  reservationId: string;
  reservationType: ReservationType;
  alreadyRequested: boolean;
  alreadyChargedFee: number;
  requestedAtCheckout: boolean;
}): Promise<number | null> {
  const {
    db,
    reservationId,
    reservationType,
    alreadyRequested,
    alreadyChargedFee,
    requestedAtCheckout,
  } = params;

  if (reservationType !== "SELF_SERVICE") {
    return 0;
  }

  if (alreadyRequested) {
    return alreadyChargedFee;
  }

  if (!requestedAtCheckout) {
    return 0;
  }

  const { data, error } = await db
    .from("reservation_tasks")
    .select("self_maintenance_tasks!inner(helper_verify_unit_fee)")
    .eq("reservation_id", reservationId)
    .returns<ReservationTaskFeeRow[]>();

  if (error) {
    console.error("HELPER VERIFY TASK FEE LOOKUP ERROR:", error);
    return null;
  }

  const taskFees = (data ?? []).reduce(
    (sum, row) => sum + normalizeTaskFee(row.self_maintenance_tasks),
    0,
  );

  return HELPER_VERIFY_BASE_FEE + taskFees;
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

  const { reservationId } = body;

  const { data: reservation, error: reservationError } = await db
    .from("reservations")
    .select(
      "id, status, reservation_type, start_time, end_time, reserved_end_time, blocked_until, total_price, selected_task_count, helper_verify_requested, helper_verify_fee",
    )
    .eq("id", reservationId)
    .eq("user_id", auth.userId)
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

  const { data: existingCheckout, error: checkoutLookupError } = await db
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
  const reservedEndTime = parseIsoDate(reservation.end_time);
  const reservationType = normalizeReservationType(
    reservation.reservation_type,
  );
  const totalPrice = toFiniteNumber(reservation.total_price);
  const alreadyHelperVerifyFee = toFiniteNumber(
    reservation.helper_verify_fee ?? 0,
  );

  if (
    !startTime ||
    !endTime ||
    !reservedEndTime ||
    totalPrice === null ||
    alreadyHelperVerifyFee === null
  ) {
    return errorResponse(
      500,
      "INVALID_RESERVATION_DATA",
      "예약 데이터가 올바르지 않습니다.",
    );
  }

  const basePrice = Math.max(0, totalPrice - alreadyHelperVerifyFee);
  const now = new Date();
  const extraFee =
    reservationType === "SHOP_SERVICE"
      ? 0
      : calculateExtraFee({
          now,
          startTime,
          reservedEndTime,
          basePrice,
        });

  if (extraFee === null) {
    return errorResponse(
      500,
      "FEE_CALCULATION_ERROR",
      "초과요금 계산 중 오류가 발생했습니다.",
    );
  }

  const helperVerifyFee = await calculateCheckoutHelperVerifyFee({
    db,
    reservationId,
    reservationType,
    alreadyRequested: Boolean(reservation.helper_verify_requested),
    alreadyChargedFee: alreadyHelperVerifyFee,
    requestedAtCheckout: Boolean(body.helperVerifyRequested),
  });

  if (helperVerifyFee === null) {
    return errorResponse(
      500,
      "HELPER_VERIFY_FEE_ERROR",
      "카 마스터 검수 비용 계산 중 오류가 발생했습니다.",
    );
  }

  const helperVerifyRequested =
    reservationType === "SELF_SERVICE" &&
    (Boolean(reservation.helper_verify_requested) ||
      Boolean(body.helperVerifyRequested));
  const totalSettlement = Number(
    (basePrice + extraFee + helperVerifyFee).toFixed(2),
  );
  const paidReservationAmount = totalPrice;
  const settlementAmountDue = Math.max(
    0,
    Number((totalSettlement - paidReservationAmount).toFixed(2)),
  );

  if (
    reservationType === "SELF_SERVICE" &&
    (!body.toolCheckCompleted ||
      !body.cleaningCompleted ||
      !body.wasteDisposalCompleted ||
      !body.checkoutPhoto1 ||
      !body.checkoutPhoto2)
  ) {
    return errorResponse(
      400,
      "CHECKOUT_EVIDENCE_REQUIRED",
      "셀프 정비 체크아웃은 체크리스트와 사진 2장이 모두 필요합니다.",
    );
  }

  const { error: insertCheckoutError } = await db
    .from("checkouts")
    .insert({
      reservation_id: reservationId,
      base_price: basePrice,
      extra_fee: extraFee,
      helper_verify_requested: helperVerifyRequested,
      helper_verify_fee: helperVerifyFee,
      total_settlement: totalSettlement,
      tool_check_completed: Boolean(body.toolCheckCompleted),
      cleaning_completed: Boolean(body.cleaningCompleted),
      waste_disposal_completed: Boolean(body.wasteDisposalCompleted),
      checkout_photo_1: body.checkoutPhoto1 ?? null,
      checkout_photo_2: body.checkoutPhoto2 ?? null,
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

  const transitionResult = await transitionReservationStatus({
    reservationId,
    fromStatus: reservation.status,
    toStatus: "COMPLETED",
    actorType: "USER",
    actorUserId: auth.source === "supabase" ? auth.userId : null,
    reason: "checkout_completed",
    client: db,
    metadata: {
      basePrice,
      extraFee,
      helperVerifyFee,
      totalSettlement,
      reservationType,
      checkoutPhotoCount:
        body.checkoutPhoto1 && body.checkoutPhoto2 ? 2 : 0,
    },
  });

  if (!transitionResult.ok) {
    await rollbackCheckoutInsert(db, reservationId);
    const status = transitionResult.code === "STATUS_CONFLICT" ? 409 : 500;
    return errorResponse(
      status,
      transitionResult.code,
      transitionResult.code === "STATUS_CONFLICT"
        ? "예약 상태가 변경되어 체크아웃을 완료할 수 없습니다."
        : transitionResult.message,
    );
  }

  return NextResponse.json({
    success: true,
    status: "COMPLETED" as const,
    basePrice,
    extraFee,
    helperVerifyRequested,
    helperVerifyFee,
    totalSettlement,
    paidReservationAmount,
    settlementAmountDue,
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
