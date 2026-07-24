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
type ReservationSort = "created-desc" | "start-asc" | "start-desc";

interface AdminReservationsPageProps {
  searchParams?: Promise<{
    endDate?: string | string[];
    filter?: string | string[];
    partner?: string | string[];
    sort?: string | string[];
    startDate?: string | string[];
  }>;
}

function normalizeFilter(value: string | string[] | undefined): ReservationFilter {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (rawValue === "open-issues" || rawValue === "clean") {
    return rawValue;
  }

  return "all";
}

function normalizeSort(value: string | string[] | undefined): ReservationSort {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (rawValue === "start-asc" || rawValue === "start-desc") {
    return rawValue;
  }

  return "created-desc";
}

function normalizeStringParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function formatKstDateValue(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function kstDateStartIso(value: string): string | undefined {
  if (!value) return undefined;
  const timestamp = new Date(`${value}T00:00:00+09:00`);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp.toISOString();
}

function kstDateEndExclusiveIso(value: string): string | undefined {
  const start = kstDateStartIso(value);
  return start
    ? new Date(new Date(start).getTime() + 24 * 60 * 60 * 1000).toISOString()
    : undefined;
}

function filterReservations(
  reservations: AdminReservationItem[],
  filter: ReservationFilter,
  partnerQuery: string,
  startDateQuery: string,
  endDateQuery: string,
): AdminReservationItem[] {
  const normalizedPartnerQuery = partnerQuery.toLowerCase();
  const baseReservations = reservations.filter((reservation) => {
    if (
      normalizedPartnerQuery &&
      !reservation.partnerName.toLowerCase().includes(normalizedPartnerQuery)
    ) {
      return false;
    }

    const reservationDate = formatKstDateValue(reservation.startTime);
    if (startDateQuery && reservationDate < startDateQuery) {
      return false;
    }

    if (endDateQuery && reservationDate > endDateQuery) {
      return false;
    }

    return true;
  });

  switch (filter) {
    case "open-issues":
      return baseReservations.filter(
        (reservation) => reservation.openPartnerNoteCount > 0,
      );
    case "clean":
      return baseReservations.filter(
        (reservation) => reservation.openPartnerNoteCount === 0,
      );
    default:
      return baseReservations;
  }
}

function sortReservations(
  reservations: AdminReservationItem[],
  sort: ReservationSort,
): AdminReservationItem[] {
  return [...reservations].sort((a, b) => {
    if (sort === "start-asc") {
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    }

    if (sort === "start-desc") {
      return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
    }

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function filterHref(
  filter: ReservationFilter,
  params: {
    endDate: string;
    partner: string;
    sort: ReservationSort;
    startDate: string;
  },
): string {
  const query = new URLSearchParams();

  if (filter !== "all") {
    query.set("filter", filter);
  }

  if (params.partner) {
    query.set("partner", params.partner);
  }

  if (params.startDate) {
    query.set("startDate", params.startDate);
  }

  if (params.endDate) {
    query.set("endDate", params.endDate);
  }

  if (params.sort !== "created-desc") {
    query.set("sort", params.sort);
  }

  const queryString = query.toString();
  return queryString ? `/admin/reservations?${queryString}` : "/admin/reservations";
}

function filterLabel(filter: ReservationFilter): string {
  switch (filter) {
    case "open-issues":
      return "미해결 이슈";
    case "clean":
      return "이슈 없음";
    default:
      return "전체";
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
  return type === "SELF_SERVICE" ? "셀프 정비" : "정비 맡기기";
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
  const activeSort = normalizeSort(resolvedSearchParams?.sort);
  const partnerQuery = normalizeStringParam(resolvedSearchParams?.partner);
  const startDateQuery = normalizeStringParam(resolvedSearchParams?.startDate);
  const requestedEndDateQuery = normalizeStringParam(
    resolvedSearchParams?.endDate,
  );
  const endDateQuery = requestedEndDateQuery || startDateQuery;
  const reservations = await getAdminReservations(
    startDateQuery || endDateQuery
      ? {
          startTimeInclusive: kstDateStartIso(startDateQuery),
          endTimeExclusive: kstDateEndExclusiveIso(endDateQuery),
        }
      : undefined,
  );
  const openIssueReservations = reservations.filter(
    (reservation) => reservation.openPartnerNoteCount > 0,
  );
  const cleanReservations = reservations.filter(
    (reservation) => reservation.openPartnerNoteCount === 0,
  );
  const visibleReservations = sortReservations(
    filterReservations(
      reservations,
      activeFilter,
      partnerQuery,
      startDateQuery,
      endDateQuery,
    ),
    activeSort,
  );
  const filterParams = {
    endDate: requestedEndDateQuery,
    partner: partnerQuery,
    sort: activeSort,
    startDate: startDateQuery,
  };
  const filters: Array<{ id: ReservationFilter; count: number }> = [
    { id: "all", count: reservations.length },
    { id: "open-issues", count: openIssueReservations.length },
    { id: "clean", count: cleanReservations.length },
  ];

  return (
    <section className="space-y-6 text-slate-950">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-700">
          예약 관리
        </p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
          예약 현황
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          최근 100개 예약을 기준으로 상태, 정비소, 이용 시간을 확인합니다.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            조회 대상
          </p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">
            {reservations.length}
          </p>
          <p className="mt-1 text-sm text-slate-600">최근 예약 조회 범위</p>
        </div>
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">
            미해결 이슈
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
            검색 결과
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
              href={filterHref(filter.id, filterParams)}
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

      <form
        action="/admin/reservations"
        className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm xl:grid-cols-[1fr_180px_180px_220px_auto]"
      >
        {activeFilter !== "all" ? (
          <input type="hidden" name="filter" value={activeFilter} />
        ) : null}
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            정비소
          </span>
          <input
            name="partner"
            defaultValue={partnerQuery}
            placeholder="정비소 이름"
            className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-900 outline-none ring-cyan-100 focus:ring-4"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            시작일
          </span>
          <input
            type="date"
            name="startDate"
            defaultValue={startDateQuery}
            className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-900 outline-none ring-cyan-100 focus:ring-4"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            종료일
          </span>
          <input
            type="date"
            name="endDate"
            min={startDateQuery || undefined}
            defaultValue={requestedEndDateQuery}
            className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-900 outline-none ring-cyan-100 focus:ring-4"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            정렬
          </span>
          <select
            name="sort"
            defaultValue={activeSort}
            className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-900 outline-none ring-cyan-100 focus:ring-4"
          >
            <option value="created-desc">최근 생성순</option>
            <option value="start-asc">예약 시간 빠른순</option>
            <option value="start-desc">예약 시간 늦은순</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="h-11 rounded-2xl bg-cyan-600 px-5 text-sm font-semibold text-white transition hover:bg-cyan-500"
          >
            검색
          </button>
          <Link
            href="/admin/reservations"
            className="flex h-11 items-center rounded-2xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            초기화
          </Link>
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1180px] border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-4 py-4">상태</th>
              <th className="px-4 py-4">방식</th>
              <th className="px-4 py-4">정비소</th>
              <th className="px-4 py-4">베이</th>
              <th className="px-4 py-4">차량</th>
              <th className="px-4 py-4">이용 시간</th>
              <th className="px-4 py-4 text-right">예약 금액</th>
              <th className="px-4 py-4">결제</th>
              <th className="px-4 py-4">이슈</th>
              <th className="px-4 py-4">예약 ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {visibleReservations.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
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
                  <td className="whitespace-nowrap px-4 py-4 text-right">
                    {formatAdminCurrency(reservation.totalPrice)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${paymentClass(
                        reservation.reservationPaymentStatus,
                      )}`}
                    >
                      {reservation.reservationPaymentStatus ?? "결제 없음"}
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
                        미해결 {reservation.openPartnerNoteCount}
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
