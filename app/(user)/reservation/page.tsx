import { garageList, getShopPackageById } from "@/app/(user)/_data/mock-garages";
import { hasSupabaseEnv, supabase } from "@/src/lib/supabase";

import ReservationListClient, { type ReservationListItem } from "./reservation-list-client";

const MOCK_USER_ID = "00000000-0000-0000-0000-000000000001";

type ReservationStatus = "CONFIRMED" | "CHECKED_IN" | "IN_USE" | "COMPLETED" | "CANCELLED";
type ReservationType = "SELF_SERVICE" | "SHOP_SERVICE";

interface ReservationRow {
  id: string;
  partner_id: string;
  bay_id: string;
  reservation_type: ReservationType;
  package_id: string | null;
  start_time: string;
  end_time: string;
  reserved_end_time: string;
  status: ReservationStatus;
  total_price: number;
}

function formatDateLabel(startTime: string, endTime: string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "예약 시간 정보 없음";
  }

  const weekday = ["일", "월", "화", "수", "목", "금", "토"][start.getDay()];
  const formatTime = (date: Date) =>
    `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

  return `${start.getMonth() + 1}/${start.getDate()}(${weekday}) ${formatTime(start)} - ${formatTime(end)}`;
}

async function getReservationItems(): Promise<ReservationListItem[]> {
  if (!hasSupabaseEnv) {
    return [];
  }

  const { data, error } = await supabase
    .from("reservations")
    .select("id, partner_id, bay_id, reservation_type, package_id, start_time, end_time, reserved_end_time, status, total_price")
    .eq("user_id", MOCK_USER_ID)
    .order("start_time", { ascending: false })
    .returns<ReservationRow[]>();

  if (error) {
    console.error("RESERVATION LIST LOOKUP ERROR:", error);
    return [];
  }

  return (data ?? []).map((reservation) => {
    const garage = garageList.find((item) => item.id === reservation.partner_id);
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
      dateLabel: formatDateLabel(reservation.start_time, reservation.end_time),
      bayLabel,
      reservationType: reservation.reservation_type,
      status: reservation.status,
      totalPrice: reservation.total_price,
      startTime: reservation.start_time,
      endTime: reservation.end_time,
      blockedMinutes,
    };
  });
}

export default async function ReservationListPage() {
  const reservations = await getReservationItems();
  const upcomingReservations = reservations.filter((item) =>
    ["CONFIRMED", "CHECKED_IN", "IN_USE"].includes(item.status),
  );
  const pastReservations = reservations.filter((item) =>
    ["COMPLETED", "CANCELLED"].includes(item.status),
  );

  return (
    <ReservationListClient
      upcomingReservations={upcomingReservations}
      pastReservations={pastReservations}
    />
  );
}
