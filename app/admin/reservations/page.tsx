import {
  formatAdminCurrency,
  formatAdminDateTime,
  getAdminReservations,
  type AdminReservationItem,
  type AdminReservationStatus,
  type AdminReservationType,
} from "../_lib/admin-data";
import Link from "next/link";

type ReservationFilter = "all" | "open-issues" | "clean";

interface AdminReservationsPageProps {
  searchParams?: Promise<{
    filter?: string | string[];
  }>;
}

function normalizeFilter(value: string | string[] | undefined): ReservationFilter {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (rawValue === "open-issues" || rawValue === "clean") {
    return rawValue;
  }

  return "all";
}

function filterReservations(
  reservations: AdminReservationItem[],
  filter: ReservationFilter,
): AdminReservationItem[] {
  switch (filter) {
    case "open-issues":
      return reservations.filter(
        (reservation) => reservation.openPartnerNoteCount > 0,
      );
    case "clean":
      return reservations.filter(
        (reservation) => reservation.openPartnerNoteCount === 0,
      );
    default:
      return reservations;
  }
}

function filterHref(filter: ReservationFilter): string {
  return filter === "all"
    ? "/admin/reservations"
    : `/admin/reservations?filter=${filter}`;
}

function filterLabel(filter: ReservationFilter): string {
  switch (filter) {
    case "open-issues":
      return "Open issues";
    case "clean":
      return "No open issues";
    default:
      return "All";
  }
}

function statusClass(status: AdminReservationStatus): string {
  if (status === "CONFIRMED") {
    return "bg-blue-50 text-blue-700 ring-blue-200";
  }

  if (status === "CHECKED_IN" || status === "IN_USE") {
    return "bg-cyan-50 text-cyan-700 ring-cyan-200";
  }

  if (status === "COMPLETED") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function typeLabel(type: AdminReservationType): string {
  return type === "SELF_SERVICE" ? "Self" : "Shop";
}

function paymentClass(status: string | null): string {
  if (status === "RESERVATION_CONFIRMED") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (status === "REFUNDED") {
    return "bg-slate-100 text-slate-700 ring-slate-200";
  }

  if (status === "REFUND_PENDING") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  return "bg-slate-100 text-slate-600 ring-slate-200";
}

export default async function AdminReservationsPage({
  searchParams,
}: AdminReservationsPageProps) {
  const resolvedSearchParams = await searchParams;
  const activeFilter = normalizeFilter(resolvedSearchParams?.filter);
  const reservations = await getAdminReservations();
  const openIssueReservations = reservations.filter(
    (reservation) => reservation.openPartnerNoteCount > 0,
  );
  const cleanReservations = reservations.filter(
    (reservation) => reservation.openPartnerNoteCount === 0,
  );
  const visibleReservations = filterReservations(reservations, activeFilter);
  const filters: Array<{ id: ReservationFilter; count: number }> = [
    { id: "all", count: reservations.length },
    { id: "open-issues", count: openIssueReservations.length },
    { id: "clean", count: cleanReservations.length },
  ];

  return (
    <section className="space-y-6 rounded-3xl bg-slate-50 p-6 text-slate-950">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-700">
          Reservations
        </p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
          Reservation Monitor
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          최근 100개 예약을 기준으로 상태, 베이, 버퍼 블로킹 시간을 확인합니다.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Total
          </p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">
            {reservations.length}
          </p>
          <p className="mt-1 text-sm text-slate-600">최근 예약 조회 범위</p>
        </div>
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">
            Open issues
          </p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">
            {openIssueReservations.length}
          </p>
          <p className="mt-1 text-sm text-rose-700">
            미해결 현장 메모가 있는 예약
          </p>
        </div>
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Visible
          </p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">
            {visibleReservations.length}
          </p>
          <p className="mt-1 text-sm text-emerald-700">
            {filterLabel(activeFilter)} 필터 적용 중
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => {
          const isActive = activeFilter === filter.id;

          return (
            <Link
              key={filter.id}
              href={filterHref(filter.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 transition ${
                isActive
                  ? "bg-cyan-600 text-white ring-cyan-600"
                  : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-100"
              }`}
            >
              {filterLabel(filter.id)} ({filter.count})
            </Link>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1320px] border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4">Type</th>
              <th className="px-4 py-4">Partner</th>
              <th className="px-4 py-4">Bay</th>
              <th className="px-4 py-4">Vehicle</th>
              <th className="px-4 py-4">Time</th>
              <th className="px-4 py-4">Blocked</th>
              <th className="px-4 py-4 text-right">Price</th>
              <th className="px-4 py-4">Payment</th>
              <th className="px-4 py-4">Issues</th>
              <th className="px-4 py-4">Reservation ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {visibleReservations.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-slate-500">
                  조건에 맞는 예약 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              visibleReservations.map((reservation) => (
                <tr key={reservation.id} className="text-slate-800">
                  <td className="whitespace-nowrap px-4 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusClass(
                        reservation.status,
                      )}`}
                    >
                      {reservation.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">{typeLabel(reservation.reservationType)}</td>
                  <td className="min-w-32 px-4 py-4">{reservation.partnerName}</td>
                  <td className="min-w-24 px-4 py-4">{reservation.bayName}</td>
                  <td className="min-w-56 px-4 py-4">{reservation.vehicleLabel}</td>
                  <td className="whitespace-nowrap px-4 py-4">
                    {formatAdminDateTime(reservation.startTime)} -{" "}
                    {formatAdminDateTime(reservation.endTime)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    {formatAdminDateTime(reservation.blockedUntil)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-right">
                    {formatAdminCurrency(reservation.totalPrice)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${paymentClass(
                        reservation.reservationPaymentStatus,
                      )}`}
                    >
                      {reservation.reservationPaymentStatus ?? "No payment"}
                    </span>
                    {reservation.reservationRefundedAt ? (
                      <p className="mt-1 text-xs text-slate-500">
                        {formatAdminDateTime(reservation.reservationRefundedAt)}
                      </p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    {reservation.openPartnerNoteCount > 0 ? (
                      <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                        Open {reservation.openPartnerNoteCount}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                  <td className="max-w-64 truncate px-4 py-4 font-mono text-xs text-slate-500">
                    <Link
                      href={`/admin/reservations/${reservation.id}`}
                      className="text-cyan-700 hover:text-cyan-600"
                    >
                      {reservation.id}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
