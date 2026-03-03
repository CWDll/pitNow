import { Card, Line, Pill, Screen } from "./_components/mobile-ui";

export default function HomePage() {
  return (
    <Screen title="Home" subtitle="가까운 제휴 주차장을 빠르게 예약하세요.">
      <Card className="space-y-3 bg-gradient-to-br from-zinc-900 to-zinc-700 text-white">
        <Pill label="MVP Preview" />
        <h2 className="text-xl font-semibold">PitNow Mobile</h2>
        <p className="text-sm text-zinc-200">reserve → check-in → in-use → checkout</p>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">추천 주차장</h3>
          <Pill label="5분 거리" tone="accent" />
        </div>
        <Line />
        <Line widthClass="w-3/4" />
        <Line widthClass="w-2/3" />
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-900">최근 이용</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-zinc-100 p-3" />
          <div className="rounded-xl bg-zinc-100 p-3" />
        </div>
      </Card>
    </Screen>
  );
}
