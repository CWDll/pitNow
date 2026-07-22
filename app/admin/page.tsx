import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CreditCard,
  PackageSearch,
  ReceiptText,
} from "lucide-react";

import {
  formatAdminCurrency,
  getAdminPayments,
  getAdminReservations,
  getAdminSettlements,
} from "./_lib/admin-data";

function metricCard(label: string, value: string, helper: string) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
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
    <section className="space-y-6">
      <header className="flex items-end justify-between gap-6 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-bold text-blue-700">OPERATIONS OVERVIEW</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">
            서비스 운영 현황
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            예약부터 결제와 정산까지 주요 운영 지표를 확인합니다.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-3">
        {metricCard(
          "Active",
          String(activeReservations.length),
          "CONFIRMED / CHECKED_IN / IN_USE",
        )}
        {metricCard("Completed", String(settlements.length), "Checkout rows")}
        {metricCard(
          "Settlement",
          formatAdminCurrency(settlementTotal),
          "Total completed settlement",
        )}
        {metricCard(
          "Payments",
          String(paymentAttention.length),
          "Need attention",
        )}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">업무 바로가기</h3>
          <p className="text-xs text-slate-500">자주 확인하는 운영 메뉴</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              href: "/admin/reservations",
              title: "예약 관리",
              text: "예약 타입, 상태, 베이, 버퍼 시간을 확인합니다.",
              icon: CalendarDays,
            },
            {
              href: "/admin/settlement",
              title: "정산 관리",
              text: "체크아웃 정산과 체크리스트 증적 상태를 봅니다.",
              icon: ReceiptText,
            },
            {
              href: "/admin/payments",
              title: "결제 관리",
              text: "READY, 실패, 취소, 환불 확인 필요 상태를 추적합니다.",
              icon: CreditCard,
            },
            {
              href: "/admin/packages",
              title: "패키지 관리",
              text: "파트너별 패키지 가격과 활성 상태를 확인합니다.",
              icon: PackageSearch,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/50"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-700">
                  <Icon size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-950">
                    {item.title}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {item.text}
                  </span>
                </span>
                <ArrowRight
                  size={18}
                  className="text-slate-400 group-hover:text-blue-600"
                />
              </Link>
            );
          })}
        </div>
      </section>
    </section>
  );
}
