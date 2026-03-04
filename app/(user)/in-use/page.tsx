"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Card, Pill, Screen } from "../_components/mobile-ui";
import {
  calculateOverduePreview,
  calculateRemainingTime,
  formatRemainingTime,
} from "@/src/lib/timer";

interface CheckoutErrorShape {
  error?: string | { message?: string };
}

const DEFAULT_TOTAL_PRICE = 20000;

function getFallbackReservationWindow(): { startTime: string; endTime: string } {
  const now = new Date();
  const start = new Date(now.getTime() - 10 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const typed = payload as CheckoutErrorShape;

  if (typeof typed.error === "string" && typed.error) {
    return typed.error;
  }

  if (
    typed.error &&
    typeof typed.error === "object" &&
    typeof typed.error.message === "string" &&
    typed.error.message
  ) {
    return typed.error.message;
  }

  return null;
}

function formatCurrency(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;

  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(safe);
}

export default function InUsePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const reservationId = searchParams.get("reservationId")?.trim() ?? "";
  const missingReservationId = reservationId.length === 0;

  const initialWindow = useMemo(() => getFallbackReservationWindow(), []);

  const startTime =
    searchParams.get("startTime")?.trim() || initialWindow.startTime;
  const endTime = searchParams.get("endTime")?.trim() || initialWindow.endTime;

  const totalPriceParam = searchParams.get("totalPrice")?.trim();
  const totalPriceNumber =
    totalPriceParam && Number.isFinite(Number(totalPriceParam))
      ? Number(totalPriceParam)
      : DEFAULT_TOTAL_PRICE;

  const [tick, setTick] = useState<number>(Date.now());
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setTick(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  const remaining = useMemo(() => {
    void tick;
    return calculateRemainingTime(endTime);
  }, [endTime, tick]);

  const overduePreview = useMemo(
    () => {
      void tick;
      return calculateOverduePreview(endTime, totalPriceNumber, startTime);
    },
    [endTime, startTime, tick, totalPriceNumber],
  );

  const formattedRemaining = useMemo(
    () => formatRemainingTime(remaining.remainingMs),
    [remaining.remainingMs],
  );

  async function handleCheckout() {
    setError("");

    if (missingReservationId) {
      setError("reservationId가 없어 사용 종료를 진행할 수 없습니다.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reservationId }),
      });

      const payload: unknown = await response.json();

      if (!response.ok) {
        setError(
          extractErrorMessage(payload) ??
            "사용 종료 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }

      router.push("/mypage");
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen title="사용 중" subtitle="타이머와 예상 초과 요금을 확인하세요.">
      <Card className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs text-zinc-500">Reservation</p>
          <p className="rounded-xl bg-zinc-100 px-3 py-2 text-sm text-zinc-800">
            예약 ID: {reservationId || "(없음)"}
          </p>
        </div>

        {missingReservationId ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            reservationId가 누락되었습니다. 체크인 페이지부터 다시 진입해 주세요.
          </p>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-700">남은 시간</p>
            <Pill label={remaining.isOverdue ? "연장 필요" : "진행 중"} tone="accent" />
          </div>
          <p
            className={`rounded-xl px-3 py-3 text-3xl font-semibold tracking-tight ${
              remaining.isOverdue ? "bg-red-50 text-red-600" : "bg-zinc-900 text-white"
            }`}
          >
            {formattedRemaining}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-zinc-700">예상 초과 요금 (미리보기)</p>
          <div className="rounded-xl bg-zinc-100 px-3 py-3">
            <p className="text-2xl font-semibold text-zinc-900">
              {formatCurrency(overduePreview.previewFee)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              초과 {overduePreview.overdueMinutes}분 기준. 서버 계산값이 최종 금액입니다.
            </p>
          </div>
        </div>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleCheckout}
          disabled={isSubmitting || missingReservationId}
          className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {isSubmitting ? "종료 처리 중..." : "사용 종료"}
        </button>
      </Card>
    </Screen>
  );
}
