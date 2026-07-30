import Image from "next/image";
import Link from "next/link";
import {
  CalendarCheck2,
  Camera,
  ChevronRight,
  CircleCheckBig,
  Clock3,
  ClipboardCheck,
  CircleDollarSign,
  MapPinCheck,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
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
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Image
            src="/images/checkin-photo-guide.jpg"
            alt="같은 차량을 전면, 후면, 좌측, 우측에서 촬영한 체크인 사진 예시"
            width={900}
            height={900}
            className="aspect-square w-full object-cover"
            priority
          />
          <div className="grid grid-cols-4 border-t border-slate-200 bg-white px-2 py-3 text-center text-xs font-black text-slate-700">
            <span>전면</span>
            <span>후면</span>
            <span>좌측</span>
            <span>우측</span>
          </div>
        </div>
        <p className="mt-2 flex items-start gap-2 text-xs font-semibold leading-5 text-slate-500">
          <Camera className="mt-0.5 size-4 shrink-0 text-blue-600" />
          차량 전체와 주변 바닥이 보이도록 한두 걸음 떨어져서 촬영해 주세요.
        </p>
      </section>

      <Card className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
            <UserRoundCheck className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900">정비사 작업 확인</h2>
            <p className="mt-1 text-sm font-medium leading-6 text-slate-600">
              예약할 때 선택하면 작업 종료 후 정비소 정비사가 예약한 작업 범위의 상태를 확인합니다.
            </p>
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm font-bold text-slate-700">
          기본 5,000원 + 선택한 작업별 확인 비용
        </div>
      </Card>

      <Link
        href="/safety-training?next=/guide"
        className="flex min-h-14 items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900 shadow-sm"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-blue-700">
          <ShieldCheck className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black">SELF 공통 안전교육</span>
          <span className="mt-1 block text-xs font-semibold text-blue-700">
            예약 전에도 시설·장비 안전수칙을 미리 확인할 수 있어요.
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0" />
      </Link>

      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <CircleCheckBig className="size-5 text-emerald-600" />
          <h2 className="text-base font-black text-slate-900">체크아웃 체크리스트</h2>
        </div>
        <ul className="space-y-2 text-sm font-semibold text-slate-600">
          <li className="flex gap-2"><ClipboardCheck className="size-4 shrink-0 text-emerald-600" />공구 반납, 베이 청소, 폐유·폐기물 처리 확인</li>
          <li className="flex gap-2"><Camera className="size-4 shrink-0 text-emerald-600" />정리된 차량과 베이 사진 2장 제출</li>
          <li className="flex gap-2"><ShieldCheck className="size-4 shrink-0 text-emerald-600" />예약 시 신청한 정비사 작업 확인 결과 조회</li>
        </ul>
      </Card>

      <Card className="space-y-3 border-amber-200 bg-amber-50">
        <div className="flex items-center gap-2">
          <CircleDollarSign className="size-5 text-amber-700" />
          <h2 className="text-base font-black text-amber-950">추가요금과 패널티</h2>
        </div>
        <p className="text-sm font-medium leading-6 text-amber-900">
          예약 종료 시각을 넘기면 예약 기본 시간요금을 기준으로 1시간 단위 추가요금이 발생합니다. 공구 미반납, 미청소, 폐유·폐기물 미처리 또는 증적 누락은 운영 확인 후 별도 패널티 대상이 될 수 있습니다.
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
