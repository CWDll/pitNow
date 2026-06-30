import { NextResponse } from "next/server";

import { requireRequestUser } from "@/src/lib/auth";
import {
  BAY_BLOCKING_RESERVATION_STATUSES,
  isBayBlockingReservation,
} from "@/src/lib/bay-reservations";
import { hasPartnerAdminMembership } from "@/src/lib/partner-admin";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";

interface BayRow {
  id: string;
  partner_id: string;
  name: string;
  is_active: boolean;
}

interface ReservationBayRow {
  bay_id: string;
  blocked_until: string | null;
  status: string;
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

export async function GET(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  const { searchParams } = new URL(req.url);
  const partnerId = searchParams.get("partnerId")?.trim();

  if (!partnerId) {
    return jsonError(400, "INVALID_INPUT", "partnerId는 필수입니다.");
  }

  const membership = await hasPartnerAdminMembership(
    authResult.auth.client,
    authResult.auth.userId,
    partnerId,
  );

  if (membership.error) {
    console.error("PARTNER ADMIN BAY MEMBERSHIP ERROR:", membership.error);
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
      "이 정비소에 대한 관리자 권한이 없습니다.",
    );
  }

  const db = supabaseAdmin ?? authResult.auth.client;
  const { data, error } = await db
    .from("bays")
    .select("id,partner_id,name,is_active")
    .eq("partner_id", partnerId)
    .order("name", { ascending: true })
    .returns<BayRow[]>();

  if (error) {
    console.error("PARTNER ADMIN BAY LOOKUP ERROR:", error);
    return jsonError(500, "DB_ERROR", "베이 목록 조회 중 오류가 발생했습니다.");
  }

  const bayIds = (data ?? []).map((bay) => bay.id);
  const activeReservationCountByBay = new Map<string, number>();

  if (bayIds.length > 0) {
    const { data: activeReservations, error: activeReservationsError } = await db
      .from("reservations")
      .select("bay_id,status,blocked_until")
      .in("bay_id", bayIds)
      .in("status", BAY_BLOCKING_RESERVATION_STATUSES)
      .returns<ReservationBayRow[]>();

    if (activeReservationsError) {
      console.error(
        "PARTNER ADMIN BAY RESERVATION COUNT ERROR:",
        activeReservationsError,
      );
      return jsonError(
        500,
        "DB_ERROR",
        "베이 예약 상태 조회 중 오류가 발생했습니다.",
      );
    }

    const now = new Date();

    for (const reservation of activeReservations ?? []) {
      if (
        !isBayBlockingReservation({
          blockedUntil: reservation.blocked_until,
          now,
          status: reservation.status,
        })
      ) {
        continue;
      }

      activeReservationCountByBay.set(
        reservation.bay_id,
        (activeReservationCountByBay.get(reservation.bay_id) ?? 0) + 1,
      );
    }
  }

  return NextResponse.json({
    success: true,
    bays: (data ?? []).map((bay) => {
      const activeReservationCount =
        activeReservationCountByBay.get(bay.id) ?? 0;

      return {
        activeReservationCount,
        canDeactivate: activeReservationCount === 0,
        id: bay.id,
        partnerId: bay.partner_id,
        name: bay.name,
        isActive: bay.is_active,
      };
    }),
  });
}
