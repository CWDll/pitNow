"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { getGarageById } from "../../../_data/mock-garages";

const MIN_BLOCKS = 2; // 30분 * 2 = 1시간

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"] as const;

// 30분 경계값 (09:00 ~ 19:00)
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

// block index i는 [timeBoundaries[i], timeBoundaries[i+1])
const blockCount = timeBoundaries.length - 1;

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

function stripTime(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const TODAY_ON_LOAD = stripTime(new Date());

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return stripTime(next);
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

function boundaryIndex(time: string): number {
  return timeBoundaries.findIndex((value) => value === time);
}

function isReservedBlock(blockIdx: number, bay: number): boolean {
  const ranges = mockReservedRangesByBay[bay] ?? [];

  return ranges.some((range) => {
    const startIdx = boundaryIndex(range.start);
    const endIdx = boundaryIndex(range.end);

    if (startIdx < 0 || endIdx < 0) {
      return false;
    }

    return blockIdx >= startIdx && blockIdx < endIdx;
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

export default function PartnerSchedulePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const garage = useMemo(() => getGarageById(params.id), [params.id]);

  const [selectedDate, setSelectedDate] = useState<Date>(TODAY_ON_LOAD);
  const [selectedBay, setSelectedBay] = useState<number>(3);
  const [selectedStartIdx, setSelectedStartIdx] = useState<number | null>(null);
  const [selectedEndIdx, setSelectedEndIdx] = useState<number | null>(null);
  const [dragAnchorIdx, setDragAnchorIdx] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragMoved, setDragMoved] = useState<boolean>(false);
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState<boolean>(false);

  const workId = searchParams.get("workId") ?? "engine-oil";
  const carId = searchParams.get("carId") ?? "";
  const carLabel = searchParams.get("carLabel") ?? "현대 아반떼 CN7 (2022)";

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

  const weekDates = Array.from({ length: 7 }, (_, index) =>
    addDays(selectedDate, index - 3),
  );

  const hasSelection = selectedStartIdx !== null && selectedEndIdx !== null;
  const selectedBlocks = hasSelection ? selectedEndIdx - selectedStartIdx : 0;
  const startTime = hasSelection ? timeBoundaries[selectedStartIdx] : null;
  const endTime = hasSelection ? timeBoundaries[selectedEndIdx] : null;

  const halfHourPrice = Math.floor(garage.hourlyPrice / 2);
  const additionalBlocks = Math.max(0, selectedBlocks - MIN_BLOCKS);
  const totalPrice = garage.hourlyPrice + additionalBlocks * halfHourPrice;

  const meetsMinimum = selectedBlocks >= MIN_BLOCKS;
  const canProceed = hasSelection && meetsMinimum;

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
    setIsDragging(false);
    setDragAnchorIdx(null);

    if (!hasSelection) {
      return;
    }

    for (let i = selectedStartIdx; i < selectedEndIdx; i += 1) {
      if (isReservedBlock(i, nextBay)) {
        setSelectedStartIdx(null);
        setSelectedEndIdx(null);
        return;
      }
    }
  }

  function isRangeClear(
    startIdx: number,
    endExclusiveIdx: number,
    bay: number,
  ): boolean {
    for (let i = startIdx; i < endExclusiveIdx; i += 1) {
      if (isReservedBlock(i, bay)) {
        return false;
      }
    }

    return true;
  }

  function applySingleSelection(blockIdx: number) {
    setSelectedStartIdx(blockIdx);
    setSelectedEndIdx(blockIdx + 1);
  }

  function applyRangeFromStart(startIdx: number, targetIdx: number) {
    const endExclusive = targetIdx + 1;
    if (
      targetIdx >= startIdx &&
      isRangeClear(startIdx, endExclusive, selectedBay)
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

    if (blockIdx === selectedStartIdx) {
      setSelectedStartIdx(null);
      setSelectedEndIdx(null);
      return;
    }

    if (blockIdx >= selectedStartIdx) {
      applyRangeFromStart(selectedStartIdx, blockIdx);
      return;
    }

    applySingleSelection(blockIdx);
  }

  function handleBlockPointerDown(blockIdx: number) {
    if (isReservedBlock(blockIdx, selectedBay)) {
      return;
    }

    setIsDragging(true);
    setDragAnchorIdx(blockIdx);
    setDragMoved(false);
  }

  function handleBlockPointerEnter(blockIdx: number) {
    if (!isDragging || dragAnchorIdx === null) {
      return;
    }

    if (blockIdx < dragAnchorIdx) {
      applySingleSelection(dragAnchorIdx);
      return;
    }

    setDragMoved(true);
    applyRangeFromStart(dragAnchorIdx, blockIdx);
  }

  function stopDragging() {
    if (!isDragging) {
      return;
    }

    if (!dragMoved && dragAnchorIdx !== null) {
      handleBlockClick(dragAnchorIdx);
    }

    setIsDragging(false);
    setDragAnchorIdx(null);
    setDragMoved(false);
  }

  function goSafetyPage() {
    if (!canProceed || !startTime || !endTime) {
      return;
    }

    const selectedWeekdayLabel = weekdayLabels[selectedDate.getDay()];

    const query = new URLSearchParams({
      partnerId: garage!.id,
      garageName: garage!.name,
      workId,
      carId,
      carLabel,
      dateLabel: `${selectedDate.getMonth() + 1}/${selectedDate.getDate()}(${selectedWeekdayLabel}) ${startTime} - ${endTime}`,
      bayLabel: `${selectedBay}번 베이`,
      bayId: garage!.bayId,
      startTime: toIsoByDateAndTime(selectedDate, startTime),
      endTime: toIsoByDateAndTime(selectedDate, endTime),
      totalPrice: String(totalPrice),
    });

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
        <span className="text-sm text-zinc-500">베이마다 가능 시간이 다름</span>
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
              className={`rounded-xl px-2 py-3 text-lg font-medium ${
                active ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-800"
              }`}
            >
              {bayNumber}번
            </button>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl bg-zinc-100 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-zinc-900">시간 선택</h2>
          <span className="text-sm text-zinc-500">30분 단위</span>
        </div>

        <div
          className={`grid grid-cols-4 gap-2 ${isDragging ? "touch-none select-none" : ""}`}
          onPointerUp={stopDragging}
          onPointerLeave={stopDragging}
        >
          {Array.from({ length: blockCount }).map((_, idx) => {
            const reserved = isReservedBlock(idx, selectedBay);
            const selected =
              hasSelection && idx >= selectedStartIdx && idx < selectedEndIdx;
            const label = `${timeBoundaries[idx]}~${timeBoundaries[idx + 1]}`;

            return (
              <button
                key={`block-${idx}`}
                type="button"
                disabled={reserved}
                onPointerDown={() => handleBlockPointerDown(idx)}
                onPointerEnter={() => handleBlockPointerEnter(idx)}
                className={`rounded-xl px-2 py-3 text-xs font-medium ${
                  reserved
                    ? "bg-zinc-300 text-zinc-500"
                    : selected
                      ? "bg-amber-400 text-white"
                      : "bg-white text-zinc-700"
                }`}
                title={label}
              >
                {timeBoundaries[idx]}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
            선택
          </span>
          <span className="rounded-full bg-zinc-200 px-3 py-1 text-zinc-600">
            예약됨/미선택
          </span>
        </div>

        <p className="mt-3 text-sm text-zinc-600">
          예약시간: {startTime ?? "-"} ~ {endTime ?? "-"}
        </p>

        {!meetsMinimum && hasSelection ? (
          <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            최소 예약 시간은 1시간입니다 (연속 2칸 이상 선택).
          </p>
        ) : null}
      </div>

      <div className="mt-6 rounded-2xl bg-zinc-100 p-4">
        <h3 className="mb-3 text-2xl font-semibold text-zinc-900">요금 요약</h3>
        <div className="space-y-1 text-lg text-zinc-700">
          <div className="flex items-center justify-between">
            <span>기본 1시간</span>
            <span>{garage.hourlyPrice.toLocaleString("ko-KR")}원</span>
          </div>
          <div className="flex items-center justify-between">
            <span>추가 30분 단가</span>
            <span>{halfHourPrice.toLocaleString("ko-KR")}원</span>
          </div>
          <div className="flex items-center justify-between">
            <span>선택 시간</span>
            <span>{((selectedBlocks * 30) / 60).toFixed(1)}시간</span>
          </div>
          <div className="my-2 border-t border-zinc-300" />
          <div className="flex items-center justify-between text-2xl font-semibold text-zinc-900">
            <span>합계</span>
            <span className="text-blue-600">
              {totalPrice.toLocaleString("ko-KR")}원
            </span>
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm text-zinc-500">
        선택됨: {formatMonthLabel(selectedDate)} {selectedDate.getDate()}일 ·{" "}
        {startTime ?? "-"} ~ {endTime ?? "-"} · {selectedBay}번 베이 · {workId}
      </p>

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 bg-white px-4 pb-3 pt-2">
        <button
          type="button"
          onClick={goSafetyPage}
          disabled={!canProceed}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white disabled:bg-zinc-300 disabled:text-zinc-500"
        >
          안전 동의
        </button>
      </div>
    </section>
  );
}
