// NOTE:
// Server is source of truth.
// This is preview only.

import {
  MAX_OVERTIME_MINUTES,
  getBillableOvertimeMinutes,
  getVisibleOvertimeMs,
} from "@/src/lib/overtime-policy";

interface RemainingTimeResult {
  remainingMs: number;
  remainingMinutes: number;
  isOverdue: boolean;
}

interface OverduePreviewResult {
  overdueMinutes: number;
  previewFee: number;
  isCapped: boolean;
}

function parseIsoDate(iso: string): Date | null {
  const parsed = new Date(iso);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function calculateRemainingTime(endTime: string): RemainingTimeResult {
  return calculateRemainingTimeAt(endTime, Date.now());
}

export function calculateRemainingTimeAt(
  endTime: string,
  nowMs: number,
): RemainingTimeResult {
  const endDate = parseIsoDate(endTime);

  if (!endDate || !Number.isFinite(nowMs)) {
    return {
      remainingMs: 0,
      remainingMinutes: 0,
      isOverdue: false,
    };
  }

  const rawRemainingMs = endDate.getTime() - nowMs;
  const remainingMs =
    rawRemainingMs < 0
      ? -getVisibleOvertimeMs(Math.abs(rawRemainingMs))
      : rawRemainingMs;

  return {
    remainingMs,
    remainingMinutes: Math.ceil(Math.abs(remainingMs) / (1000 * 60)),
    isOverdue: rawRemainingMs < 0,
  };
}

export function calculateOverduePreview(
  endTime: string,
  totalPrice: number,
  startTime: string,
): OverduePreviewResult {
  return calculateOverduePreviewAt(endTime, totalPrice, startTime, Date.now());
}

export function calculateOverduePreviewAt(
  endTime: string,
  totalPrice: number,
  startTime: string,
  nowMs: number,
): OverduePreviewResult {
  const endDate = parseIsoDate(endTime);
  const startDate = parseIsoDate(startTime);

  if (
    !endDate ||
    !startDate ||
    !Number.isFinite(totalPrice) ||
    totalPrice < 0 ||
    !Number.isFinite(nowMs)
  ) {
    return {
      overdueMinutes: 0,
      previewFee: 0,
      isCapped: false,
    };
  }

  const durationMs = endDate.getTime() - startDate.getTime();

  if (durationMs <= 0) {
    return {
      overdueMinutes: 0,
      previewFee: 0,
      isCapped: false,
    };
  }

  const endMs = endDate.getTime();

  if (nowMs <= endMs) {
    return {
      overdueMinutes: 0,
      previewFee: 0,
      isCapped: false,
    };
  }

  const durationHours = durationMs / (1000 * 60 * 60);
  const hourlyPrice = totalPrice / durationHours;

  if (!Number.isFinite(hourlyPrice) || hourlyPrice < 0) {
    return {
      overdueMinutes: 0,
      previewFee: 0,
      isCapped: false,
    };
  }

  const rawDiffMs = nowMs - endMs;
  const diffMinutes = getBillableOvertimeMinutes(rawDiffMs);
  const blocks = Math.ceil(diffMinutes / 60);
  const previewFee = blocks * hourlyPrice;

  if (!Number.isFinite(previewFee) || previewFee < 0) {
    return {
      overdueMinutes: 0,
      previewFee: 0,
      isCapped: false,
    };
  }

  return {
    overdueMinutes: diffMinutes,
    previewFee: Number(previewFee.toFixed(2)),
    isCapped: rawDiffMs > MAX_OVERTIME_MINUTES * 60 * 1000,
  };
}

export function formatRemainingTime(ms: number): string {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
