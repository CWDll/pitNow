import {
  formatAdminCurrency,
  formatAdminDateTime,
  type AdminSettlementItem,
  getAdminSettlements,
} from "../_lib/admin-data";
import Link from "next/link";

type SettlementFilter = "all" | "due" | "attention" | "evidence";

interface AdminSettlementPageProps {
  searchParams?: Promise<{
    filter?: string | string[];
  }>;
}

function normalizeFilter(value: string | string[] | undefined): SettlementFilter {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (rawValue === "due" || rawValue === "attention" || rawValue === "evidence") {
    return rawValue;
  }

  return "all";
}

function getUnpaidAmount(settlement: AdminSettlementItem): number {
  return Math.max(
    0,
    settlement.settlementAmountDue - settlement.settlementPaidAmount,
  );
}

function needsPaymentAttention(settlement: AdminSettlementItem): boolean {
  const unpaidAmount = getUnpaidAmount(settlement);

  if (unpaidAmount <= 0) {
    return false;
  }

  return settlement.settlementPaymentStatus !== "SETTLEMENT_CONFIRMED";
}

function isFailedOrCancelledSettlement(settlement: AdminSettlementItem): boolean {
  return ["FAILED", "CANCELLED"].includes(
    settlement.settlementPaymentStatus ?? "",
  );
}

function filterSettlements(
  settlements: AdminSettlementItem[],
  filter: SettlementFilter,
): AdminSettlementItem[] {
  switch (filter) {
    case "due":
      return settlements.filter((settlement) => getUnpaidAmount(settlement) > 0);
    case "attention":
      return settlements.filter((settlement) =>
        needsPaymentAttention(settlement),
      );
    case "evidence":
      return settlements.filter((settlement) => !settlement.evidenceComplete);
    default:
      return settlements;
  }
}

function filterHref(filter: SettlementFilter): string {
  return filter === "all" ? "/admin/settlement" : `/admin/settlement?filter=${filter}`;
}

function filterLabel(filter: SettlementFilter): string {
  switch (filter) {
    case "due":
      return "Due only";
    case "attention":
      return "Payment attention";
    case "evidence":
      return "Evidence review";
    default:
      return "All";
  }
}

function metricCard(label: string, value: string, description: string) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{description}</p>
    </div>
  );
}

