"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarClock,
  CircleAlert,
  Clock3,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";

import {
  calculateOverduePreviewAt,
  calculateRemainingTimeAt,
  formatRemainingTime,
} from "@/src/lib/timer";
import { extractApiErrorMessage } from "@/src/lib/api-error";
import { authFetch } from "@/src/lib/auth-fetch";
import { requireClientSession } from "@/src/lib/client-auth";
import {
  CHECKIN_EARLY_MINUTES,
  getCheckinOpensAt,
  getCheckinWindowState,
} from "@/src/lib/checkin-window";
import { formatKstDateTimeRange } from "@/src/lib/timezone";
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
  helperVerifyFee: number;
  workTitle: string;
  taskIds: string;
  taskLabels: string;
  selectedTaskCount: string;
  packageTitle: string;
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
  const [completionError, setCompletionError] = useState<string>("");
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const reservationId = searchParams.get("reservationId") ?? "";
  const reservationTypeFromQuery = parseMode(searchParams.get("reservationType"));
  const workTitleFromQuery = searchParams.get("workTitle") ?? "엔진오일 교환";

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
    status:
      reservationTypeFromQuery === "SHOP_SERVICE" ? "CONFIRMED" : "IN_USE",
    totalPrice: Number(searchParams.get("totalPrice") ?? "15000"),
    helperVerifyFee: Number(searchParams.get("helperVerifyFee") ?? "0"),
    workTitle: workTitleFromQuery,
    taskIds: searchParams.get("taskIds") ?? "",
    taskLabels: searchParams.get("taskLabels") ?? workTitleFromQuery,
    selectedTaskCount: searchParams.get("selectedTaskCount") ?? "1",
    packageTitle: searchParams.get("packageTitle") ?? workTitleFromQuery,
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
  const [confirmedHelperVerifyFee, setConfirmedHelperVerifyFee] =
    useState<number>(detail.helperVerifyFee);

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
        setConfirmedHelperVerifyFee(payload.reservation.helperVerifyFee);
      } catch {
        if (!isCancelled) {
          setDetailError("예약 상세 정보를 불러오지 못했습니다.");
        }
      }
    }

    void hydrateReservationDetail();

    return () => {
      isCancelled = true;
    };
  }, [reservationId]);

  const serverNowMs = tick + serverOffsetMs;

  const remaining = useMemo(() => {
    return calculateRemainingTimeAt(endTime, serverNowMs);
  }, [endTime, serverNowMs]);

  const overdue = useMemo(() => {
    const basePrice = Math.max(
      0,
      confirmedTotalPrice - confirmedHelperVerifyFee,
    );

    return calculateOverduePreviewAt(
      endTime,
      basePrice,
      startTime,
      serverNowMs,
    );
  }, [
    confirmedHelperVerifyFee,
    confirmedTotalPrice,
    endTime,
    startTime,
    serverNowMs,
  ]);

  const timeText = formatRemainingTime(remaining.remainingMs);
  const shopWindowState = getCheckinWindowState({
    startTime,
    endTime,
    nowMs: serverNowMs,
  });
  const shopCheckinOpensAt = getCheckinOpensAt(startTime);
  const shopCheckinOpensAtLabel = shopCheckinOpensAt
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(shopCheckinOpensAt))
    : "";
  const shopStatusLabel =
    detail.status === "CONFIRMED"
      ? "체크인 대기"
      : detail.status === "CHECKED_IN"
        ? "도착 확인"
        : detail.status === "IN_USE"
          ? "정비 진행 중"
          : detail.status === "COMPLETED"
            ? "정비 완료"
            : "예약 취소";

  async function startReservation() {
    if (!reservationId || isStarting) {
      return;
    }

    setIsStarting(true);
    setStartError("");

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

      if (!response.ok) {
        setStartError(
          extractApiErrorMessage(data, "체크인 처리에 실패했습니다."),
        );
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
        status?: unknown;
      };

      if (typeof typed.serverNow === "string") {
        const responseServerNowMs = new Date(typed.serverNow).getTime();
        if (Number.isFinite(responseServerNowMs)) {
          setServerOffsetMs(responseServerNowMs - Date.now());
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

      if (typed.status === "IN_USE") {
        setDetail((current) => ({ ...current, status: "IN_USE" }));
      }
    } catch {
      setStartError("체크인 처리 중 네트워크 오류가 발생했습니다.");
    } finally {
      setIsStarting(false);
    }
  }

  useEffect(() => {
    if (
      detail.reservationType === "SELF_SERVICE" &&
      detail.status === "CHECKED_IN"
    ) {
      void startReservation();
    }
    // Self Service는 체크인 증적 제출 직후 한 번만 자동 시작합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.reservationType, detail.status, reservationId]);

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
    if (isCompleting) {
      return;
    }

    setIsCompleting(true);
    setCompletionError("");
    const hasSession = await requireClientSession();

    if (!hasSession) {
      setIsCompleting(false);
      return;
    }

    try {
      const response = await authFetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reservationId }),
      });
      const data: unknown = await response.json();

      if (!response.ok) {
        setCompletionError(
          extractApiErrorMessage(data, "작업 완료 처리에 실패했습니다."),
        );
        return;
      }

      const typed = data as { extraFee?: number };
      const query = new URLSearchParams({
        reservationId,
        reservationType: detail.reservationType,
        partnerId: detail.partnerId,
        carId: detail.carId,
        garageName: detail.garageName,
        carLabel: detail.carLabel,
        workTitle: detail.packageTitle || detail.workTitle,
        totalPrice: String(confirmedTotalPrice),
        extraFee: String(typed.extraFee ?? 0),
        taskIds: detail.taskIds,
        taskLabels: detail.taskLabels,
        selectedTaskCount: detail.selectedTaskCount,
      });

      router.push(`/complete?${query.toString()}`);
    } catch {
      setCompletionError("작업 완료 처리 중 네트워크 오류가 발생했습니다.");
    } finally {
      setIsCompleting(false);
    }
  }

  if (detail.reservationType === "SHOP_SERVICE") {
    return (
      <section className="pb-24 pt-8">
        <p className="text-lg text-zinc-500">{shopStatusLabel}</p>

        <div className="mt-4 rounded-3xl bg-amber-50 p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
            Shop Service
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-900">
            {detail.packageTitle || detail.workTitle}
          </h1>
          <p className="mt-3 text-base text-zinc-700">
            {detail.status === "IN_USE"
              ? "정비소에서 예약한 패키지 작업을 진행하고 있습니다."
              : `체크인은 예약 시작 ${CHECKIN_EARLY_MINUTES}분 전부터 가능합니다.`}
          </p>
        </div>

        <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
          <div className="space-y-3 text-base text-zinc-700">
            <p className="flex justify-between">
              <span>예약 패키지</span>
              <span className="text-right">
                {detail.packageTitle || detail.workTitle}
              </span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="shrink-0">작업 예정 시간</span>
              <span className="text-right">
                {detail.dateLabel ||
                  formatKstDateTimeRange(startTime, endTime)}
              </span>
            </p>
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
              <span className="font-semibold text-zinc-900">
                {shopStatusLabel}
              </span>
            </p>
            {detailError ? (
              <p className="text-sm text-red-500">{detailError}</p>
            ) : null}
          </div>
        </div>

        {detail.status === "CONFIRMED" ? (
          <div className="mt-4 flex gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold leading-6 text-blue-900">
            <CalendarClock className="mt-0.5 size-5 shrink-0 text-blue-600" />
            <p>
              {shopWindowState === "NOT_OPEN"
                ? `${shopCheckinOpensAtLabel}부터 체크인할 수 있습니다. 도착 후 정비소에 차량을 인계해 주세요.`
                : "체크인할 수 있습니다. 현장 도착 후 정비소에 차량을 인계해 주세요."}
            </p>
          </div>
        ) : null}

        {startError || completionError ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {startError || completionError}
          </p>
        ) : null}

        <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-107.5 -translate-x-1/2 bg-white px-4 pb-3 pt-2">
          <button
            type="button"
            onClick={
              detail.status === "CONFIRMED"
                ? () => void startReservation()
                : () => void goCompleteDirectly()
            }
            disabled={
              isStarting ||
              isCompleting ||
              (detail.status === "CONFIRMED" && shopWindowState !== "OPEN") ||
              (detail.status !== "CONFIRMED" && detail.status !== "IN_USE")
            }
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 text-lg font-semibold text-white disabled:bg-zinc-200 disabled:text-zinc-500"
          >
            {isStarting || isCompleting ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : null}
            {detail.status === "CONFIRMED"
              ? shopWindowState === "NOT_OPEN"
                ? `${shopCheckinOpensAtLabel}부터 체크인`
                : "체크인"
              : detail.status === "IN_USE"
                ? "작업 완료 처리"
                : "처리할 수 없는 예약"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="pb-24 pt-8 text-center">
      <p className="text-lg text-zinc-500">이용 중</p>

      <div className="mx-auto mt-4 flex h-64 w-64 flex-col items-center justify-center rounded-full border-4 border-blue-600 text-blue-600 shadow-[0_0_0_8px_rgba(59,130,246,0.2)]">
        <p className="text-2xl">
          {remaining.isOverdue ? "초과 이용" : "남은 시간"}
        </p>
        <p className="mt-2 text-5xl font-semibold">{timeText}</p>
        {overdue.isCapped ? (
          <p className="mt-2 text-sm font-semibold">최대 과금 시간 적용</p>
        ) : null}
      </div>

      <p className="mt-6 text-lg text-zinc-600">
        {detail.garageName} · {detail.bayLabel}
      </p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm">
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
          예상 초과요금{overdue.isCapped ? " (최대)" : ""}: {Number(overdue.previewFee).toLocaleString("ko-KR")}원
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left">
        <div className="flex items-center gap-2 text-blue-900">
          <ShieldCheck className="size-5" />
          <h2 className="text-base font-black">이용 안내 및 규정</h2>
        </div>
        <ul className="mt-3 space-y-2 text-sm font-semibold leading-6 text-blue-900/80">
          <li className="flex gap-2">
            <Clock3 className="mt-1 size-4 shrink-0 text-blue-600" />
            예약 연장은 지원하지 않습니다. 예약 종료 시각까지 작업과 정리를 마쳐 주세요.
          </li>
          <li className="flex gap-2">
            <CircleAlert className="mt-1 size-4 shrink-0 text-blue-600" />
            종료 후 체크리스트와 사진 2장을 제출해야 체크아웃할 수 있습니다.
          </li>
          <li className="flex gap-2">
            <CircleAlert className="mt-1 size-4 shrink-0 text-blue-600" />
            종료 시각 이후에는 1시간 단위 추가요금이 발생하며, 최대 1시간분까지만 청구됩니다. 베이 운영 버퍼는 연장 시간이 아닙니다.
          </li>
        </ul>
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
