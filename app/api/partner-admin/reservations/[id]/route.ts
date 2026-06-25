import { NextResponse } from "next/server";

import type { ReservationStatus, ReservationType } from "@/src/domain/types";
import { requireRequestUser } from "@/src/lib/auth";
import { hasPartnerAdminMembership } from "@/src/lib/partner-admin";
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
  bay_id: string | null;
  vehicle_id: string | null;
  reservation_type: ReservationType;
  start_time: string;
  end_time: string;
  blocked_until: string | null;
  status: ReservationStatus;
  total_price: number | string;
  helper_verify_requested: boolean;
  helper_verify_fee: number | string;
  created_at: string;
}

interface PartnerRow {
  id: string;
  name: string;
}

interface BayRow {
  id: string;
  name: string;
}

interface VehicleRow {
  id: string;
  plate_number: string;
  model: string;
  year: number;
}

interface CheckinRow {
  reservation_id: string;
  front_img: string;
  rear_img: string;
  left_img: string;
  right_img: string;
  checked_in_at: string;
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

interface StatusLogRow {
  id: string;
  reservation_id: string;
  from_status: ReservationStatus | null;
  to_status: ReservationStatus;
  actor_type: "SYSTEM" | "USER" | "PARTNER" | "ADMIN";
  actor_user_id: string | null;
  reason: string | null;
  created_at: string;
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

function vehicleLabel(vehicle: VehicleRow | null): string {
  if (!vehicle) {
    return "-";
  }

  return `${vehicle.model} (${vehicle.year}) · ${vehicle.plate_number}`;
}

export async function GET(req: Request, context: Context) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
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

  const db = supabaseAdmin ?? authResult.auth.client;
  const { data: reservation, error: reservationError } = await db
    .from("reservations")
    .select(
      "id,partner_id,bay_id,vehicle_id,reservation_type,start_time,end_time,blocked_until,status,total_price,helper_verify_requested,helper_verify_fee,created_at",
    )
    .eq("id", reservationId)
    .maybeSingle<ReservationRow>();

  if (reservationError) {
    console.error("PARTNER ADMIN RESERVATION DETAIL LOOKUP ERROR:", reservationError);
    return jsonError(500, "DB_ERROR", "예약 상세 조회 중 오류가 발생했습니다.");
  }

  if (!reservation) {
    return jsonError(404, "RESERVATION_NOT_FOUND", "예약 정보를 찾을 수 없습니다.");
  }

  const membership = await hasPartnerAdminMembership(
    authResult.auth.client,
    authResult.auth.userId,
    reservation.partner_id,
  );

  if (membership.error) {
    console.error(
      "PARTNER ADMIN RESERVATION DETAIL MEMBERSHIP ERROR:",
      membership.error,
    );
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
      "이 예약에 대한 관리자 권한이 없습니다.",
    );
  }

  const [
    partnerResult,
    bayResult,
    vehicleResult,
    checkinResult,
    checkoutResult,
    statusLogsResult,
  ] = await Promise.all([
    db
      .from("partners")
      .select("id,name")
      .eq("id", reservation.partner_id)
      .maybeSingle<PartnerRow>(),
    reservation.bay_id
      ? db
          .from("bays")
          .select("id,name")
          .eq("id", reservation.bay_id)
          .maybeSingle<BayRow>()
      : Promise.resolve({ data: null, error: null }),
    reservation.vehicle_id
      ? db
          .from("vehicles")
          .select("id,plate_number,model,year")
          .eq("id", reservation.vehicle_id)
          .maybeSingle<VehicleRow>()
      : Promise.resolve({ data: null, error: null }),
    db
      .from("checkins")
      .select(
        "reservation_id,front_img,rear_img,left_img,right_img,checked_in_at",
      )
      .eq("reservation_id", reservation.id)
      .maybeSingle<CheckinRow>(),
    db
      .from("checkouts")
      .select(
        "id,reservation_id,base_price,extra_fee,helper_verify_requested,helper_verify_fee,total_settlement,tool_check_completed,cleaning_completed,waste_disposal_completed,checkout_photo_1,checkout_photo_2,completed_at",
      )
      .eq("reservation_id", reservation.id)
      .maybeSingle<CheckoutRow>(),
    db
      .from("reservation_status_logs")
      .select(
        "id,reservation_id,from_status,to_status,actor_type,actor_user_id,reason,created_at",
      )
      .eq("reservation_id", reservation.id)
      .order("created_at", { ascending: true })
      .returns<StatusLogRow[]>(),
  ]);

  if (
    partnerResult.error ||
    bayResult.error ||
    vehicleResult.error ||
    checkinResult.error ||
    checkoutResult.error ||
    statusLogsResult.error
  ) {
    console.error("PARTNER ADMIN RESERVATION DETAIL RELATED LOOKUP ERROR:", {
      partnerError: partnerResult.error,
      bayError: bayResult.error,
      vehicleError: vehicleResult.error,
      checkinError: checkinResult.error,
      checkoutError: checkoutResult.error,
      statusLogsError: statusLogsResult.error,
    });
    return jsonError(
      500,
      "DB_ERROR",
      "예약 연관 정보 조회 중 오류가 발생했습니다.",
    );
  }

  const checkin = checkinResult.data;
  const checkout = checkoutResult.data;

  return NextResponse.json({
    success: true,
    reservation: {
      id: reservation.id,
      partnerId: reservation.partner_id,
      partnerName: partnerResult.data?.name ?? "Unknown partner",
      bayId: reservation.bay_id,
      bayLabel: bayResult.data?.name ?? "-",
      vehicleLabel: vehicleLabel(vehicleResult.data),
      reservationType: reservation.reservation_type,
      startTime: reservation.start_time,
      endTime: reservation.end_time,
      blockedUntil: reservation.blocked_until,
      status: reservation.status,
      totalPrice: toNumber(reservation.total_price),
      helperVerifyRequested: reservation.helper_verify_requested,
      helperVerifyFee: toNumber(reservation.helper_verify_fee),
      createdAt: reservation.created_at,
    },
    checkin: checkin
      ? {
          frontImg: checkin.front_img,
          rearImg: checkin.rear_img,
          leftImg: checkin.left_img,
          rightImg: checkin.right_img,
          checkedInAt: checkin.checked_in_at,
        }
      : null,
    checkout: checkout
      ? {
          id: checkout.id,
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
        }
      : null,
    statusLogs: (statusLogsResult.data ?? []).map((log) => ({
      id: log.id,
      fromStatus: log.from_status,
      toStatus: log.to_status,
      actorType: log.actor_type,
      actorUserId: log.actor_user_id,
      reason: log.reason,
      createdAt: log.created_at,
    })),
  });
}
