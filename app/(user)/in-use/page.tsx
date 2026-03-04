"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  calculateOverduePreview,
  calculateRemainingTime,
  formatRemainingTime,
} from "@/src/lib/timer";

const DEFAULT_TOTAL_PRICE = 15000;

function fallbackWindow(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getTime() - 5 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export default function InUsePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tick, setTick] = useState<number>(0);

  const reservationId = searchParams.get("reservationId") ?? "";
  const garageName = searchParams.get("garageName") ?? "강남 셀프정비소";
  const bayLabel = searchParams.get("bayLabel") ?? "3번 베이";
  const totalPrice = Number(
    searchParams.get("totalPrice") ?? String(DEFAULT_TOTAL_PRICE),
  );
  const workTitle = searchParams.get("workTitle") ?? "엔진오일 교환";

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

  return (
    <section className="pb-24 pt-8 text-center">
      <p className="text-lg text-zinc-500">이용 중</p>

      <div className="mx-auto mt-4 flex h-64 w-64 flex-col items-center justify-center rounded-full border-4 border-blue-600 text-blue-600 shadow-[0_0_0_8px_rgba(59,130,246,0.2)]">
        <p className="text-2xl">🕒</p>
        <p className="mt-2 text-5xl font-semibold">{timeText}</p>
      </div>

      <p className="mt-6 text-lg text-zinc-600">
        {garageName} · {bayLabel}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          className="rounded-2xl bg-blue-50 py-6 text-2xl font-semibold text-blue-600"
        >
          연장
        </button>
        <button
          type="button"
          className="rounded-2xl bg-rose-50 py-6 text-2xl font-semibold text-rose-500"
        >
          SOS
        </button>
      </div>

      <div className="mt-6 rounded-2xl bg-zinc-100 p-4 text-left">
        <p className="text-xl font-semibold text-zinc-900">
          {workTitle} 가이드
        </p>
        <p className="mt-1 text-base text-zinc-600">작업 영상 보기</p>
        <p className="mt-2 text-sm text-zinc-500">
          예상 초과요금(미리보기):{" "}
          {Number(overdue.previewFee).toLocaleString("ko-KR")}원
        </p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          className="rounded-2xl bg-zinc-100 py-3 text-lg font-medium text-zinc-700"
        >
          매장 연락
        </button>
        <button
          type="button"
          className="rounded-2xl bg-zinc-100 py-3 text-lg font-medium text-zinc-700"
        >
          안내/규정
        </button>
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
