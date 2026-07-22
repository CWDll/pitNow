const MINUTE_MS = 60 * 1000;

export const MAX_OVERTIME_MINUTES = 60;
export const MAX_OVERTIME_MS = MAX_OVERTIME_MINUTES * MINUTE_MS;

export function getBillableOvertimeMinutes(diffMs: number): number {
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return 0;
  }

  return Math.min(MAX_OVERTIME_MINUTES, Math.ceil(diffMs / MINUTE_MS));
}

export function getVisibleOvertimeMs(diffMs: number): number {
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return 0;
  }

  return Math.min(MAX_OVERTIME_MS, diffMs);
}
