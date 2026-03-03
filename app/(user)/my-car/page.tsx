import { Card, Line, Pill, Screen } from "../_components/mobile-ui";

export default function MyCarPage() {
  return (
    <Screen title="My Car" subtitle="등록된 차량 정보를 관리하세요.">
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">대표 차량</h2>
          <Pill label="ACTIVE" tone="accent" />
        </div>
        <div className="rounded-2xl bg-zinc-100 p-4">
          <Line widthClass="w-2/5" />
          <div className="mt-3 flex items-end justify-between">
            <p className="text-lg font-semibold text-zinc-900">12가 3456</p>
            <p className="text-xs text-zinc-500">SUV</p>
          </div>
        </div>
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-900">차량 목록</h3>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="rounded-xl border border-zinc-200 p-3">
              <Line widthClass="w-1/2" />
            </div>
          ))}
        </div>
      </Card>
    </Screen>
  );
}
