import { NextResponse } from "next/server";

import { hasAdminAccess } from "@/src/lib/admin-auth";
import {
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
  const canAccessAdmin = await hasAdminAccess();

  if (!canAccessAdmin) {
    return jsonError(401, "ADMIN_AUTH_REQUIRED", "관리자 인증이 필요합니다.");
  }

  if (!hasSupabaseServiceRoleEnv || !supabaseAdmin) {
    return jsonError(
      503,
      "SUPABASE_SERVICE_ROLE_MISSING",
      "관리자 쓰기 작업에는 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.",
    );
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
  const { data: reservation, error: reservationError } = await supabaseAdmin
    .from("reservations")
    .select("id,status")
    .eq("id", reservationId)
    .maybeSingle<ReservationRow>();

  if (reservationError) {
    console.error("ADMIN CANCEL RESERVATION LOOKUP ERROR:", reservationError);
    return jsonError(500, "DB_ERROR", "예약 조회 중 오류가 발생했습니다.");
  }

  if (!reservation) {
    return jsonError(404, "RESERVATION_NOT_FOUND", "예약을 찾을 수 없습니다.");
  }

  if (reservation.status !== "CONFIRMED") {
    return jsonError(
      400,
      "INVALID_RESERVATION_STATUS",
      "CONFIRMED 상태의 예약만 관리자 취소가 가능합니다.",
    );
  }

  const result = await transitionReservationStatus({
    reservationId,
    fromStatus: "CONFIRMED",
    toStatus: "CANCELLED",
    actorType: "ADMIN",
    reason: "admin_cancelled",
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
    actorType: "ADMIN",
  });

  return NextResponse.json({
    success: true,
    status: "CANCELLED",
    refund,
  });
}
