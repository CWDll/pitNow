"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { supabase } from "@/src/lib/supabase";
import { formatKstDateTimeRange } from "@/src/lib/timezone";

import ReservationListClient, { type ReservationListItem } from "./reservation-list-client";

type ReservationStatus = "CONFIRMED" | "CHECKED_IN" | "IN_USE" | "COMPLETED" | "CANCELLED";
type ReservationType = "SELF_SERVICE" | "SHOP_SERVICE";

interface ReservationRow {
  id: string;
  partner_id: string;
  bay_id: string;
  vehicle_id: string | null;
  reservation_type: ReservationType;
  package_id: string | null;
  start_time: string;
  end_time: string;
  reserved_end_time: string;
  status: ReservationStatus;
  total_price: number | string;
  vehicles:
    | {
        plate_number: string;
        model: string;
        year: number;
      }
    | Array<{
        plate_number: string;
        model: string;
        year: number;
      }>
    | null;
}

interface PartnerRow {
  id: string;
  name: string;
}

interface BayRow {
  id: string;
  name: string;
}

interface ServicePackageRow {
  id: string;
  name: string;
}

interface ReservationTaskRow {
  reservation_id: string;
  task_id: string;
}

interface SelfMaintenanceTaskRow {
  id: string;
  name: string;
}

interface CheckoutRow {
  id: string;
  reservation_id: string;
  total_settlement: number | string;
}

interface SettlementPaymentRow {
  reservation_id: string;
  status: string;
  amount: number | string;
  created_at: string;
}

interface SettlementSummary {
  amountDue: number;
  paidAmount: number;
  status: string | null;
}

