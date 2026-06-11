"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { CheckInPayload, ReservationType } from "@/src/domain/types";
import { extractApiErrorMessage } from "@/src/lib/api-error";
import { authFetch } from "@/src/lib/auth-fetch";
import { requireClientSession } from "@/src/lib/client-auth";
import { uploadReservationPhoto } from "@/src/lib/reservation-photo-storage";

type PhotoField = "frontImg" | "rearImg" | "leftImg" | "rightImg";

const photoLabels: Record<PhotoField, string> = {
  frontImg: "전면",
  rearImg: "후면",
  leftImg: "좌측",
  rightImg: "우측",
};

interface ApiErrorShape {
  error?: string | { message?: string };
}

type ReservationStatus =
  | "CONFIRMED"
  | "CHECKED_IN"
  | "IN_USE"
  | "COMPLETED"
  | "CANCELLED";

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

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const typed = payload as ApiErrorShape;

  if (typeof typed.error === "string" && typed.error) {
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

function CheckinPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const reservationId = searchParams.get("reservationId")?.trim() ?? "";
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
    status: "CONFIRMED",
    totalPrice: Number(searchParams.get("totalPrice") ?? "15000"),
    workTitle: searchParams.get("workTitle") ?? "엔진오일 교환",
    taskIds: searchParams.get("taskIds") ?? "",
    taskLabels: searchParams.get("taskLabels") ?? searchParams.get("workTitle") ?? "엔진오일 교환",
    selectedTaskCount: searchParams.get("selectedTaskCount") ?? "1",
  }));

  const [qrScanned, setQrScanned] = useState<boolean>(false);
  const [frontImgFile, setFrontImgFile] = useState<File | null>(null);
  const [rearImgFile, setRearImgFile] = useState<File | null>(null);
  const [leftImgFile, setLeftImgFile] = useState<File | null>(null);
  const [rightImgFile, setRightImgFile] = useState<File | null>(null);

  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(Boolean(reservationId));

  const missingReservationId = reservationId.length === 0;
  const canCheckInStatus = detail.status === "CONFIRMED";

  const allPhotosSelected =
    frontImgFile !== null &&
    rearImgFile !== null &&
    leftImgFile !== null &&
    rightImgFile !== null;

  const canSubmit =
    qrScanned &&
    allPhotosSelected &&
    !missingReservationId &&
    !isDetailLoading &&
    canCheckInStatus;

  const tiles: Array<{ field: PhotoField; file: File | null }> = useMemo(
    () => [
      { field: "frontImg", file: frontImgFile },
      { field: "rearImg", file: rearImgFile },
      { field: "leftImg", file: leftImgFile },
      { field: "rightImg", file: rightImgFile },
    ],
    [frontImgFile, leftImgFile, rearImgFile, rightImgFile],
  );

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (
      !canSubmit ||
      !frontImgFile ||
      !rearImgFile ||
      !leftImgFile ||
      !rightImgFile
    ) {
      setError("QR 스캔과 차량 사진 4장을 모두 완료해 주세요.");
      return;
    }

    setIsLoading(true);
    try {
      const hasSession = await requireClientSession();

      if (!hasSession) {
        return;
      }

      const [frontImg, rearImg, leftImg, rightImg] = await Promise.all([
        uploadReservationPhoto({
          reservationId,
          phase: "checkin",
          field: "front",
          file: frontImgFile,
        }),
        uploadReservationPhoto({
          reservationId,
          phase: "checkin",
          field: "rear",
          file: rearImgFile,
        }),
        uploadReservationPhoto({
          reservationId,
          phase: "checkin",
          field: "left",
          file: leftImgFile,
        }),
        uploadReservationPhoto({
          reservationId,
          phase: "checkin",
          field: "right",
          file: rightImgFile,
        }),
      ]);

      const payload: CheckInPayload = {
        reservationId,
        frontImg,
        rearImg,
        leftImg,
        rightImg,
      };

      const response = await authFetch("/api/checkin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        setError(extractErrorMessage(data) ?? "체크인 처리에 실패했습니다.");
        return;
      }

      const query = new URLSearchParams({
        reservationId,
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
      });
      router.push(`/in-use?${query.toString()}`);
    } catch (uploadOrNetworkError) {
      setError(
        uploadOrNetworkError instanceof Error
          ? uploadOrNetworkError.message
          : "네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setIsLoading(false);
    }
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
        <h1 className="text-3xl font-semibold text-zinc-900">체크인</h1>
      </header>

      {missingReservationId ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          reservationId가 누락되었습니다.
        </p>
      ) : null}

      <div className="mb-4 rounded-2xl bg-zinc-100 p-4 text-base text-zinc-700">
        <p className="flex justify-between">
          <span>날짜/시간</span>
          <span>{isDetailLoading ? "불러오는 중" : detail.dateLabel || "-"}</span>
        </p>
        <p className="mt-2 flex justify-between">
          <span>지점</span>
          <span>{detail.garageName}</span>
        </p>
        <p className="mt-2 flex justify-between">
          <span>작업</span>
          <span>{detail.taskLabels || detail.workTitle}</span>
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
          <span>상태</span>
          <span>{detail.status}</span>
        </p>
      </div>

      {!canCheckInStatus ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          현재 {detail.status} 상태라 체크인을 새로 진행할 수 없습니다.
        </p>
      ) : null}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <h2 className="mb-2 text-xl font-semibold">QR 스캔</h2>
          <button
            type="button"
            onClick={() => setQrScanned(true)}
            className={`flex h-36 w-full items-center justify-center rounded-2xl border-2 border-dashed text-lg ${
              qrScanned
                ? "border-emerald-500 bg-emerald-50 text-emerald-600"
                : "border-zinc-300 bg-zinc-100 text-zinc-500"
            }`}
          >
            {qrScanned ? "스캔 완료" : "탭하여 QR 스캔"}
          </button>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold">차량 사진 촬영 (4방향)</h2>
          <div className="grid grid-cols-2 gap-3">
            {tiles.map((tile) => (
              <label
                key={tile.field}
                className={`flex h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-base ${
                  tile.file
                    ? "border-emerald-500 bg-emerald-50 text-emerald-600"
                    : "border-zinc-300 bg-zinc-100 text-zinc-500"
                }`}
              >
                <span>{tile.file ? "✓" : "📷"}</span>
                <span className="mt-1">
                  {tile.file
                    ? `${photoLabels[tile.field]} 완료`
                    : photoLabels[tile.field]}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const selected = event.target.files?.[0] ?? null;
                    if (tile.field === "frontImg") setFrontImgFile(selected);
                    if (tile.field === "rearImg") setRearImgFile(selected);
                    if (tile.field === "leftImg") setLeftImgFile(selected);
                    if (tile.field === "rightImg") setRightImgFile(selected);
                  }}
                />
              </label>
            ))}
          </div>
        </div>

        {!canSubmit ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            ⚠ QR 스캔과 사진 4장, 체크인 가능한 예약 상태가 필요합니다.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-107.5 -translate-x-1/2 bg-white px-4 pb-3 pt-2">
          <button
            type="submit"
            disabled={!canSubmit || isLoading}
            className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white disabled:bg-zinc-300 disabled:text-zinc-500"
          >
            {isLoading ? "처리 중..." : "체크인 완료 (타이머 시작)"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default function CheckinPage() {
  return (
    <Suspense fallback={<section className="pb-24" />}>
      <CheckinPageContent />
    </Suspense>
  );
}
