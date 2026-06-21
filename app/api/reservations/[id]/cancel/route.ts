import { NextResponse } from "next/server";

import { requireRequestUser } from "@/src/lib/auth";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  hasSupabaseServiceRoleEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";
import { transitionReservationStatus } from "@/src/lib/reservation-status";
import { refundReservationPayment } from "@/src/lib/payment-refunds";

interface Context {
  params: Promise<{ id: string }>;
}

interface ReservationRow {
  id: string;
  user_id: string;
  status: "CONFIRMED" | "CHECKED_IN" | "IN_USE" | "COMPLETED" | "CANCELLED";
}

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

function parseReason(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 500);
}

export async function POST(req: Request, context: Context) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  if (!hasSupabaseServiceRoleEnv || !supabaseAdmin) {
    return jsonError(
      503,
      "SUPABASE_SERVICE_ROLE_MISSING",
      "예약 취소/환불 처리에는 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.",
    );
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  const { id } = await context.params;
  const reservationId = id.trim();

  if (!reservationId) {
    return jsonError(400, "INVALID_RESERVATION_ID", "reservation id가 필요합니다.");
  }

  let payload: unknown = {};

  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const reason = parseReason((payload as { reason?: unknown }).reason);

  if (!reason) {
    return jsonError(
      400,
      "CANCEL_REASON_REQUIRED",
      "예약 취소 사유를 입력해 주세요.",
    );
  }

  const { data: reservation, error: reservationError } = await supabaseAdmin
    .from("reservations")
    .select("id,user_id,status")
    .eq("id", reservationId)
    .eq("user_id", authResult.auth.userId)
    .maybeSingle<ReservationRow>();

  if (reservationError) {
    console.error("USER CANCEL RESERVATION LOOKUP ERROR:", reservationError);
    return jsonError(500, "DB_ERROR", "예약 조회 중 오류가 발생했습니다.");
  }

  if (!reservation) {
    return jsonError(404, "RESERVATION_NOT_FOUND", "예약을 찾을 수 없습니다.");
  }

  if (reservation.status !== "CONFIRMED") {
    return jsonError(
      400,
      "INVALID_RESERVATION_STATUS",
      "CONFIRMED 상태의 예약만 취소할 수 있습니다.",
    );
  }

  const result = await transitionReservationStatus({
    reservationId,
    fromStatus: "CONFIRMED",
    toStatus: "CANCELLED",
    actorType: "USER",
    actorUserId: authResult.auth.source === "supabase" ? authResult.auth.userId : null,
    reason: "user_cancelled",
    metadata: {
      reason,
    },
    client: supabaseAdmin,
  });

  if (!result.ok) {
    return jsonError(409, result.code, result.message);
  }

  const refund = await refundReservationPayment({
    db: supabaseAdmin,
    reservationId,
    reason,
    actorType: "USER",
  });

  return NextResponse.json({
    success: true,
    status: "CANCELLED",
    refund,
  });
}
