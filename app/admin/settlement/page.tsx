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

function normalizeFilter(
  value: string | string[] | undefined,
): SettlementFilter {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (
    rawValue === "due" ||
    rawValue === "attention" ||
    rawValue === "evidence"
  ) {
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

function isFailedOrCancelledSettlement(
  settlement: AdminSettlementItem,
): boolean {
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
      return settlements.filter(
        (settlement) => getUnpaidAmount(settlement) > 0,
      );
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
  return filter === "all"
    ? "/admin/settlement"
    : `/admin/settlement?filter=${filter}`;
}

function filterLabel(filter: SettlementFilter): string {
  switch (filter) {
    case "due":
      return "추가 결제 있음";
    case "attention":
      return "결제 확인 필요";
    case "evidence":
      return "증적 검토 필요";
    default:
      return "전체";
  }
}

function metricCard(label: string, value: string, description: string) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
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
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-700">
          정산 관리
        </p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
          체크아웃 정산
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          최근 100개 체크아웃의 기본요금, 초과요금, 작업 확인 비용과 증적 완료 여부를
          확인합니다.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-4">
        {metricCard(
          "추가 결제 미수",
          formatAdminCurrency(totalDueAmount),
          `${dueSettlements.length}건의 추가 정산 미수`,
        )}
        {metricCard(
          "결제 확인 필요",
          String(attentionSettlements.length),
          "결제 실패/취소/미완료 확인 필요",
        )}
        {metricCard(
          "증적 검토 필요",
          String(evidenceReviewSettlements.length),
          "체크아웃 증적 미완료",
        )}
        {metricCard(
          "검색 결과",
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
                  ? "bg-cyan-600 text-white ring-cyan-600"
                  : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-100"
              }`}
            >
              {filterLabel(filter.id)} ({filter.count})
            </Link>
          );
        })}
      </nav>

      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1120px] w-full border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="px-4 py-4">완료 시각</th>
              <th className="px-4 py-4">정비소</th>
              <th className="px-4 py-4">방식</th>
              <th className="px-4 py-4 text-right">기본 금액</th>
              <th className="px-4 py-4 text-right">추가 요금</th>
              <th className="px-4 py-4 text-right">작업 확인 비용</th>
              <th className="px-4 py-4 text-right">총 정산</th>
              <th className="px-4 py-4 text-right">결제 완료</th>
              <th className="px-4 py-4 text-right">미수 금액</th>
              <th className="px-4 py-4">추가 결제</th>
              <th className="px-4 py-4">체크아웃 증적</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {visibleSettlements.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  className="px-4 py-10 text-center text-slate-600"
                >
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
                    className={`text-slate-800 ${
                      needsAttention
                        ? "bg-rose-50 ring-1 ring-inset ring-rose-200"
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
                    <td className="px-4 py-4 text-right font-semibold text-slate-950">
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
                            ? "text-rose-700"
                            : "text-emerald-700"
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
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : failedOrCancelled
                              ? "bg-rose-50 text-rose-700 ring-rose-200"
                              : "bg-rose-50 text-rose-700 ring-rose-200"
                        }`}
                      >
                        {unpaidAmount <= 0
                          ? "추가 결제 없음"
                          : (settlement.settlementPaymentStatus ??
                            "추가 결제 필요")}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/admin/reservations/${settlement.reservationId}`}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                          settlement.evidenceComplete
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-amber-50 text-amber-700 ring-amber-200"
                        }`}
                      >
                        {settlement.evidenceComplete ? "완료" : "검토 필요"}
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