function toNumber(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function mapReservationItem(
  reservation: ReservationRow,
  maps: {
    partnerNames: Map<string, string>;
    bayNames: Map<string, string>;
    packageNames: Map<string, string>;
    taskLabels: Map<string, string>;
    settlements: Map<string, SettlementSummary>;
  },
): ReservationListItem {
  const vehicle = Array.isArray(reservation.vehicles)
    ? reservation.vehicles[0] ?? null
    : reservation.vehicles;
  const taskLabel = maps.taskLabels.get(reservation.id);
  const workTitle =
    reservation.reservation_type === "SELF_SERVICE"
      ? taskLabel ?? "셀프 정비"
      : maps.packageNames.get(reservation.package_id ?? "") ?? "전문가 맡기기";
  const bayLabel =
    reservation.reservation_type === "SELF_SERVICE"
      ? maps.bayNames.get(reservation.bay_id) ?? undefined
      : undefined;
  const blockedMinutes = Math.max(
    30,
    Math.round(
      (new Date(reservation.reserved_end_time).getTime() - new Date(reservation.start_time).getTime()) /
        (1000 * 60),
    ),
  );
  const settlement = maps.settlements.get(reservation.id);

  return {
    id: reservation.id,
    garageName: maps.partnerNames.get(reservation.partner_id) ?? "정비소",
    workTitle,
    dateLabel: formatKstDateTimeRange(reservation.start_time, reservation.end_time),
    bayLabel,
    reservationType: reservation.reservation_type,
    status: reservation.status,
    totalPrice: toNumber(reservation.total_price),
    startTime: reservation.start_time,
    endTime: reservation.end_time,
    blockedMinutes,
    settlementAmountDue: settlement?.amountDue ?? 0,
    settlementPaidAmount: settlement?.paidAmount ?? 0,
    settlementPaymentStatus: settlement?.status ?? null,
    carLabel: vehicle
      ? `${vehicle.model} (${vehicle.year}) · ${vehicle.plate_number}`
      : "등록 차량",
  };
}

export default function ReservationListPage() {
  const [reservations, setReservations] = useState<ReservationListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadReservations() {
      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData.session) {
        if (!cancelled) {
          setNeedsLogin(true);
          setIsLoading(false);
        }
        return;
      }

      const { data, error: reservationError } = await supabase
        .from("reservations")
        .select("id, partner_id, bay_id, vehicle_id, reservation_type, package_id, start_time, end_time, reserved_end_time, status, total_price, vehicles(plate_number, model, year)")
        .order("start_time", { ascending: false })
        .returns<ReservationRow[]>();

      if (cancelled) {
        return;
      }

      if (reservationError) {
        console.error("RESERVATION LIST LOOKUP ERROR:", reservationError);
        setError("예약 내역을 불러오지 못했습니다.");
        setIsLoading(false);
        return;
      }

      const reservationRows = data ?? [];
      const completedReservationIds = reservationRows
        .filter((reservation) => reservation.status === "COMPLETED")
        .map((reservation) => reservation.id);
      const partnerIds = uniqueValues(
        reservationRows.map((reservation) => reservation.partner_id),
      );
      const bayIds = uniqueValues(
        reservationRows.map((reservation) => reservation.bay_id),
      );
      const packageIds = uniqueValues(
        reservationRows.map((reservation) => reservation.package_id),
      );
      const reservationIds = reservationRows.map((reservation) => reservation.id);

      const [
        partnerResult,
        bayResult,
        packageResult,
        reservationTaskResult,
        checkoutResult,
        settlementPaymentResult,
      ] = await Promise.all([
        partnerIds.length > 0
          ? supabase
              .from("partners")
              .select("id,name")
              .in("id", partnerIds)
              .returns<PartnerRow[]>()
          : Promise.resolve({ data: [], error: null }),
        bayIds.length > 0
          ? supabase
              .from("bays")
              .select("id,name")
              .in("id", bayIds)
              .returns<BayRow[]>()
          : Promise.resolve({ data: [], error: null }),
        packageIds.length > 0
          ? supabase
              .from("service_packages")
              .select("id,name")
              .in("id", packageIds)
              .returns<ServicePackageRow[]>()
          : Promise.resolve({ data: [], error: null }),
        reservationIds.length > 0
          ? supabase
              .from("reservation_tasks")
              .select("reservation_id,task_id")
              .in("reservation_id", reservationIds)
              .returns<ReservationTaskRow[]>()
          : Promise.resolve({ data: [], error: null }),
        completedReservationIds.length > 0
          ? supabase
              .from("checkouts")
              .select("id,reservation_id,total_settlement")
              .in("reservation_id", completedReservationIds)
              .returns<CheckoutRow[]>()
          : Promise.resolve({ data: [], error: null }),
        completedReservationIds.length > 0
          ? supabase
              .from("payments")
              .select("reservation_id,status,amount,created_at")
              .eq("payment_purpose", "CHECKOUT_SETTLEMENT")
              .in("reservation_id", completedReservationIds)
              .order("created_at", { ascending: false })
              .returns<SettlementPaymentRow[]>()
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (cancelled) {
        return;
      }

      if (
        partnerResult.error ||
        bayResult.error ||
        packageResult.error ||
        reservationTaskResult.error ||
        checkoutResult.error ||
        settlementPaymentResult.error
      ) {
        console.error("RESERVATION LIST RELATED LOOKUP ERROR:", {
          partnerError: partnerResult.error,
          bayError: bayResult.error,
          packageError: packageResult.error,
          reservationTaskError: reservationTaskResult.error,
          checkoutError: checkoutResult.error,
          settlementPaymentError: settlementPaymentResult.error,
        });
        setError("예약 연관 정보를 불러오지 못했습니다.");
        setIsLoading(false);
        return;
      }

      const reservationTaskRows = reservationTaskResult.data ?? [];
      const taskIds = uniqueValues(
        reservationTaskRows.map((taskRow) => taskRow.task_id),
      );
      const taskResult =
        taskIds.length > 0
          ? await supabase
              .from("self_maintenance_tasks")
              .select("id,name")
              .in("id", taskIds)
              .returns<SelfMaintenanceTaskRow[]>()
          : { data: [], error: null };

      if (cancelled) {
        return;
      }

      if (taskResult.error) {
        console.error("RESERVATION LIST TASK LOOKUP ERROR:", taskResult.error);
        setError("예약 작업 정보를 불러오지 못했습니다.");
        setIsLoading(false);
        return;
      }

      const partnerNames = new Map(
        (partnerResult.data ?? []).map((partner) => [partner.id, partner.name]),
      );
      const bayNames = new Map((bayResult.data ?? []).map((bay) => [bay.id, bay.name]));
      const packageNames = new Map(
        (packageResult.data ?? []).map((servicePackage) => [
          servicePackage.id,
          servicePackage.name,
        ]),
      );
      const taskNames = new Map(
        (taskResult.data ?? []).map((task) => [task.id, task.name]),
      );
      const taskLabels = new Map<string, string>();
      const checkoutTotals = new Map(
        (checkoutResult.data ?? []).map((checkout) => [
          checkout.reservation_id,
          toNumber(checkout.total_settlement),
        ]),
      );
      const latestSettlementPayments = new Map<string, SettlementPaymentRow>();

      reservationTaskRows.forEach((taskRow) => {
        const taskName = taskNames.get(taskRow.task_id);

        if (!taskName) {
          return;
        }

        const currentLabel = taskLabels.get(taskRow.reservation_id);
        taskLabels.set(
          taskRow.reservation_id,
          currentLabel ? `${currentLabel}, ${taskName}` : taskName,
        );
      });

      (settlementPaymentResult.data ?? []).forEach((payment) => {
        if (!latestSettlementPayments.has(payment.reservation_id)) {
          latestSettlementPayments.set(payment.reservation_id, payment);
        }
      });

      const settlements = new Map<string, SettlementSummary>();

      reservationRows.forEach((reservation) => {
        if (reservation.status !== "COMPLETED") {
          return;
        }

        const totalSettlement = checkoutTotals.get(reservation.id);

        if (totalSettlement === undefined) {
          return;
        }

        const amountDue = Math.max(0, totalSettlement - toNumber(reservation.total_price));
        const settlementPayment = latestSettlementPayments.get(reservation.id);
        const paidAmount =
          settlementPayment?.status === "SETTLEMENT_CONFIRMED"
            ? Math.min(amountDue, toNumber(settlementPayment.amount))
            : 0;

        settlements.set(reservation.id, {
          amountDue,
          paidAmount,
          status: settlementPayment?.status ?? null,
        });
      });

      setReservations(
        reservationRows.map((reservation) =>
          mapReservationItem(reservation, {
            partnerNames,
            bayNames,
            packageNames,
            taskLabels,
            settlements,
          }),
        ),
      );
      setIsLoading(false);
    }

    void loadReservations();

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold text-zinc-900">예약</h1>
        <div className="rounded-3xl bg-white p-5 text-sm text-zinc-500 shadow-sm">
          예약 내역을 불러오는 중입니다.
        </div>
      </section>
    );
  }

  if (needsLogin) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold text-zinc-900">예약</h1>
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm leading-6 text-zinc-600">
            내 예약 내역은 로그인 후 확인할 수 있습니다.
          </p>
          <Link
            href="/login?next=/reservation"
            className="mt-4 flex h-11 items-center justify-center rounded-2xl bg-zinc-950 text-sm font-semibold text-white"
          >
            로그인하고 예약 보기
          </Link>
        </div>
      </section>
    );
  }

  const upcomingReservations = reservations.filter((item) =>
    ["CONFIRMED", "CHECKED_IN", "IN_USE"].includes(item.status),
  );
  const pastReservations = reservations.filter((item) =>
    ["COMPLETED", "CANCELLED"].includes(item.status),
  );

  return (
    <>
      {error ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
      <ReservationListClient
        upcomingReservations={upcomingReservations}
        pastReservations={pastReservations}
      />
    </>
  );
}
