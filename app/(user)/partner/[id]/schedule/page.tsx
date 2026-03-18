"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import {
  formatMinutesLabel,
  getGarageById,
  getReservationTypeLabel,
  getSelfWorkById,
  getShopPackageById,
  roundUpToBlockMinutes,
} from "@/app/(user)/_data/mock-garages";
import type { ReservationType } from "@/src/domain/types";

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"] as const;
const timeBoundaries = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
  "18:30",
  "19:00",
] as const;

const blockCount = timeBoundaries.length - 1;

const mockReservedRangesByBay: Record<number, Array<{ start: string; end: string }>> = {
  1: [
    { start: "10:30", end: "12:00" },
    { start: "15:00", end: "16:00" },
  ],
  2: [
    { start: "09:30", end: "11:00" },
    { start: "14:30", end: "15:30" },
  ],
  3: [
    { start: "09:00", end: "10:30" },
    { start: "16:30", end: "17:00" },
  ],
  4: [
    { start: "11:30", end: "13:00" },
    { start: "17:00", end: "18:00" },
  ],
  5: [
    { start: "10:00", end: "11:30" },
    { start: "15:30", end: "16:30" },
  ],
  6: [
    { start: "13:00", end: "14:30" },
    { start: "17:30", end: "18:30" },
  ],
};

function parseMode(value: string | null): ReservationType {
  return value === "SHOP_SERVICE" ? "SHOP_SERVICE" : "SELF_SERVICE";
}

function stripTime(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return stripTime(next);
}

function boundaryIndex(time: string): number {
  return timeBoundaries.findIndex((value) => value === time);
}

function isReservedBlock(blockIdx: number, bay: number): boolean {
  const ranges = mockReservedRangesByBay[bay] ?? [];

  return ranges.some((range) => {
    const startIdx = boundaryIndex(range.start);
    const endIdx = boundaryIndex(range.end);
    return startIdx >= 0 && endIdx >= 0 && blockIdx >= startIdx && blockIdx < endIdx;
  });
}

function toIsoByDateAndTime(date: Date, time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0)).toISOString();
}

function PartnerSchedulePageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const reservationType = parseMode(searchParams.get("mode"));
  const garage = useMemo(() => getGarageById(params.id), [params.id]);
  const selfWork = useMemo(() => getSelfWorkById(searchParams.get("workId") ?? ""), [searchParams]);
  const selectedPackage = useMemo(() => getShopPackageById(searchParams.get("packageId") ?? ""), [searchParams]);

  const [selectedDate, setSelectedDate] = useState<Date>(stripTime(new Date()));
  const [selectedBay, setSelectedBay] = useState<number>(3);
  const [selectedStartIdx, setSelectedStartIdx] = useState<number | null>(null);
  const [selectedEndIdx, setSelectedEndIdx] = useState<number | null>(null);

  const carId = searchParams.get("carId") ?? "";
  const carLabel = searchParams.get("carLabel") ?? "아반떼 CN7";

  if (!garage) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold text-zinc-900">시간 선택</h1>
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          정비소 정보를 찾을 수 없습니다.
        </p>
      </section>
    );
  }

  const resolvedGarage = garage;

  const requiredBlocks =
    reservationType === "SELF_SERVICE"
      ? Math.max(2, Math.ceil((selfWork?.recommendedMinutes ?? 60) / 30))
      : Math.max(1, roundUpToBlockMinutes(selectedPackage?.durationMinutes ?? 30) / 30);

  const weekDates = Array.from({ length: 7 }, (_, index) => addDays(selectedDate, index - 3));
  const startTime = selectedStartIdx !== null ? timeBoundaries[selectedStartIdx] : null;
  const endTime = selectedEndIdx !== null ? timeBoundaries[selectedEndIdx] : null;
  const selectedBlocks =
    selectedStartIdx !== null && selectedEndIdx !== null ? selectedEndIdx - selectedStartIdx : 0;
  const canProceed = selectedStartIdx !== null && selectedEndIdx !== null && selectedBlocks === requiredBlocks;

  const totalPrice =
    reservationType === "SELF_SERVICE"
      ? resolvedGarage.hourlyPrice + Math.max(0, selectedBlocks - 2) * Math.floor(resolvedGarage.hourlyPrice / 2)
      : selectedPackage?.priceByGarageId[resolvedGarage.id] ?? 0;

  function selectRange(startIdx: number, bay: number) {
    const endExclusive = startIdx + requiredBlocks;
    if (endExclusive > blockCount) {
      return;
    }

    for (let idx = startIdx; idx < endExclusive; idx += 1) {
      if (isReservedBlock(idx, bay)) {
        return;
      }
    }

    setSelectedStartIdx(startIdx);
    setSelectedEndIdx(endExclusive);
  }

  function goNext() {
    if (!canProceed || !startTime || !endTime) {
      return;
    }

    const weekday = weekdayLabels[selectedDate.getDay()];
    const query = new URLSearchParams({
      reservationType,
      partnerId: resolvedGarage.id,
      garageName: resolvedGarage.name,
      carId,
      carLabel,
      dateLabel: `${selectedDate.getMonth() + 1}/${selectedDate.getDate()}(${weekday}) ${startTime} - ${endTime}`,
      startTime: toIsoByDateAndTime(selectedDate, startTime),
      endTime: toIsoByDateAndTime(selectedDate, endTime),
      totalPrice: String(totalPrice),
      blockedMinutes: String(selectedBlocks * 30),
      bayId: resolvedGarage.bayId,
      bayLabel: `${selectedBay}번 베이`,
    });

    if (reservationType === "SELF_SERVICE" && selfWork) {
      query.set("workId", selfWork.id);
      query.set("workTitle", selfWork.title);
      router.push(`/safety?${query.toString()}`);
      return;
    }

    if (reservationType === "SHOP_SERVICE" && selectedPackage) {
      query.set("packageId", selectedPackage.id);
      query.set("workTitle", selectedPackage.name);
      query.set("packageMinutes", String(selectedPackage.durationMinutes));
      router.push(`/payment?${query.toString()}`);
    }
  }

  return (
    <section className="pb-24">
      <header className="mb-4 flex items-center gap-2">
        <Link href={`/partner/${resolvedGarage.id}/work?mode=${reservationType}`} className="text-2xl text-zinc-700" aria-label="뒤로가기">
          ←
        </Link>
        <h1 className="text-3xl font-semibold text-zinc-900">시간 선택</h1>
      </header>

      <div className="mb-4 rounded-3xl bg-zinc-100 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
          {reservationType === "SELF_SERVICE" ? "Self Service" : "Shop Service"}
        </p>
        <p className="mt-2 text-2xl font-semibold text-zinc-900">{getReservationTypeLabel(reservationType)}</p>
        <p className="mt-2 text-sm text-zinc-600">
          {reservationType === "SELF_SERVICE"
            ? "기본 1시간부터 예약하며 30분 단위로 늘어납니다."
            : "패키지 시간만큼 자동으로 예약 시간이 블록됩니다."}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-7 gap-2">
        {weekDates.map((date) => {
          const active = date.getTime() === selectedDate.getTime();
          return (
            <button
              key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
              type="button"
              onClick={() => setSelectedDate(date)}
              className={`rounded-2xl px-2 py-3 text-center ${
                active ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-700"
              }`}
            >
              <p className="text-xs">{weekdayLabels[date.getDay()]}</p>
              <p className="text-2xl font-semibold">{date.getDate()}</p>
            </button>
          );
        })}
      </div>

      {reservationType === "SELF_SERVICE" ? (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-zinc-900">베이 선택</h2>
            <span className="text-sm text-zinc-500">베이마다 예약 가능 시간이 다릅니다.</span>
          </div>

          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: resolvedGarage.bayCount }).map((_, index) => {
              const bayNumber = index + 1;
              const active = bayNumber === selectedBay;

              return (
                <button
                  key={bayNumber}
                  type="button"
                  onClick={() => {
                    setSelectedBay(bayNumber);
                    setSelectedStartIdx(null);
                    setSelectedEndIdx(null);
                  }}
                  className={`rounded-xl px-2 py-3 text-lg font-medium ${
                    active ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-800"
                  }`}
                >
                  {bayNumber}번
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="mb-4 rounded-3xl bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">배정 베이는 업장에서 내부 배정합니다.</p>
          <p className="mt-2 text-sm text-zinc-700">
            고객은 시작 시간을 선택하고, 시스템은 패키지 소요 시간을 30분 단위로 올림해 예약을 막습니다.
          </p>
        </div>
      )}

      <div className="mt-6 rounded-3xl bg-zinc-100 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-zinc-900">시작 시간 선택</h2>
          <span className="text-sm text-zinc-500">30분 단위</span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: blockCount }).map((_, idx) => {
            const reserved = isReservedBlock(idx, selectedBay);
            const selected =
              selectedStartIdx !== null &&
              selectedEndIdx !== null &&
              idx >= selectedStartIdx &&
              idx < selectedEndIdx;

            return (
              <button
                key={`block-${idx}`}
                type="button"
                disabled={reserved}
                onClick={() => selectRange(idx, selectedBay)}
                className={`rounded-xl px-2 py-3 text-xs font-medium ${
                  reserved ? "bg-zinc-300 text-zinc-500" : selected ? "bg-amber-400 text-white" : "bg-white text-zinc-700"
                }`}
              >
                {timeBoundaries[idx]}
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-sm text-zinc-600">
          예약 시간: {startTime ?? "-"} ~ {endTime ?? "-"}
        </p>
      </div>

      <div className="mt-6 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
        <h3 className="text-2xl font-semibold text-zinc-900">예약 요약</h3>
        <div className="mt-3 space-y-2 text-base text-zinc-700">
          <p className="flex justify-between">
            <span>예약 방식</span>
            <span>{getReservationTypeLabel(reservationType)}</span>
          </p>
          <p className="flex justify-between">
            <span>작업</span>
            <span>{reservationType === "SELF_SERVICE" ? selfWork?.title : selectedPackage?.name}</span>
          </p>
          <p className="flex justify-between">
            <span>차량</span>
            <span>{carLabel}</span>
          </p>
          {reservationType === "SELF_SERVICE" ? (
            <p className="flex justify-between">
              <span>베이</span>
              <span>{selectedBay}번 베이</span>
            </p>
          ) : null}
          <p className="flex justify-between">
            <span>블록 시간</span>
            <span>{formatMinutesLabel(selectedBlocks * 30)}</span>
          </p>
          {reservationType === "SHOP_SERVICE" && selectedPackage ? (
            <p className="flex justify-between text-sm text-zinc-500">
              <span>패키지 실소요</span>
              <span>{formatMinutesLabel(selectedPackage.durationMinutes)}</span>
            </p>
          ) : null}
          <div className="my-2 border-t border-zinc-200" />
          <p className="flex justify-between text-xl font-semibold text-zinc-900">
            <span>결제 금액</span>
            <span className="text-blue-600">{totalPrice.toLocaleString("ko-KR")}원</span>
          </p>
        </div>
      </div>

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 bg-white px-4 pb-3 pt-2">
        <button
          type="button"
          onClick={goNext}
          disabled={!canProceed}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white disabled:bg-zinc-300 disabled:text-zinc-500"
        >
          {reservationType === "SELF_SERVICE" ? "안전 동의로 이동" : "결제로 이동"}
        </button>
      </div>
    </section>
  );
}

export default function PartnerSchedulePage() {
  return (
    <Suspense fallback={<section className="pb-24" />}>
      <PartnerSchedulePageContent />
    </Suspense>
  );
}
