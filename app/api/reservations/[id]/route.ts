import { NextResponse } from "next/server";

import type { ReservationType } from "@/src/domain/types";
import { requireRequestUser } from "@/src/lib/auth";
import { formatKstDateTimeRange } from "@/src/lib/timezone";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
} from "@/src/lib/supabase";

type ReservationStatus =
  | "CONFIRMED"
  | "CHECKED_IN"
  | "IN_USE"
  | "COMPLETED"
  | "CANCELLED";

interface Context {
  params: Promise<{ id: string }>;
}

interface ReservationRow {
  id: string;
  user_id: string;
  partner_id: string;
  bay_id: string | null;
  vehicle_id: string | null;
  reservation_type: ReservationType;
  package_id: string | null;
  start_time: string;
  end_time: string;
  reserved_end_time: string;
  status: ReservationStatus;
  total_price: number | string;
  selected_task_count: number;
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

interface ReservationTaskRow {
  task_id: string;
}

interface SelfMaintenanceTaskRow {
  id: string;
  code: string;
  name: string;
}

interface ServicePackageRow {
  id: string;
  name: string;
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

  const db = authResult.auth.client;
  const { data: reservation, error: reservationError } = await db
    .from("reservations")
    .select(
      "id,user_id,partner_id,bay_id,vehicle_id,reservation_type,package_id,start_time,end_time,reserved_end_time,status,total_price,selected_task_count",
    )
    .eq("id", reservationId)
    .eq("user_id", authResult.auth.userId)
    .maybeSingle<ReservationRow>();

  if (reservationError) {
    console.error("RESERVATION DETAIL LOOKUP ERROR:", reservationError);
    return jsonError(500, "DB_ERROR", "예약 상세 조회 중 오류가 발생했습니다.");
  }

  if (!reservation) {
    return jsonError(404, "RESERVATION_NOT_FOUND", "예약 정보를 찾을 수 없습니다.");
  }

  const [partnerResult, bayResult, vehicleResult] = await Promise.all([
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
  ]);

  if (partnerResult.error || bayResult.error || vehicleResult.error) {
    console.error("RESERVATION DETAIL RELATED LOOKUP ERROR:", {
      partnerError: partnerResult.error,
      bayError: bayResult.error,
      vehicleError: vehicleResult.error,
    });
    return jsonError(500, "DB_ERROR", "예약 연관 정보 조회 중 오류가 발생했습니다.");
  }

  let taskIds: string[] = [];
  let taskLabels = "";
  let packageTitle = "";

  if (reservation.reservation_type === "SELF_SERVICE") {
    const { data: taskRows, error: taskError } = await db
      .from("reservation_tasks")
      .select("task_id")
      .eq("reservation_id", reservation.id)
      .returns<ReservationTaskRow[]>();

    if (taskError) {
      console.error("RESERVATION DETAIL TASK LOOKUP ERROR:", taskError);
      return jsonError(500, "DB_ERROR", "예약 작업 조회 중 오류가 발생했습니다.");
    }

    const taskUuidList = (taskRows ?? []).map((row) => row.task_id);

    if (taskUuidList.length > 0) {
      const { data: taskCatalogRows, error: taskCatalogError } = await db
        .from("self_maintenance_tasks")
        .select("id,code,name")
        .in("id", taskUuidList)
        .returns<SelfMaintenanceTaskRow[]>();

      if (taskCatalogError) {
        console.error("RESERVATION DETAIL TASK CATALOG LOOKUP ERROR:", taskCatalogError);
        return jsonError(500, "DB_ERROR", "작업 카탈로그 조회 중 오류가 발생했습니다.");
      }

      const tasksById = new Map(
        (taskCatalogRows ?? []).map((task) => [task.id, task]),
      );
      const orderedTasks = taskUuidList
        .map((taskId) => tasksById.get(taskId) ?? null)
        .filter((task): task is SelfMaintenanceTaskRow => task !== null);

      taskIds = orderedTasks.map((task) => task.code);
      taskLabels = orderedTasks.map((task) => task.name).join(", ");
    }
  } else if (reservation.package_id) {
    const { data: packageRow, error: packageError } = await db
      .from("service_packages")
      .select("id,name")
      .eq("id", reservation.package_id)
      .maybeSingle<ServicePackageRow>();

    if (packageError) {
      console.error("RESERVATION DETAIL PACKAGE LOOKUP ERROR:", packageError);
      return jsonError(500, "DB_ERROR", "패키지 조회 중 오류가 발생했습니다.");
    }

    packageTitle = packageRow?.name ?? "패키지";
  }

  const partner = partnerResult.data;
  const bay = bayResult.data;
  const vehicle = vehicleResult.data;
  const workTitle =
    reservation.reservation_type === "SELF_SERVICE"
      ? taskLabels || "셀프 정비"
      : packageTitle || "전문가 맡기기";

  return NextResponse.json({
    success: true,
    reservation: {
      id: reservation.id,
      reservationType: reservation.reservation_type,
      bookingMode:
        reservation.reservation_type === "SHOP_SERVICE" ? "PACKAGE" : "SELF",
      partnerId: reservation.partner_id,
      garageName: partner?.name ?? "정비소",
      bayId: reservation.bay_id ?? "",
      bayLabel: bay?.name ?? "-",
      carId: reservation.vehicle_id ?? "",
      carLabel: vehicle
        ? `${vehicle.model} (${vehicle.year}) · ${vehicle.plate_number}`
        : "등록 차량",
      startTime: reservation.start_time,
      endTime: reservation.end_time,
      dateLabel: formatKstDateTimeRange(
        reservation.start_time,
        reservation.end_time,
      ),
      status: reservation.status,
      totalPrice: toNumber(reservation.total_price),
      workTitle,
      taskIds: taskIds.join(","),
      taskLabels: taskLabels || workTitle,
      selectedTaskCount: String(
        reservation.reservation_type === "SELF_SERVICE"
          ? reservation.selected_task_count
          : 0,
      ),
      packageId: reservation.package_id ?? "",
      packageTitle,
    },
  });
}
