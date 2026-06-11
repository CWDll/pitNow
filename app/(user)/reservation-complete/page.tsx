"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import type { ReservationType } from "@/src/domain/types";
import { extractApiErrorMessage } from "@/src/lib/api-error";
import { authFetch } from "@/src/lib/auth-fetch";

function parseMode(value: string | null): ReservationType {
  return value === "SHOP_SERVICE" ? "SHOP_SERVICE" : "SELF_SERVICE";
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
  totalPrice: number;
  workTitle: string;
  taskIds: string;
  taskLabels: string;
  selectedTaskCount: string;
  packageId: string;
  packageTitle: string;
}

interface ReservationDetailResponse {
  success: boolean;
  reservation?: ReservationDetail;
}

function ReservationCompletePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [detail, setDetail] = useState<ReservationDetail>(() => {
    const reservationType = parseMode(searchParams.get("reservationType"));
    const bookingMode =
      searchParams.get("bookingMode") === "PACKAGE" ? "PACKAGE" : "SELF";
    const workTitle = searchParams.get("workTitle") ?? "엔진오일 교환";

    return {
      id: searchParams.get("reservationId") ?? "",
      reservationType,
      bookingMode,
      partnerId: searchParams.get("partnerId") ?? "",
      garageName: searchParams.get("garageName") ?? "강남 셀프정비소",
      bayId: "",
      bayLabel: searchParams.get("bayLabel") ?? "3번 베이",
      carId: searchParams.get("carId") ?? "",
      carLabel: searchParams.get("carLabel") ?? "아반떼 CN7",
      startTime: searchParams.get("startTime") ?? "",
      endTime: searchParams.get("endTime") ?? "",
      dateLabel: searchParams.get("dateLabel") ?? "",
      totalPrice: Number(searchParams.get("totalPrice") ?? "15000"),
      workTitle,
      taskIds: searchParams.get("taskIds") ?? "",
      taskLabels: searchParams.get("taskLabels") ?? workTitle,
      selectedTaskCount: searchParams.get("selectedTaskCount") ?? "1",
      packageId: searchParams.get("packageId") ?? "",
      packageTitle: searchParams.get("packageTitle") ?? "",
    };
  });
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let isCancelled = false;

    async function loadReservationDetail() {
      if (!detail.id) {
        return;
      }

      try {
        const response = await authFetch(`/api/reservations/${detail.id}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json()) as ReservationDetailResponse;

        if (isCancelled) {
          return;
        }

        if (!response.ok || !payload.success || !payload.reservation) {
          setError(
            extractApiErrorMessage(
              payload,
              "예약 상세 정보를 다시 불러오지 못했습니다.",
            ),
          );
          return;
        }

        setDetail(payload.reservation);
      } catch {
        if (!isCancelled) {
          setError("예약 상세 정보를 다시 불러오지 못했습니다.");
        }
      }
    }

    void loadReservationDetail();

    return () => {
      isCancelled = true;
    };
  }, [detail.id]);

  const query = useMemo(
    () =>
      new URLSearchParams({
        reservationId: detail.id,
        reservationType: detail.reservationType,
        bookingMode: detail.bookingMode,
        partnerId: detail.partnerId,
        carId: detail.carId,
        carLabel: detail.carLabel,
        garageName: detail.garageName,
        bayLabel: detail.bayLabel,
        startTime: detail.startTime,
        endTime: detail.endTime,
        totalPrice: String(detail.totalPrice),
        workTitle: detail.workTitle,
        taskIds: detail.taskIds,
        taskLabels: detail.taskLabels,
        selectedTaskCount: detail.selectedTaskCount,
        packageId: detail.packageId,
        packageTitle: detail.packageTitle,
      }).toString(),
    [detail],
  );

  return (
    <section className="pb-24 pt-6">
      <div className="mb-4 text-center">
        <p className="text-6xl text-emerald-600">✓</p>
        <h1 className="text-4xl font-semibold text-zinc-900">예약 완료!</h1>
        <p className="mt-2 text-lg text-zinc-500">
          아래 QR 코드로 체크인하세요
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center">
        <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">
          QR 코드
        </div>
        <p className="mt-3 text-sm text-zinc-500">
          체크인 시 이 QR 코드를 스캔하세요
        </p>
      </div>

      <div className="mt-4 rounded-2xl bg-zinc-100 p-4 text-base text-zinc-700">
        {error ? (
          <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            {error}
          </p>
        ) : null}
        <p className="flex justify-between">
          <span>날짜/시간</span>
          <span>{detail.dateLabel}</span>
        </p>
        <p className="mt-2 flex justify-between">
          <span>지점</span>
          <span>{detail.garageName}</span>
        </p>
        <p className="mt-2 flex justify-between">
          <span>선택 작업</span>
          <span>{detail.taskLabels}</span>
        </p>
        <p className="mt-2 flex justify-between">
          <span>베이</span>
          <span>{detail.bayLabel}</span>
        </p>
        <p className="mt-2 flex justify-between">
          <span>차량</span>
          <span>{detail.carLabel}</span>
        </p>
        <p className="mt-2 flex justify-between">
          <span>예약 ID</span>
          <span className="max-w-55 truncate">{detail.id || "(없음)"}</span>
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          className="rounded-2xl bg-zinc-100 py-3 text-lg font-medium text-zinc-700"
        >
          길찾기
        </button>
        <button
          type="button"
          className="rounded-2xl bg-zinc-100 py-3 text-lg font-medium text-zinc-700"
        >
          전화하기
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-zinc-700">
        <p className="font-semibold text-blue-600">준비물 / 주의사항</p>
        <ul className="mt-2 list-disc pl-5 text-sm">
          <li>작업복 또는 더러워져도 되는 옷</li>
          <li>교체할 엔진오일 (매장 구매 가능)</li>
          <li>예약 시간 10분 전 도착</li>
          <li>차량 보험증 지참</li>
        </ul>
      </div>

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-107.5 -translate-x-1/2 bg-white px-4 pb-3 pt-2">
        <button
          type="button"
          onClick={() =>
            router.push(
              `/${detail.reservationType === "SELF_SERVICE" ? "checkin" : "in-use"}?${query}`,
            )
          }
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white"
        >
          {detail.reservationType === "SELF_SERVICE"
            ? "체크인 하러 가기"
            : "진행 상태 보기"}
        </button>
      </div>
    </section>
  );
}

export default function ReservationCompletePage() {
  return (
    <Suspense fallback={<section className="pb-24" />}>
      <ReservationCompletePageContent />
    </Suspense>
  );
}
