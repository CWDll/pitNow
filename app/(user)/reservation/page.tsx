"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { garageList, getShopPackageById } from "@/app/(user)/_data/mock-garages";
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
  total_price: number;
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

function mapReservationItem(reservation: ReservationRow): ReservationListItem {
  const garage = garageList.find((item) => item.id === reservation.partner_id);
  const vehicle = Array.isArray(reservation.vehicles)
    ? reservation.vehicles[0] ?? null
    : reservation.vehicles;
  const workTitle =
    reservation.reservation_type === "SELF_SERVICE"
      ? "셀프 정비"
      : getShopPackageById(reservation.package_id ?? "")?.name ?? "전문가 맡기기";
  const bayIndex = garage?.bayIds.findIndex((bayId) => bayId === reservation.bay_id) ?? -1;
  const bayLabel =
    reservation.reservation_type === "SELF_SERVICE" && bayIndex >= 0 ? `${bayIndex + 1}번 베이` : undefined;
  const blockedMinutes = Math.max(
    30,
    Math.round(
      (new Date(reservation.reserved_end_time).getTime() - new Date(reservation.start_time).getTime()) /
        (1000 * 60),
    ),
  );

  return {
    id: reservation.id,
    garageName: garage?.name ?? "정비소",
    workTitle,
    dateLabel: formatKstDateTimeRange(reservation.start_time, reservation.end_time),
    bayLabel,
    reservationType: reservation.reservation_type,
    status: reservation.status,
    totalPrice: reservation.total_price,
    startTime: reservation.start_time,
    endTime: reservation.end_time,
    blockedMinutes,
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

      setReservations((data ?? []).map(mapReservationItem));
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
