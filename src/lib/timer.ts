// NOTE:
// Server is source of truth.
// This is preview only.

interface RemainingTimeResult {
  remainingMs: number;
  remainingMinutes: number;
  isOverdue: boolean;
}

interface OverduePreviewResult {
  overdueMinutes: number;
  previewFee: number;
}

function parseIsoDate(iso: string): Date | null {
  const parsed = new Date(iso);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function calculateRemainingTime(endTime: string): RemainingTimeResult {
  const endDate = parseIsoDate(endTime);

  if (!endDate) {
    return {
      remainingMs: 0,
      remainingMinutes: 0,
      isOverdue: false,
    };
  }

  const nowMs = Date.now();
  const remainingMs = endDate.getTime() - nowMs;

  return {
    remainingMs,
    remainingMinutes: Math.ceil(Math.abs(remainingMs) / (1000 * 60)),
    isOverdue: remainingMs < 0,
  };
}

export function calculateOverduePreview(
  endTime: string,
  totalPrice: number,
  startTime: string,
): OverduePreviewResult {
  const endDate = parseIsoDate(endTime);
  const startDate = parseIsoDate(startTime);

  if (
    !endDate ||
    !startDate ||
    !Number.isFinite(totalPrice) ||
    totalPrice < 0
  ) {
    return {
      overdueMinutes: 0,
      previewFee: 0,
    };
  }

  const durationMs = endDate.getTime() - startDate.getTime();

  if (durationMs <= 0) {
    return {
      overdueMinutes: 0,
      previewFee: 0,
    };
  }

  const nowMs = Date.now();
  const endMs = endDate.getTime();

  if (nowMs <= endMs) {
    return {
      overdueMinutes: 0,
      previewFee: 0,
    };
  }

  const durationHours = durationMs / (1000 * 60 * 60);
  const hourlyPrice = totalPrice / durationHours;

  if (!Number.isFinite(hourlyPrice) || hourlyPrice < 0) {
    return {
      overdueMinutes: 0,
      previewFee: 0,
    };
  }

  const diffMinutes = Math.ceil((nowMs - endMs) / (1000 * 60));
  const blocks = Math.ceil(diffMinutes / 60);
  const previewFee = blocks * hourlyPrice;

  if (!Number.isFinite(previewFee) || previewFee < 0) {
    return {
      overdueMinutes: 0,
      previewFee: 0,
    };
  }

  return {
    overdueMinutes: diffMinutes,
    previewFee: Number(previewFee.toFixed(2)),
  };
}

export function formatRemainingTime(ms: number): string {
  const isOverdue = ms < 0;
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const formatted = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return isOverdue ? `-${formatted}` : formatted;
}
