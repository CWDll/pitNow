"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import {
  getGarageById,
  selfMaintenanceTaskOptions,
  workOptions,
} from "../../../_data/mock-garages";

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"] as const;
const timeBoundaries = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
] as const;

const blockCount = timeBoundaries.length - 1;
const MIN_BLOCKS = 1;

const mockReservedRangesByBay: Record<
  number,
  Array<{ start: string; end: string }>
> = {
  1: [
    { start: "10:00", end: "12:00" },
    { start: "16:00", end: "18:00" },
  ],
  2: [
    { start: "09:00", end: "11:00" },
    { start: "14:00", end: "16:00" },
  ],
  3: [
    { start: "11:00", end: "13:00" },
    { start: "17:00", end: "19:00" },
  ],
  4: [
    { start: "12:00", end: "14:00" },
    { start: "18:00", end: "20:00" },
  ],
  5: [
    { start: "10:00", end: "11:00" },
    { start: "15:00", end: "17:00" },
  ],
  6: [
    { start: "13:00", end: "15:00" },
    { start: "19:00", end: "20:00" },
  ],
};

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
  const [hour, minute] = time.split(":").map((value) => Number(value));
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

function parseDurationHours(durationLabel: string): number {
  const matched = durationLabel.match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!matched) {
    return 1;
  }

  const value = Number.parseFloat(matched[1]);
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(value));
}

function formatMonthLabel(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function formatMonthValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function monthValueToDate(monthValue: string, prevDate: Date): Date | null {
  const [yearRaw, monthRaw] = monthValue.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }

  const lastDay = new Date(year, month, 0).getDate();
  const nextDay = Math.min(prevDate.getDate(), lastDay);

  return new Date(year, month - 1, nextDay);
}

function PartnerSchedulePageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const garage = useMemo(() => getGarageById(params.id), [params.id]);

  const [selectedDate, setSelectedDate] = useState<Date>(stripTime(new Date()));
  const [selectedBay, setSelectedBay] = useState<number>(3);
  const [selectedStartIdx, setSelectedStartIdx] = useState<number | null>(null);
  const [selectedEndIdx, setSelectedEndIdx] = useState<number | null>(null);
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState<boolean>(false);
  const [carMasterVerifyRequested, setCarMasterVerifyRequested] =
    useState<boolean>(false);

  const bookingMode =
    searchParams.get("bookingMode") === "PACKAGE" ? "PACKAGE" : "SELF";
  const taskIds = searchParams.get("taskIds") ?? "";
  const taskLabels = searchParams.get("taskLabels") ?? "선택 작업 없음";
  const packageId = searchParams.get("packageId") ?? "";
  const packageTitle = searchParams.get("packageTitle") ?? "패키지";
  const carId = searchParams.get("carId") ?? "";
  const carLabel = searchParams.get("carLabel") ?? "현대 아반떼 CN7";

  if (!garage) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold text-zinc-900">
          시간 / 베이 선택
        </h1>
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          정비소 정보를 찾을 수 없습니다.
        </p>
      </section>
    );
  }

  const safeGarage = garage;

  const weekDates = Array.from({ length: 7 }, (_, index) =>
    addDays(selectedDate, index - 3),
  );

  const hasSelection = selectedStartIdx !== null && selectedEndIdx !== null;
  const selectedBlocks = hasSelection ? selectedEndIdx - selectedStartIdx : 0;
  const startTime = hasSelection ? timeBoundaries[selectedStartIdx] : null;
  const endTime = hasSelection ? timeBoundaries[selectedEndIdx] : null;
  const blockedUntilTime = hasSelection
    ? timeBoundaries[selectedEndIdx + 1]
    : null;

  const totalPrice = selectedBlocks * garage.hourlyPrice;

  const selectedPackage =
    workOptions.find((option) => option.id === packageId) ?? null;
  const packageDurationBlocks =
    bookingMode === "PACKAGE"
      ? parseDurationHours(selectedPackage?.durationLabel ?? "1시간")
      : 0;

  const selectedSelfTasks = selfMaintenanceTaskOptions.filter((option) =>
    taskIds
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .includes(option.id),
  );

  const carMasterVerifyFee =
    bookingMode === "SELF" && carMasterVerifyRequested
      ? 5000 +
        selectedSelfTasks.reduce(
          (sum, task) => sum + task.helperVerifyUnitFee,
          0,
        )
      : 0;

  const totalPriceWithVerify = totalPrice + carMasterVerifyFee;

  const meetsMinimum = selectedBlocks >= MIN_BLOCKS;
  const canProceed =
    bookingMode === "PACKAGE"
      ? hasSelection && selectedBlocks === packageDurationBlocks
      : hasSelection && meetsMinimum;

  function handleWeekShift(daysToMove: number) {
    setSelectedDate((prev) =>
      addDays(prev ?? stripTime(new Date()), daysToMove),
    );
  }

  function handleMonthChange(monthValue: string) {
    const next = monthValueToDate(monthValue, selectedDate);
    if (!next) {
      return;
    }

    setSelectedDate(next);
  }

  function handleBayChange(nextBay: number) {
    setSelectedBay(nextBay);

    if (!hasSelection) {
      return;
    }

    if (!isRangeSelectable(selectedStartIdx, selectedEndIdx, nextBay)) {
      setSelectedStartIdx(null);
      setSelectedEndIdx(null);
    }
  }

  function isRangeSelectable(
    startIdx: number,
    endExclusiveIdx: number,
    bay: number,
  ): boolean {
    if (
      startIdx < 0 ||
      endExclusiveIdx > blockCount ||
      startIdx >= endExclusiveIdx
    ) {
      return false;
    }

    const blockedUntilIdx = endExclusiveIdx + 1;
    if (blockedUntilIdx > blockCount) {
      return false;
    }

    for (let i = startIdx; i < blockedUntilIdx; i += 1) {
      if (isReservedBlock(i, bay)) {
        return false;
      }
    }

    return true;
  }

  function applySingleSelection(blockIdx: number) {
    const endExclusiveIdx =
      bookingMode === "PACKAGE"
        ? blockIdx + packageDurationBlocks
        : blockIdx + 1;

    if (!isRangeSelectable(blockIdx, endExclusiveIdx, selectedBay)) {
      return;
    }

    setSelectedStartIdx(blockIdx);
    setSelectedEndIdx(endExclusiveIdx);
  }

  function applyRangeFromStart(startIdx: number, targetIdx: number) {
    if (bookingMode === "PACKAGE") {
      applySingleSelection(targetIdx);
      return;
    }

    const endExclusive = targetIdx + 1;
    if (
      targetIdx >= startIdx &&
      isRangeSelectable(startIdx, endExclusive, selectedBay)
    ) {
      setSelectedStartIdx(startIdx);
      setSelectedEndIdx(endExclusive);
      return;
    }

    applySingleSelection(targetIdx);
  }

  function handleBlockClick(blockIdx: number) {
    if (isReservedBlock(blockIdx, selectedBay)) {
      return;
    }

    if (!hasSelection) {
      applySingleSelection(blockIdx);
      return;
    }

    if (bookingMode === "PACKAGE") {
      applySingleSelection(blockIdx);
      return;
    }

    if (selectedStartIdx !== null && blockIdx === selectedStartIdx) {
      setSelectedStartIdx(null);
      setSelectedEndIdx(null);
      return;
    }

    if (selectedStartIdx !== null && blockIdx >= selectedStartIdx) {
      applyRangeFromStart(selectedStartIdx, blockIdx);
      return;
    }

    applySingleSelection(blockIdx);
  }

  function goNextPage() {
    if (!canProceed || !startTime || !endTime || !blockedUntilTime) {
      return;
    }

    const selectedWeekdayLabel = weekdayLabels[selectedDate.getDay()];
    const query = new URLSearchParams({
      bookingMode,
      partnerId: safeGarage.id,
      garageName: safeGarage.name,
      taskIds,
      taskLabels,
      selectedTaskCount: String(
        taskIds
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean).length,
      ),
      packageId,
      packageTitle,
      carId,
      carLabel,
      dateLabel: `${selectedDate.getMonth() + 1}/${selectedDate.getDate()}(${selectedWeekdayLabel}) ${startTime} - ${endTime}`,
      bayLabel: `${selectedBay}번 베이`,
      bayId: safeGarage.bayId,
      startTime: toIsoByDateAndTime(selectedDate, startTime),
      endTime: toIsoByDateAndTime(selectedDate, endTime),
      blockedUntil: toIsoByDateAndTime(selectedDate, blockedUntilTime),
      totalPrice: String(totalPriceWithVerify),
      helperVerifyRequested: String(carMasterVerifyRequested),
      helperVerifyFee: String(carMasterVerifyFee),
    });

    if (bookingMode === "PACKAGE") {
      router.push(`/payment?${query.toString()}`);
      return;
    }

    router.push(`/safety?${query.toString()}`);
  }

  return (
    <section className="pb-24">
      <header className="mb-4 flex items-center gap-2">
        <Link
          href={`/partner/${garage.id}/work`}
          className="text-2xl text-zinc-700"
          aria-label="뒤로가기"
        >
          ←
        </Link>
        <h1 className="text-3xl font-semibold text-zinc-900">
          시간 / 베이 선택
        </h1>
      </header>

      <div className="mb-4 rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
        <p className="font-semibold text-zinc-900">예약 방식</p>
        <p className="mt-1">
          {bookingMode === "PACKAGE" ? "패키지 예약" : "시간제 예약"}
        </p>
        <p className="mt-2 font-semibold text-zinc-900">선택 항목</p>
        <p className="mt-1">
          {bookingMode === "PACKAGE" ? packageTitle : taskLabels}
        </p>
      </div>

      <div className="mb-4 flex items-center justify-between px-1">
        <button
          type="button"
          className="text-xl text-zinc-500"
          onClick={() => handleWeekShift(-7)}
        >
          ‹
        </button>
        <button
          type="button"
          className="text-2xl font-semibold text-zinc-900"
          onClick={() => setIsMonthPickerOpen((prev) => !prev)}
        >
          {formatMonthLabel(selectedDate)}
        </button>
        <button
          type="button"
          className="text-xl text-zinc-500"
          onClick={() => handleWeekShift(7)}
        >
          ›
        </button>
      </div>

      {isMonthPickerOpen ? (
        <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-3">
          <label className="mb-1 block text-sm text-zinc-600">월 선택</label>
          <input
            type="month"
            value={formatMonthValue(selectedDate)}
            onChange={(event) => handleMonthChange(event.target.value)}
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => setIsMonthPickerOpen(false)}
            className="mt-2 w-full rounded-xl bg-zinc-100 py-2 text-sm font-medium text-zinc-700"
          >
            닫기
          </button>
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-7 gap-2">
        {weekDates.map((date) => {
          const active = date.getTime() === selectedDate.getTime();
          return (
            <button
              key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
              type="button"
              onClick={() => setSelectedDate(date)}
              className={`rounded-2xl px-2 py-3 text-center ${active ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-700"}`}
            >
              <p className="text-xs">{weekdayLabels[date.getDay()]}</p>
              <p className="text-2xl font-semibold">{date.getDate()}</p>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-zinc-900">베이 선택</h2>
        <span className="text-sm text-zinc-500">
          버퍼 포함 가능 시간만 선택
        </span>
      </div>

      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: garage.bayCount }).map((_, index) => {
          const bayNumber = index + 1;
          const active = bayNumber === selectedBay;

          return (
            <button
              key={bayNumber}
              type="button"
              onClick={() => handleBayChange(bayNumber)}
              className={`rounded-xl px-2 py-3 text-lg font-medium ${active ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-800"}`}
            >
              {bayNumber}번
            </button>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl bg-zinc-100 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-zinc-900">시간 선택</h2>
          <span className="text-sm text-zinc-500">
            블록 연속 선택 + 종료 후 1시간 버퍼
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: blockCount }).map((_, idx) => {
            const reserved = isReservedBlock(idx, selectedBay);
            const selectable =
              bookingMode === "PACKAGE"
                ? isRangeSelectable(
                    idx,
                    idx + packageDurationBlocks,
                    selectedBay,
                  )
                : !reserved;
            const selected =
              hasSelection &&
              selectedStartIdx !== null &&
              selectedEndIdx !== null &&
              idx >= selectedStartIdx &&
              idx < selectedEndIdx;

            return (
              <button
                key={`block-${idx}`}
                type="button"
                disabled={!selectable}
                onClick={() => handleBlockClick(idx)}
                className={`rounded-xl px-2 py-3 text-xs font-medium ${
                  !selectable
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

        <p className="mt-3 text-sm text-zinc-600">
          작업 시간: {startTime ?? "-"} ~ {endTime ?? "-"}
        </p>
        <p className="mt-1 text-sm text-zinc-600">
          버퍼 포함 블록: {startTime ?? "-"} ~ {blockedUntilTime ?? "-"}
        </p>

        {!meetsMinimum && hasSelection ? (
          <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            최소 예약 시간은 1시간입니다.
          </p>
        ) : null}
      </div>

      <div className="mt-6 rounded-2xl bg-zinc-100 p-4">
        <h3 className="mb-3 text-2xl font-semibold text-zinc-900">요금 요약</h3>
        <div className="space-y-1 text-lg text-zinc-700">
          <div className="flex items-center justify-between">
            <span>시간당 요금</span>
            <span>{garage.hourlyPrice.toLocaleString("ko-KR")}원</span>
          </div>
          <div className="flex items-center justify-between">
            <span>선택 시간</span>
            <span>{selectedBlocks}시간</span>
          </div>
          {bookingMode === "SELF" ? (
            <div className="flex items-center justify-between">
              <span>카 마스터 검수</span>
              <span>{carMasterVerifyFee.toLocaleString("ko-KR")}원</span>
            </div>
          ) : null}
          <div className="my-2 border-t border-zinc-300" />
          <div className="flex items-center justify-between text-2xl font-semibold text-zinc-900">
            <span>합계</span>
            <span className="text-blue-600">
              {totalPriceWithVerify.toLocaleString("ko-KR")}원
            </span>
          </div>
        </div>
      </div>

      {bookingMode === "SELF" ? (
        <label className="mt-4 flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-800">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5"
            checked={carMasterVerifyRequested}
            onChange={() => setCarMasterVerifyRequested((prev) => !prev)}
          />
          <span>
            카 마스터 검수
            <br />
            <span className="text-sm text-zinc-500">
              기본 5,000원 + 선택 작업 검수 가산
            </span>
          </span>
        </label>
      ) : null}

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-107.5 -translate-x-1/2 bg-white px-4 pb-3 pt-2">
        <button
          type="button"
          onClick={goNextPage}
          disabled={!canProceed}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white disabled:bg-zinc-300 disabled:text-zinc-500"
        >
          {bookingMode === "PACKAGE" ? "결제로 이동" : "안전 동의"}
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
