import {
  formatAdminCurrency,
  getAdminPackages,
} from "../_lib/admin-data";

export default async function AdminPackagesPage() {
  const packages = await getAdminPackages();

  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">
          Packages
        </p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white">
          Partner Package Pricing
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          파트너별 Shop Service 패키지 가격과 활성 상태를 확인합니다. 편집 기능은 이후 단계에서 추가합니다.
        </p>
      </header>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.18em] text-slate-400">
            <tr>
              <th className="px-4 py-4">Partner</th>
              <th className="px-4 py-4">Package</th>
              <th className="px-4 py-4 text-right">Duration</th>
              <th className="px-4 py-4 text-right">Labor Price</th>
              <th className="px-4 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {packages.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  패키지 가격 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              packages.map((item) => (
                <tr
                  key={`${item.partnerName}-${item.packageName}-${item.laborPrice}`}
                  className="text-slate-200"
                >
                  <td className="px-4 py-4">{item.partnerName}</td>
                  <td className="px-4 py-4">{item.packageName}</td>
                  <td className="px-4 py-4 text-right">
                    {item.durationMinutes}분
                  </td>
                  <td className="px-4 py-4 text-right">
                    {formatAdminCurrency(item.laborPrice)}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                        item.isActive
                          ? "bg-emerald-400/15 text-emerald-200 ring-emerald-300/30"
                          : "bg-slate-400/15 text-slate-200 ring-slate-300/30"
                      }`}
                    >
                      {item.isActive ? "Active" : "Inactive"}
                    </span>
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
