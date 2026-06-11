"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  calculateOverduePreviewAt,
  calculateRemainingTimeAt,
  formatRemainingTime,
} from "@/src/lib/timer";
import { extractApiErrorMessage } from "@/src/lib/api-error";
import { authFetch } from "@/src/lib/auth-fetch";
import { requireClientSession } from "@/src/lib/client-auth";
import type { ReservationStatus, ReservationType } from "@/src/domain/types";

function parseMode(value: string | null): ReservationType {
  return value === "SHOP_SERVICE" ? "SHOP_SERVICE" : "SELF_SERVICE";
}

function fallbackWindow(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getTime() - 5 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

interface ReservationDetail {
  id: string;
  reservationType: ReservationType;
  bookingMode: "SELF" | "PACKAGE";
  partnerId: string;
  garageName: string;
  bayId: string;
  bayLabel: string;
  carId: string;
  carLabel: string;
  startTime: string;
  endTime: string;
  dateLabel: string;
  status: ReservationStatus;
  totalPrice: number;
  workTitle: string;
  taskIds: string;
  taskLabels: string;
  selectedTaskCount: string;
}

interface ReservationDetailResponse {
  success: boolean;
  reservation?: ReservationDetail;
}

function InUsePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tick, setTick] = useState<number>(() => Date.now());
  const [serverOffsetMs, setServerOffsetMs] = useState<number>(0);
  const [startError, setStartError] = useState<string>("");

  const reservationId = searchParams.get("reservationId") ?? "";
  const reservationTypeFromQuery = parseMode(searchParams.get("reservationType"));
  const workTitleFromQuery = searchParams.get("workTitle") ?? "엔진오일 교환";
  const blockedMinutes = Number(searchParams.get("blockedMinutes") ?? "60");

  const fallback = useMemo(() => fallbackWindow(), []);
  const [detail, setDetail] = useState<ReservationDetail>(() => ({
    id: reservationId,
    reservationType: reservationTypeFromQuery,
    bookingMode: searchParams.get("bookingMode") === "PACKAGE" ? "PACKAGE" : "SELF",
    partnerId: searchParams.get("partnerId") ?? "",
    garageName: searchParams.get("garageName") ?? "강남 셀프정비소",
    bayId: "",
    bayLabel: searchParams.get("bayLabel") ?? "3번 베이",
    carId: searchParams.get("carId") ?? "",
    carLabel: searchParams.get("carLabel") ?? "아반떼 CN7",
    startTime: searchParams.get("startTime") ?? fallback.start,
    endTime: searchParams.get("endTime") ?? fallback.end,
    dateLabel: "",
    status: "IN_USE",
    totalPrice: Number(searchParams.get("totalPrice") ?? "15000"),
    workTitle: workTitleFromQuery,
    taskIds: searchParams.get("taskIds") ?? "",
    taskLabels: searchParams.get("taskLabels") ?? workTitleFromQuery,
    selectedTaskCount: searchParams.get("selectedTaskCount") ?? "1",
  }));
  const [detailError, setDetailError] = useState<string>("");
  const [startTime, setStartTime] = useState<string>(
    () => searchParams.get("startTime") ?? fallback.start,
  );
  const [endTime, setEndTime] = useState<string>(
    () => searchParams.get("endTime") ?? fallback.end,
  );
  const [confirmedTotalPrice, setConfirmedTotalPrice] =
    useState<number>(detail.totalPrice);

  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function hydrateReservationDetail() {
      if (!reservationId) {
        return;
      }

      try {
        const response = await authFetch(`/api/reservations/${reservationId}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json()) as ReservationDetailResponse;

        if (isCancelled) {
          return;
        }

        if (!response.ok || !payload.success || !payload.reservation) {
          setDetailError(
            extractApiErrorMessage(
              payload,
              "예약 상세 정보를 불러오지 못했습니다.",
            ),
          );
          return;
        }

        setDetail(payload.reservation);
        setStartTime(payload.reservation.startTime);
        setEndTime(payload.reservation.endTime);
        setConfirmedTotalPrice(payload.reservation.totalPrice);
      } catch {
        if (!isCancelled) {
          setDetailError("예약 상세 정보를 불러오지 못했습니다.");
        }
      }
    }

    async function startReservation() {
      if (!reservationId) {
        return;
      }

      try {
        const hasSession = await requireClientSession();

        if (!hasSession) {
          return;
        }

        const response = await authFetch(`/api/reservations/${reservationId}/start`, {
          method: "POST",
          cache: "no-store",
        });
        const data: unknown = await response.json();

        if (!response.ok || isCancelled) {
          if (!isCancelled) {
            setStartError("이용 시작 처리에 실패했습니다.");
          }
          return;
        }

        if (!data || typeof data !== "object") {
          return;
        }

        const typed = data as {
          serverNow?: unknown;
          startTime?: unknown;
          endTime?: unknown;
          totalPrice?: unknown;
        };

        if (typeof typed.serverNow === "string") {
          const serverNowMs = new Date(typed.serverNow).getTime();
          if (Number.isFinite(serverNowMs)) {
            setServerOffsetMs(serverNowMs - Date.now());
          }
        }

        if (typeof typed.startTime === "string") {
          setStartTime(typed.startTime);
        }

        if (typeof typed.endTime === "string") {
          setEndTime(typed.endTime);
        }

        if (
          typeof typed.totalPrice === "number" &&
          Number.isFinite(typed.totalPrice)
        ) {
          setConfirmedTotalPrice(typed.totalPrice);
        }
      } catch {
        if (!isCancelled) {
          setStartError("이용 시작 처리 중 네트워크 오류가 발생했습니다.");
        }
      }
    }

    void hydrateReservationDetail();
    void startReservation();

    return () => {
      isCancelled = true;
    };
  }, [reservationId]);

  const serverNowMs = tick + serverOffsetMs;

  const remaining = useMemo(() => {
    return calculateRemainingTimeAt(endTime, serverNowMs);
  }, [endTime, serverNowMs]);

  const overdue = useMemo(() => {
    return calculateOverduePreviewAt(
      endTime,
      confirmedTotalPrice,
      startTime,
      serverNowMs,
    );
  }, [confirmedTotalPrice, endTime, startTime, serverNowMs]);

  const timeText = formatRemainingTime(remaining.remainingMs);

  function goCheckout() {
    const query = new URLSearchParams({
      reservationId,
      reservationType: detail.reservationType,
      bookingMode: detail.bookingMode,
      partnerId: detail.partnerId,
      carId: detail.carId,
      carLabel: detail.carLabel,
      garageName: detail.garageName,
      bayLabel: detail.bayLabel,
      workTitle: detail.taskLabels || detail.workTitle,
      startTime,
      endTime,
      totalPrice: String(confirmedTotalPrice),
      taskIds: detail.taskIds,
      taskLabels: detail.taskLabels,
      selectedTaskCount: detail.selectedTaskCount,
      overdueMinutes: String(overdue.overdueMinutes),
      previewFee: String(overdue.previewFee),
    });
    router.push(`/checkout?${query.toString()}`);
  }

  async function goCompleteDirectly() {
    const hasSession = await requireClientSession();

    if (!hasSession) {
      return;
    }

    const response = await authFetch("/api/checkout", {
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
      reservationType: detail.reservationType,
      partnerId: detail.partnerId,
      carId: detail.carId,
      garageName: detail.garageName,
      carLabel: detail.carLabel,
      workTitle: detail.taskLabels || detail.workTitle,
      totalPrice: String(confirmedTotalPrice),
      extraFee: String(data.extraFee ?? 0),
      taskIds: detail.taskIds,
      taskLabels: detail.taskLabels,
      selectedTaskCount: detail.selectedTaskCount,
    });

    router.push(`/complete?${query.toString()}`);
  }

  if (detail.reservationType === "SHOP_SERVICE") {
    return (
      <section className="pb-24 pt-8">
        <p className="text-lg text-zinc-500">작업 진행 중</p>

        <div className="mt-4 rounded-3xl bg-amber-50 p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
            Shop Service
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-900">
            {detail.workTitle}
          </h1>
          <p className="mt-3 text-base text-zinc-700">
            업장에서 패키지 작업을 진행 중입니다. 예약 시간은 {blockedMinutes}
            분만큼 블록되어 있습니다.
          </p>
        </div>

        <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
          <div className="space-y-3 text-base text-zinc-700">
            <p className="flex justify-between">
              <span>업장</span>
              <span>{detail.garageName}</span>
            </p>
            <p className="flex justify-between">
              <span>차량</span>
              <span>{detail.carLabel}</span>
            </p>
            <p className="flex justify-between">
              <span>현재 상태</span>
              <span>{detail.status}</span>
            </p>
            {detailError ? (
              <p className="text-sm text-red-500">{detailError}</p>
            ) : null}
            <p className="flex justify-between">
              <span>안내</span>
              <span className="text-right">
                필요 시 정비사가 작업을 인계합니다.
              </span>
            </p>
          </div>
        </div>

        <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-107.5 -translate-x-1/2 bg-white px-4 pb-3 pt-2">
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
        {detail.garageName} · {detail.bayLabel}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          className="rounded-2xl bg-blue-50 py-6 text-2xl font-semibold text-blue-600"
        >
          1시간 연장
        </button>
        <button
          type="button"
          className="rounded-2xl bg-rose-50 py-6 text-2xl font-semibold text-rose-500"
        >
          SOS
        </button>
      </div>

      <div className="mt-6 rounded-2xl bg-zinc-100 p-4 text-left">
        <p className="text-xl font-semibold text-zinc-900">{detail.workTitle}</p>
        <p className="mt-1 text-sm text-zinc-500">
          {detail.carLabel} · {detail.status}
        </p>
        {detailError ? (
          <p className="mt-2 text-sm text-red-500">{detailError}</p>
        ) : null}
        {startError ? (
          <p className="mt-2 text-sm text-red-500">{startError}</p>
        ) : null}
        <p className="mt-2 text-sm text-zinc-500">
          예상 초과요금: {Number(overdue.previewFee).toLocaleString("ko-KR")}원
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

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-107.5 -translate-x-1/2 bg-white px-4 pb-3 pt-2">
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
