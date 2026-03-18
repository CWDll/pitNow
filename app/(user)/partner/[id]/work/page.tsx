"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import {
  formatMinutesLabel,
  getGarageBayIdByNumber,
  getGarageById,
  getGarageShopPackages,
  getReservationTypeLabel,
} from "@/app/(user)/_data/mock-garages";
import {
  getInitialActiveCarId,
  initialMockCars,
  loadMockCarsFromStorage,
} from "@/app/(user)/_data/mock-cars";
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
const selfServiceTitle = "셀프 정비";
const minimumSelfBlocks = 2;

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

function isReservedBlock(blockIdx: number, bayNumber: number): boolean {
  const ranges = mockReservedRangesByBay[bayNumber] ?? [];

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

function canReserveRange(startIdx: number, endExclusive: number, bayNumber: number): boolean {
  if (startIdx < 0 || endExclusive > blockCount || startIdx >= endExclusive) {
    return false;
  }

  for (let idx = startIdx; idx < endExclusive; idx += 1) {
    if (isReservedBlock(idx, bayNumber)) {
      return false;
    }
  }

  return true;
}

function PartnerWorkPageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = parseMode(searchParams.get("mode"));

  const [reservationType, setReservationType] = useState<ReservationType>(initialMode);
  const [cars] = useState(() => loadMockCarsFromStorage() ?? initialMockCars);
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");
  const [selectedCarId, setSelectedCarId] = useState<string>(() =>
    getInitialActiveCarId(loadMockCarsFromStorage() ?? initialMockCars),
  );
  const [isCarPickerOpen, setIsCarPickerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(stripTime(new Date()));
  const [selectedBayNumber, setSelectedBayNumber] = useState(1);
  const [selectedStartIdx, setSelectedStartIdx] = useState<number | null>(null);
  const [selectedEndIdx, setSelectedEndIdx] = useState<number | null>(null);

  const garage = useMemo(() => getGarageById(params.id), [params.id]);
  const packages = useMemo(() => getGarageShopPackages(params.id), [params.id]);
  const selectedCar = useMemo(
    () => cars.find((car) => car.id === selectedCarId) ?? cars[0],
    [cars, selectedCarId],
  );
  const selectedPackage = useMemo(
    () => packages.find((item) => item.id === selectedPackageId) ?? packages[0] ?? null,
    [packages, selectedPackageId],
  );

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(selectedDate, index - 3)),
    [selectedDate],
  );
  const selectedBayId = garage ? getGarageBayIdByNumber(garage.id, selectedBayNumber) : null;
  const startTime = selectedStartIdx !== null ? timeBoundaries[selectedStartIdx] : null;
  const endTime = selectedEndIdx !== null ? timeBoundaries[selectedEndIdx] : null;
  const selectedBlocks =
    selectedStartIdx !== null && selectedEndIdx !== null ? selectedEndIdx - selectedStartIdx : 0;
  const selfTotalPrice =
    garage?.hourlyPrice !== undefined
      ? garage.hourlyPrice + Math.max(0, selectedBlocks - minimumSelfBlocks) * Math.floor(garage.hourlyPrice / 2)
      : 0;
  const canProceedSelf =
    !!garage &&
    !!selectedCar &&
    !!selectedBayId &&
    selectedStartIdx !== null &&
    selectedEndIdx !== null &&
    selectedBlocks >= minimumSelfBlocks;
  const canProceedShop = !!garage && !!selectedCar && !!selectedPackage;

  if (!garage) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold text-zinc-900">예약 방식 선택</h1>
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          정비소 정보를 찾을 수 없습니다.
        </p>
      </section>
    );
  }

  function selectRange(idx: number, bayNumber: number) {
    if (selectedStartIdx === null || selectedEndIdx === null) {
      const defaultEndExclusive = idx + minimumSelfBlocks;
      if (!canReserveRange(idx, defaultEndExclusive, bayNumber)) {
        return;
      }

      setSelectedStartIdx(idx);
      setSelectedEndIdx(defaultEndExclusive);
      return;
    }

    if (idx === selectedEndIdx && canReserveRange(selectedStartIdx, selectedEndIdx + 1, bayNumber)) {
      setSelectedEndIdx(selectedEndIdx + 1);
      return;
    }

    if (idx === selectedStartIdx - 1 && canReserveRange(selectedStartIdx - 1, selectedEndIdx, bayNumber)) {
      setSelectedStartIdx(selectedStartIdx - 1);
      return;
    }

    const defaultEndExclusive = idx + minimumSelfBlocks;
    if (!canReserveRange(idx, defaultEndExclusive, bayNumber)) {
      return;
    }

    setSelectedStartIdx(idx);
    setSelectedEndIdx(defaultEndExclusive);
  }

  function handleProceed() {
    if (!selectedCar) {
      return;
    }

    if (reservationType === "SELF_SERVICE") {
      if (!canProceedSelf || !startTime || !endTime || !selectedBayId) {
        return;
      }

      const weekday = weekdayLabels[selectedDate.getDay()];
      const query = new URLSearchParams({
        reservationType,
        partnerId: garage.id,
        garageName: garage.name,
        carId: selectedCar.id,
        carLabel: `${selectedCar.model} (${selectedCar.year})`,
        dateLabel: `${selectedDate.getMonth() + 1}/${selectedDate.getDate()}(${weekday}) ${startTime} - ${endTime}`,
        startTime: toIsoByDateAndTime(selectedDate, startTime),
        endTime: toIsoByDateAndTime(selectedDate, endTime),
        totalPrice: String(selfTotalPrice),
        blockedMinutes: String(selectedBlocks * 30),
        bayId: selectedBayId,
        bayLabel: `${selectedBayNumber}번 베이`,
        workTitle: selfServiceTitle,
      });

      router.push(`/safety?${query.toString()}`);
      return;
    }

    if (!canProceedShop || !selectedPackage) {
      return;
    }

    const query = new URLSearchParams({
      mode: reservationType,
      carId: selectedCar.id,
      carLabel: `${selectedCar.model} (${selectedCar.year})`,
      packageId: selectedPackage.id,
    });

    router.push(`/partner/${garage.id}/schedule?${query.toString()}`);
  }

  return (
    <section className="pb-24">
      <header className="mb-4 flex items-center gap-2">
        <Link href={`/partner/${garage.id}`} className="text-2xl text-zinc-700" aria-label="뒤로 가기">
          ←
        </Link>
        <h1 className="text-3xl font-semibold text-zinc-900">예약 방식 선택</h1>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-3">
        {(["SELF_SERVICE", "SHOP_SERVICE"] as ReservationType[]).map((mode) => {
          const selected = reservationType === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setReservationType(mode)}
              className={`rounded-3xl border p-4 text-left ${
                selected ? "border-blue-600 bg-blue-50" : "border-zinc-200 bg-white"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                {mode === "SELF_SERVICE" ? "Self" : "Shop"}
              </p>
              <p className="mt-2 text-xl font-semibold text-zinc-900">{getReservationTypeLabel(mode)}</p>
              <p className="mt-2 text-sm text-zinc-600">
                {mode === "SELF_SERVICE"
                  ? "시간과 베이를 직접 예약해서 정비합니다."
                  : "패키지를 선택하고 전문가에게 맡깁니다."}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mb-4 rounded-3xl bg-zinc-100 p-4">
        <p className="mb-2 text-xs text-zinc-500">차량 선택</p>
        <button
          type="button"
          onClick={() => setIsCarPickerOpen(true)}
          className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left"
        >
          <span className="text-lg text-zinc-900">
            {selectedCar ? `${selectedCar.model} (${selectedCar.year}) · ${selectedCar.number}` : "차량 없음"}
          </span>
          <span className="text-sm text-zinc-500">변경</span>
        </button>
      </div>

      {reservationType === "SELF_SERVICE" ? (
        <>
          <div className="mb-4 rounded-3xl bg-zinc-100 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Self Service</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{selfServiceTitle}</p>
            <p className="mt-2 text-sm text-zinc-600">
              기존처럼 시간과 베이를 바로 선택합니다. 기본 1시간을 예약하고, 이어 붙은 시간대를 눌러 30분씩 연장할 수 있습니다.
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

          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-zinc-900">베이 선택</h2>
            <span className="text-sm text-zinc-500">베이마다 예약 가능한 시간이 다릅니다.</span>
          </div>

          <div className={`grid gap-2 ${garage.bayCount > 4 ? "grid-cols-6" : "grid-cols-4"}`}>
            {Array.from({ length: garage.bayCount }).map((_, index) => {
              const bayNumber = index + 1;
              const active = bayNumber === selectedBayNumber;

              return (
                <button
                  key={bayNumber}
                  type="button"
                  onClick={() => {
                    setSelectedBayNumber(bayNumber);
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

          <div className="mt-6 rounded-3xl bg-zinc-100 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-zinc-900">시작 시간 선택</h2>
              <span className="text-sm text-zinc-500">30분 단위</span>
            </div>
            <p className="mb-3 text-sm text-zinc-500">
              처음 선택 시 기본 1시간이 예약되고, 선택된 구간 양옆의 시간대를 누르면 30분씩 연장됩니다.
            </p>

            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: blockCount }).map((_, idx) => {
                const reserved = isReservedBlock(idx, selectedBayNumber);
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
                    onClick={() => selectRange(idx, selectedBayNumber)}
                    className={`rounded-xl px-2 py-3 text-xs font-medium ${
                      reserved
                        ? "bg-zinc-300 text-zinc-500"
                        : selected
                          ? "bg-amber-400 text-white"
                          : "bg-white text-zinc-700"
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
                <span>{selfServiceTitle}</span>
              </p>
              <p className="flex justify-between">
                <span>차량</span>
                <span>{selectedCar ? `${selectedCar.model} (${selectedCar.year})` : "-"}</span>
              </p>
              <p className="flex justify-between">
                <span>베이</span>
                <span>{selectedBayNumber}번 베이</span>
              </p>
              <p className="flex justify-between">
                <span>블록 시간</span>
                <span>{formatMinutesLabel(selectedBlocks * 30)}</span>
              </p>
              <div className="my-2 border-t border-zinc-200" />
              <p className="flex justify-between text-xl font-semibold text-zinc-900">
                <span>결제 금액</span>
                <span className="text-blue-600">{selfTotalPrice.toLocaleString("ko-KR")}원</span>
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          {packages.map((item) => {
            const selected = item.id === (selectedPackage?.id ?? "");

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedPackageId(item.id)}
                className={`w-full rounded-3xl border p-4 text-left ${
                  selected ? "border-zinc-900 bg-amber-50" : "border-zinc-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-2xl font-semibold text-zinc-900">{item.name}</p>
                    <p className="mt-2 text-base text-zinc-600">{item.summary}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-semibold text-zinc-900">{item.price.toLocaleString("ko-KR")}원</p>
                    <p className="mt-1 text-sm text-zinc-500">{formatMinutesLabel(item.durationMinutes)}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.includes.map((value) => (
                    <span key={value} className="rounded-full bg-white px-3 py-1 text-xs text-zinc-700">
                      {value}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 bg-white px-4 pb-3 pt-2">
        <button
          type="button"
          disabled={reservationType === "SELF_SERVICE" ? !canProceedSelf : !canProceedShop}
          onClick={handleProceed}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white disabled:bg-zinc-300"
        >
          {reservationType === "SELF_SERVICE" ? "안전 동의로 이동" : "시간 선택으로 이동"}
        </button>
      </div>

      {isCarPickerOpen ? (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/35">
          <div className="mb-16 w-full rounded-t-3xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900">차량 선택</h3>
              <button type="button" onClick={() => setIsCarPickerOpen(false)} className="text-sm text-zinc-500">
                닫기
              </button>
            </div>
            <div className="space-y-2">
              {cars.map((car) => {
                const selected = car.id === selectedCarId;

                return (
                  <button
                    key={car.id}
                    type="button"
                    onClick={() => {
                      setSelectedCarId(car.id);
                      setIsCarPickerOpen(false);
                    }}
                    className={`w-full rounded-xl border px-3 py-3 text-left ${
                      selected ? "border-blue-500 bg-blue-50" : "border-zinc-200 bg-white"
                    }`}
                  >
                    <p className="text-base font-semibold text-zinc-900">{car.number}</p>
                    <p className="mt-1 text-sm text-zinc-600">
                      {car.model} ({car.year})
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function PartnerWorkPage() {
  return (
    <Suspense fallback={<section className="pb-24" />}>
      <PartnerWorkPageContent />
    </Suspense>
  );
}
