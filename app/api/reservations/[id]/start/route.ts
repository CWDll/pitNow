import { NextResponse } from "next/server";

import type { ReservationStatus, ReservationType } from "@/src/domain/types";
import { requireRequestUser } from "@/src/lib/auth";
import { transitionReservationStatus } from "@/src/lib/reservation-status";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
} from "@/src/lib/supabase";

interface Context {
  params: Promise<{ id: string }>;
}

interface ReservationRow {
  id: string;
  status: ReservationStatus;
  reservation_type: ReservationType;
  start_time: string;
  end_time: string;
  total_price: number | string;
}

function errorResponse(status: number, code: string, message: string) {
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

function getExpectedFromStatus(
  reservationType: ReservationType,
): ReservationStatus {
  return reservationType === "SHOP_SERVICE" ? "CONFIRMED" : "CHECKED_IN";
}

export async function POST(req: Request, context: Context) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  const { auth } = authResult;
  const db = auth.client;

  const { id } = await context.params;
  const reservationId = id.trim();

  if (!reservationId) {
    return errorResponse(400, "INVALID_RESERVATION_ID", "예약 ID가 필요합니다.");
  }

  const { data: reservation, error: reservationError } = await db
    .from("reservations")
    .select("id, status, reservation_type, start_time, end_time, total_price")
    .eq("id", reservationId)
    .eq("user_id", auth.userId)
    .maybeSingle<ReservationRow>();

  if (reservationError) {
    console.error("RESERVATION START LOOKUP ERROR:", reservationError);
    return errorResponse(500, "DB_ERROR", "예약 조회 중 오류가 발생했습니다.");
  }

  if (!reservation) {
    return errorResponse(404, "RESERVATION_NOT_FOUND", "예약을 찾을 수 없습니다.");
  }

  const serverNow = new Date().toISOString();

  if (reservation.status === "IN_USE") {
    return NextResponse.json({
      success: true,
      status: "IN_USE" as const,
      serverNow,
      startTime: reservation.start_time,
      endTime: reservation.end_time,
      totalPrice: Number(reservation.total_price),
    });
  }

  const expectedFromStatus = getExpectedFromStatus(
    reservation.reservation_type,
  );

  if (reservation.status !== expectedFromStatus) {
    return errorResponse(
      400,
      "INVALID_RESERVATION_STATUS",
      `${expectedFromStatus} 상태의 예약만 이용 시작할 수 있습니다.`,
    );
  }

  const transitionResult = await transitionReservationStatus({
    reservationId,
    fromStatus: expectedFromStatus,
    toStatus: "IN_USE",
    actorType: reservation.reservation_type === "SHOP_SERVICE" ? "PARTNER" : "USER",
    actorUserId: auth.source === "supabase" ? auth.userId : null,
    reason: "usage_started",
    client: db,
    metadata: {
      reservationType: reservation.reservation_type,
    },
  });

  if (!transitionResult.ok) {
    const status = transitionResult.code === "STATUS_CONFLICT" ? 409 : 500;
    return errorResponse(
      status,
      transitionResult.code,
      transitionResult.code === "STATUS_CONFLICT"
        ? "예약 상태가 변경되어 이용 시작을 완료할 수 없습니다."
        : transitionResult.message,
    );
  }

  return NextResponse.json({
    success: true,
    status: "IN_USE" as const,
    serverNow,
    startTime: reservation.start_time,
    endTime: reservation.end_time,
    totalPrice: Number(reservation.total_price),
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
