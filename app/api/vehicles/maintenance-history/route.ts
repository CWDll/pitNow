import { NextResponse } from "next/server";

import { requireRequestUser } from "@/src/lib/auth";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
} from "@/src/lib/supabase";
import { formatKstDateTimeRange } from "@/src/lib/timezone";

type ReservationType = "SELF_SERVICE" | "SHOP_SERVICE";

interface ReservationRow {
  id: string;
  vehicle_id: string;
  partner_id: string;
  reservation_type: ReservationType;
  package_id: string | null;
  start_time: string;
  end_time: string;
  total_price: number | string;
}

interface NamedRow {
  id: string;
  name: string;
}

interface ReservationTaskRow {
  reservation_id: string;
  task_id: string;
}

interface CheckoutRow {
  reservation_id: string;
  total_settlement: number | string;
}

interface PaymentSnapshotRow {
  reservation_id: string;
  reservation_snapshot: unknown;
}

function toNumber(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function getPackageSnapshotTitle(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== "object") {
    return "";
  }

  const packageSnapshot = (snapshot as { packageSnapshot?: unknown })
    .packageSnapshot;

  if (!packageSnapshot || typeof packageSnapshot !== "object") {
    return "";
  }

  const name = (packageSnapshot as { name?: unknown }).name;
  return typeof name === "string" ? name : "";
}

export async function GET(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  const db = authResult.auth.client;
  const { data: reservations, error: reservationError } = await db
    .from("reservations")
    .select(
      "id,vehicle_id,partner_id,reservation_type,package_id,start_time,end_time,total_price",
    )
    .eq("user_id", authResult.auth.userId)
    .eq("status", "COMPLETED")
    .not("vehicle_id", "is", null)
    .order("start_time", { ascending: false })
    .returns<ReservationRow[]>();

  if (reservationError) {
    console.error("VEHICLE MAINTENANCE HISTORY LOOKUP ERROR:", reservationError);
    return NextResponse.json(
      {
        success: false,
        error: { code: "DB_ERROR", message: "정비 이력을 불러오지 못했습니다." },
      },
      { status: 500 },
    );
  }

  const rows = reservations ?? [];

  if (rows.length === 0) {
    return NextResponse.json({ success: true, histories: [] });
  }

  const reservationIds = rows.map((reservation) => reservation.id);
  const partnerIds = unique(rows.map((reservation) => reservation.partner_id));
  const packageIds = unique(rows.map((reservation) => reservation.package_id)).filter(
    isUuid,
  );

  const [partnerResult, taskResult, packageResult, checkoutResult, paymentResult] =
    await Promise.all([
      db.from("partners").select("id,name").in("id", partnerIds).returns<NamedRow[]>(),
      db
        .from("reservation_tasks")
        .select("reservation_id,task_id")
        .in("reservation_id", reservationIds)
        .returns<ReservationTaskRow[]>(),
      packageIds.length > 0
        ? db.from("service_packages").select("id,name").in("id", packageIds).returns<NamedRow[]>()
        : Promise.resolve({ data: [], error: null }),
      db
        .from("checkouts")
        .select("reservation_id,total_settlement")
        .in("reservation_id", reservationIds)
        .returns<CheckoutRow[]>(),
      db
        .from("payments")
        .select("reservation_id,reservation_snapshot")
        .eq("payment_purpose", "RESERVATION")
        .in("reservation_id", reservationIds)
        .order("created_at", { ascending: false })
        .returns<PaymentSnapshotRow[]>(),
    ]);

  if (
    partnerResult.error ||
    taskResult.error ||
    packageResult.error ||
    checkoutResult.error ||
    paymentResult.error
  ) {
    console.error("VEHICLE MAINTENANCE HISTORY RELATED LOOKUP ERROR:", {
      partnerError: partnerResult.error,
      taskError: taskResult.error,
      packageError: packageResult.error,
      checkoutError: checkoutResult.error,
      paymentError: paymentResult.error,
    });
    return NextResponse.json(
      {
        success: false,
        error: { code: "DB_ERROR", message: "정비 이력 정보를 조합하지 못했습니다." },
      },
      { status: 500 },
    );
  }

  const taskRows = taskResult.data ?? [];
  const taskIds = unique(taskRows.map((task) => task.task_id));
  const taskCatalogResult =
    taskIds.length > 0
      ? await db
          .from("self_maintenance_tasks")
          .select("id,name")
          .in("id", taskIds)
          .returns<NamedRow[]>()
      : { data: [], error: null };

  if (taskCatalogResult.error) {
    console.error("VEHICLE MAINTENANCE TASK CATALOG ERROR:", taskCatalogResult.error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "DB_ERROR", message: "정비 작업명을 불러오지 못했습니다." },
      },
      { status: 500 },
    );
  }

  const partnerNames = new Map((partnerResult.data ?? []).map((row) => [row.id, row.name]));
  const packageNames = new Map((packageResult.data ?? []).map((row) => [row.id, row.name]));
  const taskNames = new Map((taskCatalogResult.data ?? []).map((row) => [row.id, row.name]));
  const checkoutTotals = new Map(
    (checkoutResult.data ?? []).map((row) => [row.reservation_id, toNumber(row.total_settlement)]),
  );
  const snapshots = new Map<string, unknown>();
  const taskLabels = new Map<string, string[]>();

  (paymentResult.data ?? []).forEach((payment) => {
    if (!snapshots.has(payment.reservation_id)) {
      snapshots.set(payment.reservation_id, payment.reservation_snapshot);
    }
  });

  taskRows.forEach((task) => {
    const taskName = taskNames.get(task.task_id);

    if (!taskName) {
      return;
    }

    taskLabels.set(task.reservation_id, [
      ...(taskLabels.get(task.reservation_id) ?? []),
      taskName,
    ]);
  });

  return NextResponse.json({
    success: true,
    histories: rows.map((reservation) => ({
      id: reservation.id,
      vehicleId: reservation.vehicle_id,
      dateLabel: formatKstDateTimeRange(reservation.start_time, reservation.end_time),
      garageName: partnerNames.get(reservation.partner_id) ?? "정비소",
      workTitle:
        reservation.reservation_type === "SELF_SERVICE"
          ? taskLabels.get(reservation.id)?.join(", ") || "셀프 정비"
          : getPackageSnapshotTitle(snapshots.get(reservation.id)) ||
            packageNames.get(reservation.package_id ?? "") ||
            "전문가 맡기기",
      totalPrice: checkoutTotals.get(reservation.id) ?? toNumber(reservation.total_price),
    })),
  });
}
