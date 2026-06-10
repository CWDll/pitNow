import {
  formatAdminCurrency,
  formatAdminDateTime,
  getAdminReservations,
  type AdminReservationStatus,
  type AdminReservationType,
} from "../_lib/admin-data";

function statusClass(status: AdminReservationStatus): string {
  if (status === "CONFIRMED") {
    return "bg-blue-400/15 text-blue-200 ring-blue-300/30";
  }

  if (status === "CHECKED_IN" || status === "IN_USE") {
    return "bg-cyan-400/15 text-cyan-200 ring-cyan-300/30";
  }

  if (status === "COMPLETED") {
    return "bg-emerald-400/15 text-emerald-200 ring-emerald-300/30";
  }

  return "bg-slate-400/15 text-slate-200 ring-slate-300/30";
}

function typeLabel(type: AdminReservationType): string {
  return type === "SELF_SERVICE" ? "Self" : "Shop";
}

export default async function AdminReservationsPage() {
  const reservations = await getAdminReservations();

  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">
          Reservations
        </p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white">
          Reservation Monitor
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          최근 100개 예약을 기준으로 상태, 베이, 버퍼 블로킹 시간을 확인합니다.
        </p>
      </header>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.18em] text-slate-400">
            <tr>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4">Type</th>
              <th className="px-4 py-4">Partner</th>
              <th className="px-4 py-4">Bay</th>
              <th className="px-4 py-4">Vehicle</th>
              <th className="px-4 py-4">Time</th>
              <th className="px-4 py-4">Blocked</th>
              <th className="px-4 py-4 text-right">Price</th>
              <th className="px-4 py-4">Reservation ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {reservations.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                  예약 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              reservations.map((reservation) => (
                <tr key={reservation.id} className="text-slate-200">
                  <td className="px-4 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusClass(
                        reservation.status,
                      )}`}
                    >
                      {reservation.status}
                    </span>
                  </td>
                  <td className="px-4 py-4">{typeLabel(reservation.reservationType)}</td>
                  <td className="px-4 py-4">{reservation.partnerName}</td>
                  <td className="px-4 py-4">{reservation.bayName}</td>
                  <td className="px-4 py-4">{reservation.vehicleLabel}</td>
                  <td className="px-4 py-4">
                    {formatAdminDateTime(reservation.startTime)} -{" "}
                    {formatAdminDateTime(reservation.endTime)}
                  </td>
                  <td className="px-4 py-4">
                    {formatAdminDateTime(reservation.blockedUntil)}
                  </td>
                  <td className="px-4 py-4 text-right">
                    {formatAdminCurrency(reservation.totalPrice)}
                  </td>
                  <td className="max-w-48 truncate px-4 py-4 font-mono text-xs text-slate-400">
                    {reservation.id}
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
