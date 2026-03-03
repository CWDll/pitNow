import { Card, Line, Pill, Screen } from "../_components/mobile-ui";

export default function MyPage() {
  return (
    <Screen title="My Page" subtitle="계정 및 이용 내역을 확인하세요.">
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">사용자 정보</h2>
          <Pill label="회원" />
        </div>
        <Line widthClass="w-1/3" />
        <Line widthClass="w-2/3" />
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-900">메뉴</h3>
        <div className="space-y-2">
          {[
            "예약 내역",
            "결제 수단",
            "알림 설정",
            "고객센터",
          ].map((item) => (
            <div key={item} className="flex items-center justify-between rounded-xl bg-zinc-100 px-3 py-3">
              <span className="text-sm text-zinc-700">{item}</span>
              <span className="text-xs text-zinc-400">&gt;</span>
            </div>
          ))}
        </div>
      </Card>
    </Screen>
  );
}
