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
  getAdminOverviewMetrics,
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

type MetricRange = "today" | "week" | "month" | "3months" | "6months" | "year";

interface AdminHomePageProps {
  searchParams?: Promise<{ range?: string | string[] }>;
}

const rangeOptions: Array<{ id: MetricRange; label: string }> = [
  { id: "today", label: "오늘" },
  { id: "week", label: "이번 주" },
  { id: "month", label: "이번 달" },
  { id: "3months", label: "3개월" },
  { id: "6months", label: "6개월" },
  { id: "year", label: "이번 년도" },
];

function normalizeRange(value: string | string[] | undefined): MetricRange {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return rangeOptions.some((option) => option.id === rawValue)
    ? (rawValue as MetricRange)
    : "month";
}

function rangeStart(range: MetricRange) {
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  const kstNow = new Date(Date.now() + kstOffsetMs);
  const start = new Date(
    Date.UTC(
      kstNow.getUTCFullYear(),
      kstNow.getUTCMonth(),
      kstNow.getUTCDate(),
    ),
  );

  if (range === "week") {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  } else if (range === "month") {
    start.setUTCDate(1);
  } else if (range === "3months" || range === "6months") {
    start.setUTCMonth(
      start.getUTCMonth() - (range === "3months" ? 3 : 6),
    );
  } else if (range === "year") {
    start.setUTCMonth(0, 1);
  }

  return start.getTime() - kstOffsetMs;
}

export default async function AdminHomePage({
  searchParams,
}: AdminHomePageProps) {
  const resolvedSearchParams = await searchParams;
  const activeRange = normalizeRange(resolvedSearchParams?.range);
  const startedAt = rangeStart(activeRange);
  const metrics = await getAdminOverviewMetrics(
    new Date(startedAt).toISOString(),
  );

  return (
    <section className="space-y-6">
      <header className="flex items-end justify-between gap-6 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-bold text-blue-700">운영 지표</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">
            서비스 운영 현황
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            예약부터 결제와 정산까지 주요 운영 지표를 확인합니다.
          </p>
        </div>
      </header>

      <nav className="flex w-fit gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        {rangeOptions.map((option) => (
          <Link
            key={option.id}
            href={`/admin?range=${option.id}`}
            className={`rounded-md px-4 py-2 text-sm font-bold transition ${
              activeRange === option.id
                ? "bg-slate-950 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-4 gap-3">
        {metricCard(
          "진행·예정 예약",
          String(metrics.activeReservations),
          "예약 확정 · 체크인 · 이용 중",
        )}
        {metricCard(
          "기간 내 예약 등록",
          String(metrics.periodReservations),
          rangeOptions.find((option) => option.id === activeRange)?.label ?? "",
        )}
        {metricCard(
          "승인 매출",
          formatAdminCurrency(metrics.approvedRevenue),
          `결제 승인 ${metrics.approvedPaymentCount}건`,
        )}
        {metricCard(
          "완료 / 환불",
          `${metrics.completedSettlements} / ${metrics.refundedPayments}`,
          "정산 완료 건 / 환불 건",
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
