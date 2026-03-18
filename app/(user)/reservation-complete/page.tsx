"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { formatMinutesLabel, getReservationTypeLabel } from "@/app/(user)/_data/mock-garages";
import type { ReservationType } from "@/src/domain/types";

function parseMode(value: string | null): ReservationType {
  return value === "SHOP_SERVICE" ? "SHOP_SERVICE" : "SELF_SERVICE";
}

function ReservationCompletePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const reservationType = parseMode(searchParams.get("reservationType"));
  const reservationId = searchParams.get("reservationId") ?? "";
  const partnerId = searchParams.get("partnerId") ?? "";
  const carId = searchParams.get("carId") ?? "";
  const carLabel = searchParams.get("carLabel") ?? "아반떼 CN7";
  const garageName = searchParams.get("garageName") ?? "강남 셀프정비소";
  const dateLabel = searchParams.get("dateLabel") ?? "";
  const bayLabel = searchParams.get("bayLabel") ?? "3번 베이";
  const startTime = searchParams.get("startTime") ?? "";
  const endTime = searchParams.get("endTime") ?? "";
  const totalPrice = searchParams.get("totalPrice") ?? "15000";
  const workTitle = searchParams.get("workTitle") ?? "엔진오일 교환";
  const blockedMinutes = Number(searchParams.get("blockedMinutes") ?? "60");

  const query = new URLSearchParams({
    reservationId,
    reservationType,
    partnerId,
    carId,
    carLabel,
    garageName,
    bayLabel,
    startTime,
    endTime,
    totalPrice,
    workTitle,
    blockedMinutes: String(blockedMinutes),
  }).toString();

  return (
    <section className="pb-24 pt-6">
      <div className="mb-4 text-center">
        <p className="text-6xl text-emerald-600">✓</p>
        <h1 className="text-4xl font-semibold text-zinc-900">예약 완료</h1>
        <p className="mt-2 text-lg text-zinc-500">
          {reservationType === "SELF_SERVICE"
            ? "도착 후 QR 체크인으로 이용을 시작하세요."
            : "업장에서 예약 시간을 확보했습니다. 진행 상태를 확인할 수 있습니다."}
        </p>
      </div>

      {reservationType === "SELF_SERVICE" ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center">
          <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">
            QR 코드
          </div>
          <p className="mt-3 text-sm text-zinc-500">체크인 시 이 QR 코드를 보여주세요.</p>
        </div>
      ) : (
        <div className="rounded-3xl bg-amber-50 p-4 text-sm text-zinc-700">
          <p className="font-semibold text-zinc-900">전문가 맡기기 안내</p>
          <p className="mt-2">
            패키지 소요 시간 기준으로 예약이 잡혔습니다. 업장에서 시간이 부족하다고 판단하면 정비사가 작업을 인계받고,
            이 경우에도 공임은 전체 기준으로 유지됩니다.
          </p>
        </div>
      )}

      <div className="mt-4 rounded-2xl bg-zinc-100 p-4 text-base text-zinc-700">
        <p className="flex justify-between"><span>예약 방식</span><span>{getReservationTypeLabel(reservationType)}</span></p>
        <p className="mt-2 flex justify-between"><span>작업</span><span>{workTitle}</span></p>
        <p className="mt-2 flex justify-between"><span>일시</span><span>{dateLabel}</span></p>
        {reservationType === "SELF_SERVICE" ? (
          <p className="mt-2 flex justify-between"><span>베이</span><span>{bayLabel}</span></p>
        ) : (
          <p className="mt-2 flex justify-between"><span>블록 시간</span><span>{formatMinutesLabel(blockedMinutes)}</span></p>
        )}
        <p className="mt-2 flex justify-between"><span>차량</span><span>{carLabel}</span></p>
        <p className="mt-2 flex justify-between"><span>예약 ID</span><span className="max-w-[220px] truncate">{reservationId || "(없음)"}</span></p>
      </div>

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 bg-white px-4 pb-3 pt-2">
        <button
          type="button"
          onClick={() => router.push(`/${reservationType === "SELF_SERVICE" ? "checkin" : "in-use"}?${query}`)}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white"
        >
          {reservationType === "SELF_SERVICE" ? "체크인 하러 가기" : "진행 상태 보기"}
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
