"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import {
  getGarageById,
  getGarageBayIdByNumber,
  getGarageShopPackages,
  selfMaintenanceTaskOptions,
  workOptions,
} from "../../../_data/mock-garages";
import {
  getInitialActiveCarId,
  initialMockCars,
  loadMockCarsFromStorage,
} from "@/app/(user)/_data/mock-cars";
import type { ReservationType } from "@/src/domain/types";

function levelClass(level: "초급" | "중급"): string {
  return level === "초급"
    ? "bg-emerald-50 text-emerald-600"
    : "bg-amber-50 text-amber-600";
}

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

const mockReservedRangesByBay: Record<
  number,
  Array<{ start: string; end: string }>
> = {
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
    return (
      startIdx >= 0 && endIdx >= 0 && blockIdx >= startIdx && blockIdx < endIdx
    );
  });
}

function toIsoByDateAndTime(date: Date, time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      hour,
      minute,
      0,
      0,
    ),
  ).toISOString();
}

function canReserveRange(
  startIdx: number,
  endExclusive: number,
  bayNumber: number,
): boolean {
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

  const [reservationType, setReservationType] =
    useState<ReservationType>(initialMode);
  const [cars] = useState(() => loadMockCarsFromStorage() ?? initialMockCars);
  const [bookingMode, setBookingMode] = useState<"SELF" | "PACKAGE">("SELF");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([
    selfMaintenanceTaskOptions[0].id,
  ]);
  const [selectedPackageId, setSelectedPackageId] = useState<string>(
    workOptions[0].id,
  );
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
    () =>
      packages.find((item) => item.id === selectedPackageId) ??
      packages[0] ??
      null,
    [packages, selectedPackageId],
  );
  const shouldScrollCars = cars.length > 3;

  const weekDates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => addDays(selectedDate, index - 3)),
    [selectedDate],
  );
  const selectedBayId = garage
    ? getGarageBayIdByNumber(garage.id, selectedBayNumber)
    : null;
  const startTime =
    selectedStartIdx !== null ? timeBoundaries[selectedStartIdx] : null;
  const endTime =
    selectedEndIdx !== null ? timeBoundaries[selectedEndIdx] : null;
  const selectedBlocks =
    selectedStartIdx !== null && selectedEndIdx !== null
      ? selectedEndIdx - selectedStartIdx
      : 0;
  const selfTotalPrice =
    garage?.hourlyPrice !== undefined
      ? garage.hourlyPrice +
        Math.max(0, selectedBlocks - minimumSelfBlocks) *
          Math.floor(garage.hourlyPrice / 2)
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

    if (
      idx === selectedEndIdx &&
      canReserveRange(selectedStartIdx, selectedEndIdx + 1, bayNumber)
    ) {
      setSelectedEndIdx(selectedEndIdx + 1);
      return;
    }

    if (
      idx === selectedStartIdx - 1 &&
      canReserveRange(selectedStartIdx - 1, selectedEndIdx, bayNumber)
    ) {
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
        <Link
          href={`/partner/${garage.id}`}
          className="text-2xl text-zinc-700"
          aria-label="뒤로가기"
        >
          ←
        </Link>
        <h1 className="text-3xl font-semibold text-zinc-900">예약 방식 선택</h1>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setBookingMode("SELF")}
          className={`rounded-2xl px-3 py-3 text-sm font-semibold ${
            bookingMode === "SELF"
              ? "bg-blue-600 text-white"
              : "bg-zinc-100 text-zinc-700"
          }`}
        >
          시간제 예약
        </button>
        <button
          type="button"
          onClick={() => setBookingMode("PACKAGE")}
          className={`rounded-2xl px-3 py-3 text-sm font-semibold ${
            bookingMode === "PACKAGE"
              ? "bg-blue-600 text-white"
              : "bg-zinc-100 text-zinc-700"
          }`}
        >
          패키지 예약
        </button>
      </div>

      {bookingMode === "SELF" ? (
        <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          법적으로 허용된 셀프 정비 작업만 선택할 수 있습니다.
        </p>
      ) : null}

      <div className="mb-4 rounded-2xl bg-zinc-100 px-4 py-3">
        <p className="mb-1 block text-xs text-zinc-500">내 차 선택</p>
        <button
          type="button"
          onClick={() => setIsCarPickerOpen(true)}
          className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left"
        >
          <span className="text-lg text-zinc-800">
            {selectedCar
              ? `${selectedCar.model} (${selectedCar.year}) · ${selectedCar.number}`
              : "차량 없음"}
          </span>
          <span className="text-sm text-zinc-500">변경</span>
        </button>
      </div>

      <div className="space-y-3">
        {bookingMode === "SELF"
          ? selfMaintenanceTaskOptions.map((option) => {
              const selected = selectedTaskIds.includes(option.id);

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() =>
                    setSelectedTaskIds((prev) =>
                      prev.includes(option.id)
                        ? prev.filter((id) => id !== option.id)
                        : [...prev, option.id],
                    )
                  }
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selected
                      ? "border-blue-500 bg-blue-50/40"
                      : "border-zinc-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-2xl font-medium text-zinc-900">
                      {option.title}
                    </p>
                    {selected ? (
                      <span className="rounded-full bg-blue-600 px-2 py-1 text-xs font-semibold text-white">
                        선택됨
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span
                      className={`rounded-full px-2 py-1 font-medium ${levelClass(option.level)}`}
                    >
                      {option.level}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium text-zinc-600">
                      검수 가산{" "}
                      {option.helperVerifyUnitFee.toLocaleString("ko-KR")}원
                    </span>
                  </div>

                  <p className="mt-2 text-base text-zinc-600">
                    {option.description}
                  </p>
                </button>
              );
            })
          : workOptions.map((option) => {
              const selected = selectedPackageId === option.id;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedPackageId(option.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selected
                      ? "border-blue-500 bg-blue-50/40"
                      : "border-zinc-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-2xl font-medium text-zinc-900">
                      {option.title}
                    </p>
                    {selected ? (
                      <span className="rounded-full bg-blue-600 px-2 py-1 text-xs font-semibold text-white">
                        선택됨
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span
                      className={`rounded-full px-2 py-1 font-medium ${levelClass(option.level)}`}
                    >
                      {option.level}
                    </span>
                    {option.helperRequired ? (
                      <span className="rounded-full bg-rose-50 px-2 py-1 font-medium text-rose-600">
                        헬퍼 필수
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-2 text-base text-zinc-600">
                    {option.description}
                  </p>
                  <p className="mt-1 text-base text-zinc-500">
                    ◷ {option.durationLabel}
                  </p>
                </button>
              );
            })}
      </div>

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-107.5 -translate-x-1/2 bg-white px-4 pb-3 pt-2">
        <button
          type="button"
          disabled={
            !selectedCar ||
            (bookingMode === "SELF" && selectedTaskIds.length === 0) ||
            (bookingMode === "PACKAGE" && !selectedPackageId)
          }
          onClick={() =>
            selectedCar
              ? router.push(
                  `/partner/${garage.id}/schedule?bookingMode=${bookingMode}&taskIds=${encodeURIComponent(
                    selectedTaskIds.join(","),
                  )}&taskLabels=${encodeURIComponent(
                    selfMaintenanceTaskOptions
                      .filter((task) => selectedTaskIds.includes(task.id))
                      .map((task) => task.title)
                      .join(", "),
                  )}&packageId=${encodeURIComponent(selectedPackageId)}&packageTitle=${encodeURIComponent(
                    workOptions.find(
                      (option) => option.id === selectedPackageId,
                    )?.title ?? "패키지",
                  )}&carId=${selectedCar.id}&carLabel=${encodeURIComponent(`${selectedCar.model} (${selectedCar.year})`)}`,
                )
              : null
          }
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white disabled:bg-zinc-300"
        >
          {reservationType === "SELF_SERVICE"
            ? "안전 동의로 이동"
            : "시간 선택으로 이동"}
        </button>
      </div>

      {isCarPickerOpen ? (
        <div className="fixed inset-0 z-80 flex items-end bg-black/35">
          <div className="mb-16 w-full rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900">차량 선택</h3>
              <button
                type="button"
                onClick={() => setIsCarPickerOpen(false)}
                className="text-sm text-zinc-500"
              >
                닫기
              </button>
            </div>
            <div
              className={`space-y-2 ${shouldScrollCars ? "max-h-60 overflow-y-auto pr-1" : ""}`}
            >
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
                      selected
                        ? "border-blue-500 bg-blue-50"
                        : "border-zinc-200 bg-white"
                    }`}
                  >
                    <p className="text-base font-semibold text-zinc-900">
                      {car.number}
                    </p>
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
