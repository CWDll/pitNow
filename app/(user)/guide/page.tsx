import Link from "next/link";
import {
  CalendarCheck2,
  Camera,
  ChevronRight,
  CircleCheckBig,
  Clock3,
  MapPinCheck,
  Sparkles,
} from "lucide-react";

import { Card, Screen } from "../_components/mobile-ui";

const steps = [
  {
    title: "정비소와 시간 예약",
    description: "Self 베이 또는 Shop 패키지를 선택하고 결제해요.",
    icon: CalendarCheck2,
  },
  {
    title: "도착 후 체크인",
    description: "현장 QR을 확인하고 차량 4방향 사진을 촬영해요.",
    icon: MapPinCheck,
  },
  {
    title: "이용 시간 확인",
    description: "체크인이 끝나면 서버 시간을 기준으로 이용이 시작돼요.",
    icon: Clock3,
  },
  {
    title: "정리하고 체크아웃",
    description: "정리 체크리스트와 사진 2장을 제출하고 정산해요.",
    icon: CircleCheckBig,
  },
];

const photoDirections = ["전면", "후면", "좌측", "우측"];

export default function GuidePage() {
  return (
    <Screen title="이용 가이드" subtitle="예약부터 체크아웃까지 필요한 절차를 확인하세요.">
      <article className="rounded-2xl border border-blue-600 bg-blue-600 p-4 text-white shadow-[0_8px_24px_rgba(37,99,235,0.18)]">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-black">도착 전 예약 정보를 확인해 주세요</h2>
            <p className="mt-1 text-sm font-medium leading-6 text-blue-100">
              예약 시간, 정비 작업, 배정된 베이를 확인하면 현장에서 더 빠르게 시작할 수 있어요.
            </p>
          </div>
        </div>
      </article>

      <section aria-labelledby="usage-steps-title">
        <div className="mb-3 flex items-end justify-between">
          <h2 id="usage-steps-title" className="text-lg font-black text-slate-950">
            이용 순서
          </h2>
          <span className="text-xs font-bold text-slate-400">4단계</span>
        </div>
        <Card className="divide-y divide-slate-100 p-0">
          {steps.map((step, index) => {
            const Icon = step.icon;

            return (
              <div key={step.title} className="flex gap-3 p-4">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
                  <Icon className="size-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900">
                    <span className="mr-1.5 text-blue-600">{index + 1}</span>
                    {step.title}
                  </p>
                  <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </Card>
      </section>

      <section aria-labelledby="photo-guide-title">
        <div className="mb-3">
          <h2 id="photo-guide-title" className="text-lg font-black text-slate-950">
            체크인 사진 4장
          </h2>
          <p className="mt-1 text-xs font-medium text-slate-500">
            타이머 시작 전 차량 상태를 네 방향에서 기록합니다.
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {photoDirections.map((direction) => (
            <div
              key={direction}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm"
            >
              <Camera className="size-5 text-blue-600" />
              <span className="text-xs font-bold">{direction}</span>
            </div>
          ))}
        </div>
      </section>

      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <CircleCheckBig className="size-5 text-emerald-600" />
          <h2 className="text-base font-black text-slate-900">체크아웃 전 확인</h2>
        </div>
        <p className="text-sm font-medium leading-6 text-slate-600">
          공구 반납, 베이 청소, 폐유·폐기물 처리를 마친 뒤 사진 2장을 제출해 주세요. 초과 이용이 있으면 추가 정산 후 완료됩니다.
        </p>
      </Card>

      <Link
        href="/"
        className="flex h-12 items-center justify-center gap-1 rounded-xl bg-slate-950 text-sm font-black text-white shadow-sm"
      >
        예약 가능한 정비소 보기
        <ChevronRight className="size-4" />
      </Link>
    </Screen>
  );
}
