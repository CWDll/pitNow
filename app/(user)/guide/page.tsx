import { Card, DotGrid, Line, Pill, Screen } from "../_components/mobile-ui";

export default function GuidePage() {
  return (
    <Screen title="Guide" subtitle="체크인 전 필요한 단계를 확인하세요.">
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">체크인 가이드</h2>
          <Pill label="4 Photos" tone="accent" />
        </div>
        <Line />
        <Line widthClass="w-5/6" />
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-900">촬영 영역 안내</h3>
        <DotGrid />
      </Card>

      <Card className="space-y-2">
        <Line />
        <Line widthClass="w-4/5" />
        <Line widthClass="w-3/5" />
      </Card>
    </Screen>
  );
}
