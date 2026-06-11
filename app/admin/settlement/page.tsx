import {
  formatAdminCurrency,
  formatAdminDateTime,
  getAdminSettlements,
} from "../_lib/admin-data";
import Link from "next/link";

export default async function AdminSettlementPage() {
  const settlements = await getAdminSettlements();

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
              <th className="px-4 py-4">Evidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {settlements.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  정산 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              settlements.map((settlement) => (
                <tr key={settlement.reservationId} className="text-slate-200">
                  <td className="px-4 py-4">
                    {formatAdminDateTime(settlement.completedAt)}
                  </td>
                  <td className="px-4 py-4">{settlement.partnerName}</td>
                  <td className="px-4 py-4">
                    {settlement.reservationType === "SELF_SERVICE" ? "Self" : "Shop"}
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
