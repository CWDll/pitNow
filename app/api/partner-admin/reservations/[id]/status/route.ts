import { NextResponse } from "next/server";

import type {
  ReservationStatus,
  ReservationType,
} from "@/src/domain/types";
import { requireRequestUser } from "@/src/lib/auth";
import { hasPartnerAdminMembership } from "@/src/lib/partner-admin";
import { recordPartnerAdminAudit } from "@/src/lib/partner-admin-audit";
import { transitionReservationStatus } from "@/src/lib/reservation-status";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";

interface Context {
  params: Promise<{ id: string }>;
}

interface ReservationRow {
  id: string;
  partner_id: string;
  reservation_type: ReservationType;
  status: ReservationStatus;
  total_price: number | string;
}

type ShopAction = "START" | "COMPLETE";

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

export async function POST(req: Request, context: Context) {
  if (!hasSupabaseEnv || !supabaseAdmin) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "요청 본문이 올바르지 않습니다.");
  }

  const action =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).action
      : null;

  if (action !== "START" && action !== "COMPLETE") {
    return jsonError(
      400,
      "INVALID_ACTION",
      "START 또는 COMPLETE 작업을 지정해 주세요.",
    );
  }

  const { id } = await context.params;
  const reservationId = id.trim();
  const { data: reservation, error: reservationError } = await supabaseAdmin
    .from("reservations")
    .select("id,partner_id,reservation_type,status,total_price")
    .eq("id", reservationId)
    .maybeSingle<ReservationRow>();

  if (reservationError) {
    console.error("SHOP WORK RESERVATION LOOKUP ERROR:", reservationError);
    return jsonError(500, "DB_ERROR", "예약 조회 중 오류가 발생했습니다.");
  }

  if (!reservation) {
    return jsonError(404, "RESERVATION_NOT_FOUND", "예약을 찾을 수 없습니다.");
  }

  const membership = await hasPartnerAdminMembership(
    authResult.auth.client,
    authResult.auth.userId,
    reservation.partner_id,
  );

  if (membership.error) {
    return jsonError(
      500,
      "DB_ERROR",
      "정비소 관리자 권한 확인 중 오류가 발생했습니다.",
    );
  }

  if (!membership.allowed) {
    return jsonError(
      403,
      "PARTNER_ADMIN_FORBIDDEN",
      "이 예약을 처리할 권한이 없습니다.",
    );
  }

  if (reservation.reservation_type !== "SHOP_SERVICE") {
    return jsonError(
      400,
      "SELF_SERVICE_STATUS_MANAGED_BY_USER",
      "셀프 정비 예약은 사용자가 이용 시작과 체크아웃을 진행합니다.",
    );
  }

  const shopAction = action as ShopAction;
  const expectedStatus: ReservationStatus =
    shopAction === "START" ? "CHECKED_IN" : "IN_USE";
  const nextStatus: ReservationStatus =
    shopAction === "START" ? "IN_USE" : "COMPLETED";

  if (reservation.status !== expectedStatus) {
    return jsonError(
      409,
      "INVALID_RESERVATION_STATUS",
      shopAction === "START"
        ? "고객 체크인이 완료된 예약만 작업을 시작할 수 있습니다."
        : "작업 중인 예약만 완료 처리할 수 있습니다.",
    );
  }

  let checkoutCreated = false;

  if (shopAction === "COMPLETE") {
    const totalPrice = Number(reservation.total_price);
    const { error: checkoutError } = await supabaseAdmin.from("checkouts").insert({
      reservation_id: reservation.id,
      base_price: totalPrice,
      extra_fee: 0,
      helper_verify_requested: false,
      helper_verify_fee: 0,
      total_settlement: totalPrice,
      tool_check_completed: false,
      cleaning_completed: false,
      waste_disposal_completed: false,
      checkout_photo_1: null,
      checkout_photo_2: null,
    });

    if (checkoutError && checkoutError.code !== "23505") {
      console.error("SHOP WORK CHECKOUT INSERT ERROR:", checkoutError);
      return jsonError(500, "DB_ERROR", "작업 완료 내역을 저장하지 못했습니다.");
    }

    checkoutCreated = !checkoutError;
  }

  const transitionResult = await transitionReservationStatus({
    reservationId: reservation.id,
    fromStatus: expectedStatus,
    toStatus: nextStatus,
    actorType: "PARTNER",
    actorUserId: authResult.auth.userId,
    reason:
      shopAction === "START"
        ? "partner_work_started"
        : "partner_work_completed",
    client: supabaseAdmin,
    metadata: { reservationType: "SHOP_SERVICE" },
  });

  if (!transitionResult.ok) {
    if (checkoutCreated) {
      await supabaseAdmin
        .from("checkouts")
        .delete()
        .eq("reservation_id", reservation.id);
    }
    return jsonError(
      transitionResult.code === "STATUS_CONFLICT" ? 409 : 500,
      transitionResult.code,
      transitionResult.message,
    );
  }

  await recordPartnerAdminAudit({
    db: supabaseAdmin,
    partnerId: reservation.partner_id,
    actorUserId: authResult.auth.userId,
    action:
      shopAction === "START" ? "SHOP_WORK_STARTED" : "SHOP_WORK_COMPLETED",
    targetType: "RESERVATION",
    targetId: reservation.id,
    reservationId: reservation.id,
    beforeState: { status: expectedStatus },
    afterState: { status: nextStatus },
  });

  return NextResponse.json({
    success: true,
    reservationId: reservation.id,
    status: nextStatus,
  });
}