export default async function AdminSettlementPage({
  searchParams,
}: AdminSettlementPageProps) {
  const resolvedSearchParams = await searchParams;
  const activeFilter = normalizeFilter(resolvedSearchParams?.filter);
  const settlements = await getAdminSettlements();
  const visibleSettlements = filterSettlements(settlements, activeFilter);
  const dueSettlements = settlements.filter(
    (settlement) => getUnpaidAmount(settlement) > 0,
  );
  const attentionSettlements = settlements.filter((settlement) =>
    needsPaymentAttention(settlement),
  );
  const evidenceReviewSettlements = settlements.filter(
    (settlement) => !settlement.evidenceComplete,
  );
  const totalDueAmount = dueSettlements.reduce(
    (sum, settlement) => sum + getUnpaidAmount(settlement),
    0,
  );
  const filters: Array<{
    id: SettlementFilter;
    count: number;
  }> = [
    { id: "all", count: settlements.length },
    { id: "due", count: dueSettlements.length },
    { id: "attention", count: attentionSettlements.length },
    { id: "evidence", count: evidenceReviewSettlements.length },
  ];

  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">
          Settlement
        </p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white">
          Checkout Settlement
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          최근 100개 체크아웃의 기본요금, 초과요금, 검수비와 증적 완료 여부를 확인합니다.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-4">
        {metricCard(
          "Open due",
          formatAdminCurrency(totalDueAmount),
          `${dueSettlements.length}건의 추가 정산 미수`,
        )}
        {metricCard(
          "Payment attention",
          String(attentionSettlements.length),
          "결제 실패/취소/미완료 확인 필요",
        )}
        {metricCard(
          "Evidence review",
          String(evidenceReviewSettlements.length),
          "체크아웃 증적 미완료",
        )}
        {metricCard(
          "Visible",
          String(visibleSettlements.length),
          `${filterLabel(activeFilter)} 필터 적용 중`,
        )}
      </div>

      <nav className="flex flex-wrap gap-2">
        {filters.map((filter) => {
          const isActive = activeFilter === filter.id;

          return (
            <Link
              key={filter.id}
              href={filterHref(filter.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 transition ${
                isActive
                  ? "bg-cyan-300 text-slate-950 ring-cyan-200"
                  : "bg-white/[0.04] text-slate-300 ring-white/10 hover:bg-white/[0.08]"
              }`}
            >
              {filterLabel(filter.id)} ({filter.count})
            </Link>
          );
        })}
      </nav>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.18em] text-slate-400">
            <tr>
              <th className="px-4 py-4">Completed</th>
              <th className="px-4 py-4">Partner</th>
              <th className="px-4 py-4">Type</th>
              <th className="px-4 py-4 text-right">Base</th>
              <th className="px-4 py-4 text-right">Extra</th>
              <th className="px-4 py-4 text-right">Verify</th>
              <th className="px-4 py-4 text-right">Total</th>
              <th className="px-4 py-4 text-right">Paid</th>
              <th className="px-4 py-4 text-right">Due</th>
              <th className="px-4 py-4">Payment</th>
              <th className="px-4 py-4">Evidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {visibleSettlements.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-slate-400">
                  {settlements.length === 0
                    ? "정산 데이터가 없습니다."
                    : "현재 필터에 해당하는 정산 데이터가 없습니다."}
                </td>
              </tr>
            ) : (
              visibleSettlements.map((settlement) => {
                const unpaidAmount = getUnpaidAmount(settlement);
                const needsAttention = needsPaymentAttention(settlement);
                const failedOrCancelled =
                  isFailedOrCancelledSettlement(settlement);

                return (
                  <tr
                    key={settlement.reservationId}
                    className={`text-slate-200 ${
                      needsAttention
                        ? "bg-rose-500/[0.06] ring-1 ring-inset ring-rose-300/10"
                        : ""
                    }`}
                  >
                    <td className="px-4 py-4">
                      {formatAdminDateTime(settlement.completedAt)}
                    </td>
                    <td className="px-4 py-4">{settlement.partnerName}</td>
                    <td className="px-4 py-4">
                      {settlement.reservationType === "SELF_SERVICE"
                        ? "Self"
                        : "Shop"}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {formatAdminCurrency(settlement.basePrice)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {formatAdminCurrency(settlement.extraFee)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {formatAdminCurrency(settlement.helperVerifyFee)}
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-white">
                      {formatAdminCurrency(settlement.totalSettlement)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {formatAdminCurrency(
                        settlement.reservationPaidAmount +
                          settlement.settlementPaidAmount,
                      )}
                    </td>
                    <td className="px-4 py-4 text-right font-semibold">
                      <span
                        className={
                          unpaidAmount > 0
                            ? "text-rose-200"
                            : "text-emerald-200"
                        }
                      >
                        {formatAdminCurrency(unpaidAmount)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                          unpaidAmount <= 0 ||
                          settlement.settlementPaymentStatus ===
                            "SETTLEMENT_CONFIRMED"
                            ? "bg-emerald-400/15 text-emerald-200 ring-emerald-300/30"
                            : failedOrCancelled
                              ? "bg-red-500/20 text-red-100 ring-red-300/40"
                              : "bg-rose-400/15 text-rose-100 ring-rose-300/30"
                        }`}
                      >
                        {unpaidAmount <= 0
                          ? "No due"
                          : settlement.settlementPaymentStatus ??
                            "Settlement due"}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/admin/reservations/${settlement.reservationId}`}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                          settlement.evidenceComplete
                            ? "bg-emerald-400/15 text-emerald-200 ring-emerald-300/30"
                            : "bg-amber-400/15 text-amber-100 ring-amber-300/30"
                        }`}
                      >
                        {settlement.evidenceComplete ? "Complete" : "Review"}
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
