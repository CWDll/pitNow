"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Clock3,
  LoaderCircle,
  ShieldCheck,
  Warehouse,
} from "lucide-react";

import { selfMaintenanceTaskOptions } from "../../../_data/mock-garages";
import { hasSupabaseEnv, supabase } from "@/src/lib/supabase";
import { kstWallTimeToUtcIso } from "@/src/lib/timezone";

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"] as const;
const fallbackTimeBoundaries = [
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

const MIN_BLOCKS = 1;

interface BayRow {
  id: string;
  name: string;
}

interface ReservationRangeRow {
  bay_id: string;
  start_time: string;
  end_time?: string | null;
  blocked_until?: string | null;
}

interface AvailabilityBlockResponse {
  success?: boolean;
  blocks?: Array<{
    bayId: string | null;
    startsAt: string;
    endsAt: string;
  }>;
}

interface PartnerInfo {
  id: string;
  name: string;
  address: string;
  hours: string;
  phone: string;
  hourlyPrice: number;
  bayIds: string[];
  bayCount: number;
  activeBayCount: number;
}

interface PartnerResponse {
  success: boolean;
  partner?: PartnerInfo;
}

function stripTime(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return stripTime(next);
}

function toIsoByDateAndTime(date: Date, time: string): string {
  return kstWallTimeToUtcIso(date, time);
}

function parsePositiveNumber(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
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

function parseTimeToMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

function formatMinutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function buildTimeBoundaries(hours: string): string[] {
  const [openRaw, closeRaw] = hours.split(/\s*-\s*/);
  const openMinutes = openRaw ? parseTimeToMinutes(openRaw) : null;
  const closeMinutes = closeRaw ? parseTimeToMinutes(closeRaw) : null;

  if (
    openMinutes === null ||
    closeMinutes === null ||
    closeMinutes - openMinutes < 60
  ) {
    return [...fallbackTimeBoundaries];
  }

  const boundaries: string[] = [];

  for (
    let current = openMinutes;
    current <= closeMinutes + 60;
    current += 60
  ) {
    boundaries.push(formatMinutesToTime(current));
  }

  return boundaries.length >= 3 ? boundaries : [...fallbackTimeBoundaries];
}

function PartnerSchedulePageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [garage, setGarage] = useState<PartnerInfo | null>(null);

  const [selectedDate, setSelectedDate] = useState<Date>(stripTime(new Date()));
  const [selectedBay, setSelectedBay] = useState<number>(1);
  const [selectedStartIdx, setSelectedStartIdx] = useState<number | null>(null);
  const [selectedEndIdx, setSelectedEndIdx] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState<boolean>(false);
  const [carMasterVerifyRequested, setCarMasterVerifyRequested] =
    useState<boolean>(false);
  const [bayIds, setBayIds] = useState<string[]>([]);
  const [bayLabels, setBayLabels] = useState<string[]>([]);
  const [reservationRanges, setReservationRanges] = useState<
    Array<{ bayId: string; startMs: number; endMs: number }>
  >([]);
  const [availabilityBlockRanges, setAvailabilityBlockRanges] = useState<
    Array<{ bayId: string | null; startMs: number; endMs: number }>
  >([]);

  const bookingMode =
    searchParams.get("bookingMode") === "PACKAGE" ? "PACKAGE" : "SELF";
  const taskIds = searchParams.get("taskIds") ?? "";
  const taskLabels = searchParams.get("taskLabels") ?? "선택 작업 없음";
  const packageId = searchParams.get("packageId") ?? "";
  const packageTitle = searchParams.get("packageTitle") ?? "패키지";
  const packageMinutes = parsePositiveNumber(
    searchParams.get("packageMinutes"),
    60,
  );
  const packagePrice = parsePositiveNumber(searchParams.get("packagePrice"), 0);
  const carId = searchParams.get("carId") ?? "";
  const carLabel = searchParams.get("carLabel") ?? "현대 아반떼 CN7";

  useEffect(() => {
    let isCancelled = false;

    async function loadPartner() {
      try {
        const response = await fetch(`/api/partners/${params.id}`, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok || isCancelled) {
          return;
        }

        const payload = (await response.json()) as PartnerResponse;

        if (!payload.success || !payload.partner || isCancelled) {
          return;
        }

        setGarage(payload.partner);
      } catch (error) {
        console.error("SCHEDULE PARTNER LOAD ERROR:", error);
      }
    }

    void loadPartner();

    return () => {
      isCancelled = true;
    };
  }, [params.id]);

  const safeGarage = useMemo(() => garage, [garage]);
  const timeBoundaries = useMemo(
    () => buildTimeBoundaries(safeGarage?.hours ?? ""),
    [safeGarage?.hours],
  );
  const blockCount = Math.max(0, timeBoundaries.length - 2);
  const resolvedBayIds = useMemo(
    () => (bayIds.length > 0 ? bayIds : (safeGarage?.bayIds ?? [])),
    [bayIds, safeGarage?.bayIds],
  );
  const resolvedBayLabels = useMemo(
    () =>
      bayLabels.length > 0
        ? bayLabels
        : resolvedBayIds.map((_, index) => `${index + 1}번 베이`),
    [bayLabels, resolvedBayIds],
  );
  const selectedBayId =
    resolvedBayIds[selectedBay - 1] ?? resolvedBayIds[0] ?? null;
  const selectedBayLabel =
    resolvedBayLabels[selectedBay - 1] ?? resolvedBayLabels[0] ?? "베이";
  const todayMs = useMemo(() => stripTime(new Date(nowMs)).getTime(), [nowMs]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadBays() {
      if (!hasSupabaseEnv || !safeGarage?.id) {
        return;
      }

      const { data, error } = await supabase
        .from("bays")
        .select("id,name")
        .eq("partner_id", safeGarage.id)
        .eq("is_active", true)
        .order("name", { ascending: true })
        .returns<BayRow[]>();

      if (error || !data || data.length === 0 || isCancelled) {
        return;
      }

      setBayIds(data.map((row) => row.id));
      setBayLabels(data.map((row) => row.name));
      setSelectedBay((prev) => {
        const max = data.length;
        if (max < 1) {
          return 1;
        }
        return Math.min(Math.max(prev, 1), max);
      });
    }

    void loadBays();

    return () => {
      isCancelled = true;
    };
  }, [safeGarage?.id]);

  useEffect(() => {
    let isCancelled = false;

    async function loadRanges() {
      if (!hasSupabaseEnv || !safeGarage?.id) {
        return;
      }

      const dayStartIso = toIsoByDateAndTime(selectedDate, timeBoundaries[0]);
      const dayEndIso = toIsoByDateAndTime(
        selectedDate,
        timeBoundaries[timeBoundaries.length - 1],
      );

      const { data, error } = await supabase
        .from("reservations")
        .select("bay_id,start_time,end_time,blocked_until")
        .eq("partner_id", safeGarage.id)
        .in("status", ["CONFIRMED", "CHECKED_IN", "IN_USE"])
        .lt("start_time", dayEndIso)
        .gt("blocked_until", dayStartIso)
        .returns<ReservationRangeRow[]>();

      if (error || isCancelled) {
        return;
      }

      setReservationRanges(
        (data ?? []).map((row) => ({
          bayId: row.bay_id,
          startMs: new Date(row.start_time).getTime(),
          endMs: row.blocked_until
            ? new Date(row.blocked_until).getTime()
            : row.end_time
              ? new Date(row.end_time).getTime() + 60 * 60 * 1000
              : new Date(row.start_time).getTime(),
        })),
      );
    }

    void loadRanges();

    return () => {
      isCancelled = true;
    };
  }, [safeGarage?.id, selectedDate, timeBoundaries]);

  useEffect(() => {
    let isCancelled = false;

    async function loadAvailabilityBlocks() {
      if (!safeGarage?.id) {
        return;
      }

      const query = new URLSearchParams({
        endsAfter: toIsoByDateAndTime(selectedDate, timeBoundaries[0]),
        startsBefore: toIsoByDateAndTime(
          selectedDate,
          timeBoundaries[timeBoundaries.length - 1],
        ),
      });

      try {
        const response = await fetch(
          `/api/partners/${safeGarage.id}/availability-blocks?${query.toString()}`,
          {
            method: "GET",
            cache: "no-store",
          },
        );

        if (!response.ok || isCancelled) {
          setAvailabilityBlockRanges([]);
          return;
        }

        const payload = (await response.json()) as AvailabilityBlockResponse;
        const nextBlocks = Array.isArray(payload.blocks) ? payload.blocks : [];

        if (isCancelled) {
          return;
        }

        setAvailabilityBlockRanges(
          nextBlocks.map((block) => ({
            bayId: block.bayId,
            startMs: new Date(block.startsAt).getTime(),
            endMs: new Date(block.endsAt).getTime(),
          })),
        );
      } catch (error) {
        console.error("SCHEDULE AVAILABILITY BLOCK LOAD ERROR:", error);
        if (!isCancelled) {
          setAvailabilityBlockRanges([]);
        }
      }
    }

    void loadAvailabilityBlocks();

    return () => {
      isCancelled = true;
    };
  }, [safeGarage?.id, selectedDate, timeBoundaries]);

  function isReservedBlock(blockIdx: number, bayNumber: number): boolean {
    const bayId = resolvedBayIds[bayNumber - 1];

    if (!bayId) {
      return true;
    }

    const blockStartIso = toIsoByDateAndTime(
      selectedDate,
      timeBoundaries[blockIdx],
    );
    const blockEndIso = toIsoByDateAndTime(
      selectedDate,
      timeBoundaries[blockIdx + 1],
    );
    const blockStartMs = new Date(blockStartIso).getTime();
    const blockEndMs = new Date(blockEndIso).getTime();

    return reservationRanges.some(
      (range) =>
        range.bayId === bayId &&
        blockStartMs < range.endMs &&
        range.startMs < blockEndMs,
    );
  }

  function isAvailabilityBlockedRange(
    startIdx: number,
    endExclusiveIdx: number,
    bay: number,
  ): boolean {
    const bayId = resolvedBayIds[bay - 1];

    if (!bayId) {
      return true;
    }

    const rangeStartMs = new Date(
      toIsoByDateAndTime(selectedDate, timeBoundaries[startIdx]),
    ).getTime();
    const rangeEndMs = new Date(
      toIsoByDateAndTime(selectedDate, timeBoundaries[endExclusiveIdx]),
    ).getTime();

    return availabilityBlockRanges.some(
      (range) =>
        (range.bayId === null || range.bayId === bayId) &&
        rangeStartMs < range.endMs &&
        range.startMs < rangeEndMs,
    );
  }

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

  const totalPrice =
    bookingMode === "PACKAGE"
      ? packagePrice
      : selectedBlocks * (safeGarage?.hourlyPrice ?? 0);

  const packageDurationBlocks =
    bookingMode === "PACKAGE" ? Math.max(1, Math.ceil(packageMinutes / 60)) : 0;

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
  const selectedRangeSelectable =
    selectedStartIdx !== null &&
    selectedEndIdx !== null &&
    isRangeSelectable(selectedStartIdx, selectedEndIdx, selectedBay);
  const canProceed =
    resolvedBayIds.length > 0 &&
    (bookingMode === "PACKAGE"
      ? selectedRangeSelectable && selectedBlocks === packageDurationBlocks
      : selectedRangeSelectable && meetsMinimum);
  const hasValidHourlyPrice =
    bookingMode === "PACKAGE" ||
    Boolean(
      safeGarage &&
        Number.isFinite(safeGarage.hourlyPrice) &&
        safeGarage.hourlyPrice > 0,
    );

  function clearTimeSelection() {
    setSelectedStartIdx(null);
    setSelectedEndIdx(null);
  }

  function selectDate(nextDate: Date) {
    if (nextDate.getTime() < todayMs) {
      return;
    }

    setSelectedDate(nextDate);
    clearTimeSelection();
  }

  function handleWeekShift(daysToMove: number) {
    setSelectedDate((prev) => {
      const next = addDays(prev ?? stripTime(new Date()), daysToMove);
      return next.getTime() < todayMs ? stripTime(new Date(nowMs)) : next;
    });
    clearTimeSelection();
  }

  function handleMonthChange(monthValue: string) {
    const next = monthValueToDate(monthValue, selectedDate);
    if (!next) {
      return;
    }

    selectDate(next.getTime() < todayMs ? stripTime(new Date(nowMs)) : stripTime(next));
  }

  function handleBayChange(nextBay: number) {
    setSelectedBay(nextBay);

    if (!hasSelection) {
      return;
    }

    if (!isRangeSelectable(selectedStartIdx, selectedEndIdx, nextBay)) {
      clearTimeSelection();
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

    const startIso = toIsoByDateAndTime(selectedDate, timeBoundaries[startIdx]);
    const startMs = new Date(startIso).getTime();

    if (!Number.isFinite(startMs) || startMs <= nowMs) {
      return false;
    }

    if (isAvailabilityBlockedRange(startIdx, endExclusiveIdx, bay)) {
      return false;
    }

    const blockedUntilIdx = endExclusiveIdx + 1;
    if (blockedUntilIdx >= timeBoundaries.length) {
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
    const nextEndExclusiveIdx =
      bookingMode === "PACKAGE"
        ? blockIdx + packageDurationBlocks
        : blockIdx + 1;

    if (!isRangeSelectable(blockIdx, nextEndExclusiveIdx, selectedBay)) {
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
    if (
      !canProceed ||
      !hasValidHourlyPrice ||
      !startTime ||
      !endTime ||
      !blockedUntilTime
    ) {
      return;
    }

    const selectedWeekdayLabel = weekdayLabels[selectedDate.getDay()];
    const query = new URLSearchParams({
      bookingMode,
      partnerId: safeGarage?.id ?? "",
      garageName: safeGarage?.name ?? "",
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
      bayLabel: selectedBayLabel,
      bayId: selectedBayId,
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

  if (!safeGarage) {
    return (
      <section className="space-y-5 pt-7">
        <h1 className="text-2xl font-black text-slate-950">시간 / 베이 선택</h1>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-500 shadow-sm">
          <LoaderCircle className="size-5 animate-spin text-blue-600" />
          정비소 정보를 불러오는 중입니다.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5 pb-28 pt-5">
      <header className="flex items-center gap-3">
        <Link
          href={`/partner/${safeGarage.id}/work`}
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm"
          aria-label="뒤로가기"
          title="뒤로가기"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-slate-950">시간 / 베이 선택</h1>
          <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{safeGarage.name}</p>
        </div>
      </header>

      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className={`grid size-10 shrink-0 place-items-center rounded-xl text-white ${bookingMode === "PACKAGE" ? "bg-emerald-600" : "bg-blue-600"}`}>
          {bookingMode === "PACKAGE" ? <ShieldCheck className="size-5" /> : <Warehouse className="size-5" />}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-400">
            {bookingMode === "PACKAGE" ? "SHOP 패키지" : "SELF 시간제"}
          </p>
          <p className="mt-1 line-clamp-2 text-sm font-black leading-6 text-slate-900">
            {bookingMode === "PACKAGE" ? packageTitle : taskLabels}
          </p>
        </div>
      </div>

      <section aria-labelledby="date-title">
        <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          className="grid size-9 place-items-center rounded-xl border border-slate-200 bg-white text-lg font-bold text-slate-500"
          onClick={() => handleWeekShift(-7)}
        >
          ‹
        </button>
        <button
          type="button"
          id="date-title"
          className="flex items-center gap-2 text-lg font-black text-slate-950"
          onClick={() => setIsMonthPickerOpen((prev) => !prev)}
        >
          <CalendarDays className="size-4.5 text-blue-600" />
          {formatMonthLabel(selectedDate)}
        </button>
        <button
          type="button"
          className="grid size-9 place-items-center rounded-xl border border-slate-200 bg-white text-lg font-bold text-slate-500"
          onClick={() => handleWeekShift(7)}
        >
          ›
        </button>
        </div>

      {isMonthPickerOpen ? (
        <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <label className="mb-2 block text-xs font-bold text-slate-500">월 선택</label>
          <input
            type="month"
            value={formatMonthValue(selectedDate)}
            onChange={(event) => handleMonthChange(event.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-500"
          />
          <button
            type="button"
            onClick={() => setIsMonthPickerOpen(false)}
            className="mt-2 h-10 w-full rounded-xl bg-slate-100 text-sm font-bold text-slate-700"
          >
            닫기
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-7 gap-1.5">
        {weekDates.map((date) => {
          const active = date.getTime() === selectedDate.getTime();
          const disabled = date.getTime() < todayMs;
          return (
            <button
              key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
              type="button"
              disabled={disabled}
              onClick={() => selectDate(date)}
              className={`min-w-0 rounded-xl border px-1 py-2.5 text-center disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-100 disabled:text-slate-300 ${
                active && !disabled
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              <p className="text-[10px] font-bold">{weekdayLabels[date.getDay()]}</p>
              <p className="mt-1 text-base font-black">{date.getDate()}</p>
            </button>
          );
        })}
      </div>
      </section>

      <section aria-labelledby="bay-title">
        <div className="mb-3 flex items-end justify-between">
          <h2 id="bay-title" className="text-lg font-black text-slate-950">베이 선택</h2>
          <span className="text-xs font-bold text-slate-400">운영 베이 {resolvedBayIds.length}개</span>
        </div>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {resolvedBayIds.map((bayId, index) => {
          const bayNumber = index + 1;
          const active = bayNumber === selectedBay;
          const bayLabel = resolvedBayLabels[index] ?? `${bayNumber}번 베이`;

          return (
            <button
              key={bayId}
              type="button"
              onClick={() => handleBayChange(bayNumber)}
              className={`h-11 shrink-0 rounded-xl border px-4 text-sm font-black ${active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}
            >
              {bayLabel}
            </button>
          );
        })}
      </div>

      {resolvedBayIds.length === 0 ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          현재 예약 가능한 베이가 없습니다. 다른 정비소를 선택해 주세요.
        </p>
      ) : null}
      </section>

      <section aria-labelledby="time-title">
        <div className="mb-3 flex items-end justify-between">
          <h2 id="time-title" className="text-lg font-black text-slate-950">시간 선택</h2>
          <span className="text-xs font-bold text-slate-400">종료 후 1시간 버퍼</span>
        </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: blockCount }).map((_, idx) => {
            const selectable =
              bookingMode === "PACKAGE"
                ? isRangeSelectable(
                    idx,
                    idx + packageDurationBlocks,
                    selectedBay,
                  )
                : isRangeSelectable(idx, idx + 1, selectedBay);
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
                className={`h-10 rounded-lg border px-2 text-xs font-bold ${
                  !selectable
                    ? "border-slate-100 bg-slate-100 text-slate-300"
                    : selected
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                {timeBoundaries[idx]}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <Clock3 className="size-5 shrink-0 text-blue-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-900">작업 시간: {startTime ?? "-"} ~ {endTime ?? "-"}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">베이 확보: {startTime ?? "-"} ~ {blockedUntilTime ?? "-"}</p>
          </div>
        </div>

        {!meetsMinimum && hasSelection ? (
          <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            최소 예약 시간은 1시간입니다.
          </p>
        ) : null}
      </div>
      </section>

      <section aria-labelledby="price-title">
        <h2 id="price-title" className="mb-3 text-lg font-black text-slate-950">요금 요약</h2>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-2 text-sm font-semibold text-slate-600">
          <div className="flex items-center justify-between">
            <span>시간당 요금</span>
            <span>{safeGarage.hourlyPrice.toLocaleString("ko-KR")}원</span>
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
          <div className="my-3 border-t border-slate-200" />
          <div className="flex items-center justify-between text-base font-black text-slate-950">
            <span>합계</span>
            <span className="text-xl text-blue-600">
              {totalPriceWithVerify.toLocaleString("ko-KR")}원
            </span>
          </div>
        </div>
      </div>
      </section>

      {bookingMode === "SELF" ? (
        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-5 accent-blue-600"
            checked={carMasterVerifyRequested}
            onChange={() => setCarMasterVerifyRequested((prev) => !prev)}
          />
          <span>
            카 마스터 검수
            <br />
            <span className="text-xs font-semibold text-slate-500">
              기본 5,000원 + 선택 작업 검수 가산
            </span>
          </span>
        </label>
      ) : null}

      <div className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
        <button
          type="button"
          onClick={goNextPage}
          disabled={!canProceed || !hasValidHourlyPrice}
          className="flex h-12 w-full items-center justify-center gap-1 rounded-xl bg-blue-600 text-sm font-black text-white shadow-sm disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
        >
          {!hasValidHourlyPrice
            ? "매장 요금 정보가 필요합니다"
            : bookingMode === "PACKAGE"
              ? "결제로 이동"
              : "안전 동의"}
          {canProceed && hasValidHourlyPrice ? <ChevronRight className="size-4" /> : null}
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
