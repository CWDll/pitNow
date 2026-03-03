import { Card, Line, Pill, Screen } from "../_components/mobile-ui";

export default function ReservationPage() {
  return (
    <Screen title="Reservation" subtitle="날짜/시간/베이를 선택해 예약을 진행하세요.">
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">날짜 선택</h2>
          <Pill label="30min slot" />
        </div>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 14 }).map((_, idx) => (
            <div key={idx} className="h-9 rounded-lg bg-zinc-100" />
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-900">시간대</h3>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, idx) => (
            <span key={idx} className="rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-600">
              0{idx}:00
            </span>
          ))}
        </div>
      </Card>

      <Card className="space-y-2">
        <Line />
        <Line widthClass="w-2/3" />
      </Card>
    </Screen>
  );
}
