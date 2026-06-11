import { NextResponse } from "next/server";

import { requireRequestUser } from "@/src/lib/auth";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
} from "@/src/lib/supabase";

interface ReservationRow {
  id: string;
}

interface CheckoutRow {
  id: string;
  reservation_id: string;
  base_price: number | string;
  extra_fee: number | string | null;
  helper_verify_requested: boolean;
  helper_verify_fee: number | string;
  total_settlement: number | string;
  tool_check_completed: boolean;
  cleaning_completed: boolean;
  waste_disposal_completed: boolean;
  checkout_photo_1: string | null;
  checkout_photo_2: string | null;
  completed_at: string;
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

function toNumber(value: number | string | null): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  const { searchParams } = new URL(req.url);
  const reservationId = searchParams.get("reservationId")?.trim();

  if (!reservationId) {
    return jsonError(400, "INVALID_INPUT", "reservationId는 필수입니다.");
  }

  const db = authResult.auth.client;
  const { data: reservation, error: reservationError } = await db
    .from("reservations")
    .select("id")
    .eq("id", reservationId)
    .eq("user_id", authResult.auth.userId)
    .maybeSingle<ReservationRow>();

  if (reservationError) {
    console.error("CHECKOUT RESERVATION LOOKUP ERROR:", reservationError);
    return jsonError(500, "DB_ERROR", "예약 조회 중 오류가 발생했습니다.");
  }

  if (!reservation) {
    return jsonError(404, "RESERVATION_NOT_FOUND", "예약을 찾을 수 없습니다.");
  }

  const { data: checkout, error: checkoutError } = await db
    .from("checkouts")
    .select(
      "id,reservation_id,base_price,extra_fee,helper_verify_requested,helper_verify_fee,total_settlement,tool_check_completed,cleaning_completed,waste_disposal_completed,checkout_photo_1,checkout_photo_2,completed_at",
    )
    .eq("reservation_id", reservation.id)
    .maybeSingle<CheckoutRow>();

  if (checkoutError) {
    console.error("CHECKOUT DETAIL LOOKUP ERROR:", checkoutError);
    return jsonError(
      500,
      "DB_ERROR",
      "체크아웃 정보 조회 중 오류가 발생했습니다.",
    );
  }

  if (!checkout) {
    return jsonError(
      404,
      "CHECKOUT_NOT_FOUND",
      "체크아웃 정보를 찾을 수 없습니다.",
    );
  }

  return NextResponse.json({
    success: true,
    checkout: {
      id: checkout.id,
      reservationId: checkout.reservation_id,
      basePrice: toNumber(checkout.base_price),
      extraFee: toNumber(checkout.extra_fee),
      helperVerifyRequested: checkout.helper_verify_requested,
      helperVerifyFee: toNumber(checkout.helper_verify_fee),
      totalSettlement: toNumber(checkout.total_settlement),
      toolCheckCompleted: checkout.tool_check_completed,
      cleaningCompleted: checkout.cleaning_completed,
      wasteDisposalCompleted: checkout.waste_disposal_completed,
      checkoutPhoto1: checkout.checkout_photo_1,
      checkoutPhoto2: checkout.checkout_photo_2,
      completedAt: checkout.completed_at,
    },
  });
}
