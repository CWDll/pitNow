import { NextResponse } from "next/server";

import type { ReservationStatus, ReservationType } from "@/src/domain/types";
import { requireRequestUser } from "@/src/lib/auth";
import { hasPartnerAdminMembership } from "@/src/lib/partner-admin";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";

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
}

interface CheckoutRow {
  reservation_id: string;
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

function toNumber(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getKstDayRangeIso(dateValue: string | null): {
  startIso: string;
  endIso: string;
} {
  const normalizedDate =
    dateValue && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
      ? dateValue
      : new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Seoul",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
  const start = new Date(`${normalizedDate}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function buildVehicleLabel(vehicle: VehicleRow | undefined): string {
  if (!vehicle) {
    return "-";
  }

  return `${vehicle.model} (${vehicle.year}) · ${vehicle.plate_number}`;
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
    console.error("PARTNER ADMIN RESERVATION MEMBERSHIP ERROR:", membership.error);
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

  const { startIso, endIso } = getKstDayRangeIso(searchParams.get("date"));
  const db = supabaseAdmin ?? authResult.auth.client;
  const { data: reservations, error: reservationError } = await db
    .from("reservations")
    .select(
      "id,partner_id,bay_id,vehicle_id,reservation_type,start_time,end_time,blocked_until,status,total_price",
    )
    .eq("partner_id", partnerId)
    .gte("start_time", startIso)
    .lt("start_time", endIso)
    .order("start_time", { ascending: true })
    .returns<ReservationRow[]>();

  if (reservationError) {
    console.error("PARTNER ADMIN RESERVATION LOOKUP ERROR:", reservationError);
    return jsonError(500, "DB_ERROR", "예약 목록 조회 중 오류가 발생했습니다.");
  }

  const reservationRows = reservations ?? [];
  const reservationIds = reservationRows.map((reservation) => reservation.id);
  const bayIds = [
    ...new Set(
      reservationRows
        .map((reservation) => reservation.bay_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const vehicleIds = [
    ...new Set(
      reservationRows
        .map((reservation) => reservation.vehicle_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [bayResult, vehicleResult, checkinResult, checkoutResult] =
    await Promise.all([
      bayIds.length > 0
        ? db.from("bays").select("id,name").in("id", bayIds).returns<BayRow[]>()
        : Promise.resolve({ data: [], error: null }),
      vehicleIds.length > 0
        ? db
            .from("vehicles")
            .select("id,plate_number,model,year")
            .in("id", vehicleIds)
            .returns<VehicleRow[]>()
        : Promise.resolve({ data: [], error: null }),
      reservationIds.length > 0
        ? db
            .from("checkins")
            .select("reservation_id")
            .in("reservation_id", reservationIds)
            .returns<CheckinRow[]>()
        : Promise.resolve({ data: [], error: null }),
      reservationIds.length > 0
        ? db
            .from("checkouts")
            .select("reservation_id")
            .in("reservation_id", reservationIds)
            .returns<CheckoutRow[]>()
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (bayResult.error || vehicleResult.error || checkinResult.error || checkoutResult.error) {
    console.error("PARTNER ADMIN RESERVATION RELATED LOOKUP ERROR:", {
      bayError: bayResult.error,
      vehicleError: vehicleResult.error,
      checkinError: checkinResult.error,
      checkoutError: checkoutResult.error,
    });
    return jsonError(
      500,
      "DB_ERROR",
      "예약 연관 정보 조회 중 오류가 발생했습니다.",
    );
  }

  const bayById = new Map((bayResult.data ?? []).map((bay) => [bay.id, bay]));
  const vehicleById = new Map(
    (vehicleResult.data ?? []).map((vehicle) => [vehicle.id, vehicle]),
  );
  const checkinIds = new Set(
    (checkinResult.data ?? []).map((checkin) => checkin.reservation_id),
  );
  const checkoutIds = new Set(
    (checkoutResult.data ?? []).map((checkout) => checkout.reservation_id),
  );

  return NextResponse.json({
    success: true,
    reservations: reservationRows.map((reservation) => ({
      id: reservation.id,
      reservationType: reservation.reservation_type,
      status: reservation.status,
      bayId: reservation.bay_id,
      bayLabel: reservation.bay_id
        ? bayById.get(reservation.bay_id)?.name ?? "Unknown bay"
        : "-",
      vehicleLabel: reservation.vehicle_id
        ? buildVehicleLabel(vehicleById.get(reservation.vehicle_id))
        : "-",
      startTime: reservation.start_time,
      endTime: reservation.end_time,
      blockedUntil: reservation.blocked_until,
      totalPrice: toNumber(reservation.total_price),
      checkinCompleted: checkinIds.has(reservation.id),
      checkoutCompleted: checkoutIds.has(reservation.id),
    })),
  });
}
