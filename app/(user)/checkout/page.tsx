"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import type { ReservationStatus, ReservationType } from "@/src/domain/types";
import { extractApiErrorMessage } from "@/src/lib/api-error";
import { authFetch } from "@/src/lib/auth-fetch";
import { requireClientSession } from "@/src/lib/client-auth";
import { uploadReservationPhoto } from "@/src/lib/reservation-photo-storage";

interface CheckoutApiError {
  error?: string | { message?: string };
}

function extractError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const typed = payload as CheckoutApiError;
  if (typeof typed.error === "string") {
    return typed.error;
  }

  if (
    typed.error &&
    typeof typed.error === "object" &&
    typeof typed.error.message === "string"
  ) {
    return typed.error.message;
  }

  return null;
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

function CheckoutPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const reservationId = searchParams.get("reservationId") ?? "";
  const previewFee = Number(searchParams.get("previewFee") ?? "0");
  const overdueMinutes = Number(searchParams.get("overdueMinutes") ?? "0");
  const fallbackWorkTitle = searchParams.get("workTitle") ?? "엔진오일 교환";

  const [detail, setDetail] = useState<ReservationDetail>(() => ({
    id: reservationId,
    reservationType:
      searchParams.get("reservationType") === "SHOP_SERVICE"
        ? "SHOP_SERVICE"
        : "SELF_SERVICE",
    bookingMode: searchParams.get("bookingMode") === "PACKAGE" ? "PACKAGE" : "SELF",
    partnerId: searchParams.get("partnerId") ?? "",
    garageName: searchParams.get("garageName") ?? "강남 셀프정비소",
    bayId: "",
    bayLabel: searchParams.get("bayLabel") ?? "3번 베이",
    carId: searchParams.get("carId") ?? "",
    carLabel: searchParams.get("carLabel") ?? "현대 아반떼 CN7 (2022)",
    startTime: searchParams.get("startTime") ?? "",
    endTime: searchParams.get("endTime") ?? "",
    dateLabel: searchParams.get("dateLabel") ?? "",
    status: "IN_USE",
    totalPrice: Number(searchParams.get("totalPrice") ?? "15000"),
    workTitle: fallbackWorkTitle,
    taskIds: searchParams.get("taskIds") ?? "",
    taskLabels: searchParams.get("taskLabels") ?? fallbackWorkTitle,
    selectedTaskCount: searchParams.get("selectedTaskCount") ?? "1",
  }));

  const [checks, setChecks] = useState<boolean[]>([false, false, false]);
  const [photo1, setPhoto1] = useState<File | null>(null);
  const [photo2, setPhoto2] = useState<File | null>(null);
  const [helperVerifyRequested, setHelperVerifyRequested] =
    useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(
    Boolean(reservationId),
  );
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let isCancelled = false;

    async function loadReservationDetail() {
      if (!reservationId) {
        setIsDetailLoading(false);
        return;
      }

      setIsDetailLoading(true);

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
          setError(
            extractApiErrorMessage(
              payload,
              "예약 상세 정보를 불러오지 못했습니다.",
            ),
          );
          setIsDetailLoading(false);
          return;
        }

        setDetail(payload.reservation);
        setIsDetailLoading(false);
      } catch {
        if (!isCancelled) {
          setError("예약 상세 정보를 불러오지 못했습니다.");
          setIsDetailLoading(false);
        }
      }
    }

    void loadReservationDetail();

    return () => {
      isCancelled = true;
    };
  }, [reservationId]);

  const additionalFee = useMemo(() => {
    if (!Number.isFinite(previewFee) || previewFee <= 0) {
      return 0;
    }

    return previewFee;
  }, [previewFee]);

  const totalPrice = Number.isFinite(detail.totalPrice) ? detail.totalPrice : 0;
  const canCheckoutStatus =
    detail.status === "CHECKED_IN" || detail.status === "IN_USE";
  const canSubmitBase =
    reservationId.length > 0 &&
    checks.every(Boolean) &&
    photo1 !== null &&
    photo2 !== null &&
    !isDetailLoading &&
    canCheckoutStatus;
  const canSubmit = canSubmitBase;

  async function handleComplete() {
    setError("");

    if (!canSubmitBase || !photo1 || !photo2) {
      setError("체크리스트와 사진 2장을 모두 완료해 주세요.");
      return;
    }

    setIsLoading(true);
    try {
      const hasSession = await requireClientSession();

      if (!hasSession) {
        return;
      }

      const [checkoutPhoto1, checkoutPhoto2] = await Promise.all([
        uploadReservationPhoto({
          reservationId,
          phase: "checkout",
          field: "photo-1",
          file: photo1,
        }),
        uploadReservationPhoto({
          reservationId,
          phase: "checkout",
          field: "photo-2",
          file: photo2,
        }),
      ]);

      const response = await authFetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reservationId,
          toolCheckCompleted: checks[0],
          cleaningCompleted: checks[1],
          wasteDisposalCompleted: checks[2],
          helperVerifyRequested,
          checkoutPhoto1,
          checkoutPhoto2,
        }),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        setError(extractError(data) ?? "체크아웃 처리에 실패했습니다.");
        return;
      }

      const extraFee =
        data &&
        typeof data === "object" &&
        "extraFee" in data &&
        typeof (data as { extraFee?: unknown }).extraFee === "number"
          ? (data as { extraFee: number }).extraFee
          : additionalFee;
      const basePrice =
        data &&
        typeof data === "object" &&
        "basePrice" in data &&
        typeof (data as { basePrice?: unknown }).basePrice === "number"
          ? (data as { basePrice: number }).basePrice
          : totalPrice;
      const helperVerifyFee =
        data &&
        typeof data === "object" &&
        "helperVerifyFee" in data &&
        typeof (data as { helperVerifyFee?: unknown }).helperVerifyFee ===
          "number"
          ? (data as { helperVerifyFee: number }).helperVerifyFee
          : 0;
      const totalSettlement =
        data &&
        typeof data === "object" &&
        "totalSettlement" in data &&
        typeof (data as { totalSettlement?: unknown }).totalSettlement ===
          "number"
          ? (data as { totalSettlement: number }).totalSettlement
          : basePrice + extraFee + helperVerifyFee;

      const query = new URLSearchParams({
        reservationId,
        reservationType: detail.reservationType,
        partnerId: detail.partnerId,
        carId: detail.carId,
        carLabel: detail.carLabel,
        garageName: detail.garageName,
        workTitle: detail.taskLabels || detail.workTitle,
        totalPrice: String(basePrice),
        extraFee: String(extraFee),
        helperVerifyFee: String(helperVerifyFee),
        totalSettlement: String(totalSettlement),
        taskIds: detail.taskIds,
        taskLabels: detail.taskLabels || detail.workTitle,
        selectedTaskCount: detail.selectedTaskCount,
        checkoutPhoto1,
        checkoutPhoto2,
      });

      router.push(`/complete?${query.toString()}`);
    } catch (uploadOrNetworkError) {
      setError(
        uploadOrNetworkError instanceof Error
          ? uploadOrNetworkError.message
          : "체크아웃 처리 중 오류가 발생했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  if (detail.reservationType === "SHOP_SERVICE") {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold text-zinc-900">체크아웃</h1>
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          전문가 맡기기 예약은 이 화면을 사용하지 않습니다.
        </p>
      </section>
    );
  }

  return (
    <section className="pb-24">
      <header className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-2xl text-zinc-700"
          aria-label="뒤로가기"
        >
          ←
        </button>
        <h1 className="text-3xl font-semibold text-zinc-900">체크아웃</h1>
      </header>

      <div className="mb-5 rounded-3xl bg-zinc-100 p-4 text-base text-zinc-700">
        <h2 className="mb-3 text-xl font-semibold text-zinc-900">예약 정보</h2>
        <dl className="space-y-2">
          <div className="flex justify-between gap-4">
            <dt>날짜/시간</dt>
            <dd className="text-right text-zinc-900">
              {detail.dateLabel || "-"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>지점</dt>
            <dd className="text-right text-zinc-900">{detail.garageName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>작업</dt>
            <dd className="text-right text-zinc-900">
              {detail.taskLabels || detail.workTitle}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>베이</dt>
            <dd className="text-right text-zinc-900">{detail.bayLabel}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>차량</dt>
            <dd className="text-right text-zinc-900">{detail.carLabel}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>상태</dt>
            <dd className="text-right font-semibold text-blue-600">
              {isDetailLoading ? "불러오는 중" : detail.status}
            </dd>
          </div>
        </dl>
      </div>

      <div className="space-y-3">
        <h2 className="text-xl font-semibold">정리 체크리스트</h2>
        {["공구 반납 완료", "베이 청소 완료", "폐유/폐기물 처리 완료"].map(
          (item, index) => (
            <label
              key={item}
              className="flex items-center gap-3 text-lg text-zinc-800"
            >
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={checks[index]}
                onChange={() =>
                  setChecks((prev) => {
                    const next = [...prev];
                    next[index] = !next[index];
                    return next;
                  })
                }
              />
              <span>{item}</span>
            </label>
          ),
        )}
      </div>

      <div className="mt-5">
        <h2 className="mb-2 text-xl font-semibold">체크아웃 사진</h2>
        <div className="grid grid-cols-2 gap-3">
          <label
            className={`flex h-32 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed ${photo1 ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-zinc-300 bg-zinc-100 text-zinc-500"}`}
          >
            {photo1 ? "사진1 완료" : "사진 1"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setPhoto1(e.target.files?.[0] ?? null)}
            />
          </label>
          <label
            className={`flex h-32 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed ${photo2 ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-zinc-300 bg-zinc-100 text-zinc-500"}`}
          >
            {photo2 ? "사진2 완료" : "사진 2"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setPhoto2(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-zinc-100 p-4 text-base text-zinc-700">
        <h3 className="mb-2 text-xl font-semibold text-zinc-900">
          추가요금 / 패널티
        </h3>
        <p className="flex justify-between">
          <span>초과 이용 시간</span>
          <span>{overdueMinutes}분</span>
        </p>
        <p className="mt-2 flex justify-between text-red-500">
          <span>추가 요금</span>
          <span>{additionalFee.toLocaleString("ko-KR")}원</span>
        </p>
        <label className="mt-3 flex items-start gap-3 rounded-xl bg-white px-3 py-3 text-zinc-800">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5"
            checked={helperVerifyRequested}
            onChange={() => setHelperVerifyRequested((prev) => !prev)}
          />
          <span>
            카 마스터 검수 요청
            <br />
            <span className="text-sm text-zinc-500">
              서버에서 선택 작업 기준으로 검수비를 확정합니다.
            </span>
          </span>
        </label>
        <div className="my-3 border-t border-zinc-300" />
        <p className="flex justify-between text-xl font-semibold text-zinc-900">
          <span>총 정산 예상</span>
          <span className="text-red-500">
            {(totalPrice + additionalFee).toLocaleString("ko-KR")}원
          </span>
        </p>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {!isDetailLoading && !canCheckoutStatus ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          체크인 또는 이용 중 상태의 예약만 체크아웃할 수 있습니다.
        </p>
      ) : null}

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-107.5 -translate-x-1/2 bg-white px-4 pb-3 pt-2">
        <button
          type="button"
          onClick={handleComplete}
          disabled={!canSubmit || isLoading}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white disabled:bg-zinc-300 disabled:text-zinc-500"
        >
          {isLoading ? "완료 처리 중..." : "완료하기"}
        </button>
      </div>
    </section>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<section className="pb-24" />}>
      <CheckoutPageContent />
    </Suspense>
  );
}
