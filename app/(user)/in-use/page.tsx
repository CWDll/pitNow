"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  calculateOverduePreview,
  calculateRemainingTime,
  formatRemainingTime,
} from "@/src/lib/timer";
import type { ReservationType } from "@/src/domain/types";

function parseMode(value: string | null): ReservationType {
  return value === "SHOP_SERVICE" ? "SHOP_SERVICE" : "SELF_SERVICE";
}

function fallbackWindow(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getTime() - 5 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function InUsePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tick, setTick] = useState<number>(0);

  const reservationType = parseMode(searchParams.get("reservationType"));
  const reservationId = searchParams.get("reservationId") ?? "";
  const partnerId = searchParams.get("partnerId") ?? "";
  const carId = searchParams.get("carId") ?? "";
  const carLabel = searchParams.get("carLabel") ?? "아반떼 CN7";
  const garageName = searchParams.get("garageName") ?? "강남 셀프정비소";
  const bayLabel = searchParams.get("bayLabel") ?? "3번 베이";
  const totalPrice = Number(searchParams.get("totalPrice") ?? "15000");
  const workTitle = searchParams.get("workTitle") ?? "엔진오일 교환";
  const blockedMinutes = Number(searchParams.get("blockedMinutes") ?? "60");

  const fallback = useMemo(() => fallbackWindow(), []);
  const startTime = searchParams.get("startTime") ?? fallback.start;
  const endTime = searchParams.get("endTime") ?? fallback.end;

  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = useMemo(() => {
    void tick;
    return calculateRemainingTime(endTime);
  }, [endTime, tick]);

  const overdue = useMemo(() => {
    void tick;
    return calculateOverduePreview(endTime, totalPrice, startTime);
  }, [endTime, startTime, tick, totalPrice]);

  const timeText = formatRemainingTime(remaining.remainingMs);

  function goCheckout() {
    const query = new URLSearchParams({
      reservationId,
      reservationType,
      partnerId,
      carId,
      carLabel,
      garageName,
      bayLabel,
      workTitle,
      startTime,
      endTime,
      totalPrice: String(totalPrice),
      overdueMinutes: String(overdue.overdueMinutes),
      previewFee: String(overdue.previewFee),
    });
    router.push(`/checkout?${query.toString()}`);
  }

  async function goCompleteDirectly() {
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reservationId }),
    });

    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as { extraFee?: number };
    const query = new URLSearchParams({
      reservationId,
      garageName,
      carLabel,
      workTitle,
      totalPrice: String(totalPrice),
      extraFee: String(data.extraFee ?? 0),
    });

    router.push(`/complete?${query.toString()}`);
  }

  if (reservationType === "SHOP_SERVICE") {
    return (
      <section className="pb-24 pt-8">
        <p className="text-lg text-zinc-500">작업 진행 중</p>

        <div className="mt-4 rounded-3xl bg-amber-50 p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">Shop Service</p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-900">{workTitle}</h1>
          <p className="mt-3 text-base text-zinc-700">
            업장에서 패키지 작업을 진행 중입니다. 예약 시간은 {blockedMinutes}분만큼 블록되어 있습니다.
          </p>
        </div>

        <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
          <div className="space-y-3 text-base text-zinc-700">
            <p className="flex justify-between"><span>업장</span><span>{garageName}</span></p>
            <p className="flex justify-between"><span>차량</span><span>{carLabel}</span></p>
            <p className="flex justify-between"><span>현재 상태</span><span>정비 진행 중</span></p>
            <p className="flex justify-between"><span>안내</span><span className="text-right">필요 시 정비사가 작업을 인계합니다.</span></p>
          </div>
        </div>

        <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 bg-white px-4 pb-3 pt-2">
          <button
            type="button"
            onClick={goCompleteDirectly}
            className="flex h-12 w-full items-center justify-center rounded-2xl bg-zinc-900 text-lg font-semibold text-white"
          >
            작업 완료 처리
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="pb-24 pt-8 text-center">
      <p className="text-lg text-zinc-500">이용 중</p>

      <div className="mx-auto mt-4 flex h-64 w-64 flex-col items-center justify-center rounded-full border-4 border-blue-600 text-blue-600 shadow-[0_0_0_8px_rgba(59,130,246,0.2)]">
        <p className="text-2xl">남은 시간</p>
        <p className="mt-2 text-5xl font-semibold">{timeText}</p>
      </div>

      <p className="mt-6 text-lg text-zinc-600">
        {garageName} · {bayLabel}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button type="button" className="rounded-2xl bg-blue-50 py-6 text-2xl font-semibold text-blue-600">
          연장
        </button>
        <button type="button" className="rounded-2xl bg-rose-50 py-6 text-2xl font-semibold text-rose-500">
          SOS
        </button>
      </div>

      <div className="mt-6 rounded-2xl bg-zinc-100 p-4 text-left">
        <p className="text-xl font-semibold text-zinc-900">{workTitle}</p>
        <p className="mt-2 text-sm text-zinc-500">
          예상 초과요금: {Number(overdue.previewFee).toLocaleString("ko-KR")}원
        </p>
      </div>

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 bg-white px-4 pb-3 pt-2">
        <button
          type="button"
          onClick={goCheckout}
          disabled={!reservationId}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white disabled:bg-zinc-300 disabled:text-zinc-500"
        >
          작업 종료
        </button>
      </div>
    </section>
  );
}

export default function InUsePage() {
  return (
    <Suspense fallback={<section className="pb-24" />}>
      <InUsePageContent />
    </Suspense>
  );
}
