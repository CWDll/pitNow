import Link from "next/link";

import {
  formatAdminCurrency,
  getAdminPayments,
  getAdminReservations,
  getAdminSettlements,
} from "./_lib/admin-data";

function metricCard(label: string, value: string, helper: string) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/20">
      <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-3 text-4xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{helper}</p>
    </article>
  );
}

export default async function AdminHomePage() {
  const [reservations, settlements, payments] = await Promise.all([
    getAdminReservations(),
    getAdminSettlements(),
    getAdminPayments(),
  ]);

  const activeReservations = reservations.filter((item) =>
    ["CONFIRMED", "CHECKED_IN", "IN_USE"].includes(item.status),
  );
  const settlementTotal = settlements.reduce(
    (sum, item) => sum + item.totalSettlement,
    0,
  );
  const paymentAttention = payments.filter((item) =>
    ["READY", "FAILED", "CANCELLED", "REFUND_PENDING"].includes(item.status),
  );

  return (
    <section className="space-y-8">
      <header className="flex items-end justify-between gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">
            Operations
          </p>
          <h2 className="mt-3 text-5xl font-semibold tracking-tight text-white">
            Garage Loop Monitor
          </h2>
          <p className="mt-3 max-w-2xl text-base text-slate-400">
            MVP 운영 콘솔은 예약 상태, 체크아웃 정산, 패키지 가격을 분리해서 확인하는 데 집중합니다.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-white/10"
        >
          User app
        </Link>
      </header>

      <div className="grid grid-cols-4 gap-4">
        {metricCard("Active", String(activeReservations.length), "CONFIRMED / CHECKED_IN / IN_USE")}
        {metricCard("Completed", String(settlements.length), "Checkout rows")}
        {metricCard("Settlement", formatAdminCurrency(settlementTotal), "Total completed settlement")}
        {metricCard("Payments", String(paymentAttention.length), "Need attention")}
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          {
            href: "/admin/reservations",
            title: "Reservation board",
            text: "예약 타입, 상태, 베이, 버퍼 시간을 확인합니다.",
          },
          {
            href: "/admin/settlement",
            title: "Settlement board",
            text: "체크아웃 정산과 체크리스트 증적 상태를 봅니다.",
          },
          {
            href: "/admin/payments",
            title: "Payment ledger",
            text: "READY, 실패, 취소, 환불 확인 필요 상태를 추적합니다.",
          },
          {
            href: "/admin/packages",
            title: "Package pricing",
            text: "파트너별 패키지 가격과 활성 상태를 확인합니다.",
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-3xl border border-white/10 bg-slate-900 p-5 transition hover:border-cyan-300/50 hover:bg-slate-900/70"
          >
            <h3 className="text-2xl font-semibold text-white">{item.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">{item.text}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
