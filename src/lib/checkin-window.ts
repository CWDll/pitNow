export const CHECKIN_EARLY_MINUTES = 15;

export type CheckinWindowState = "NOT_OPEN" | "OPEN" | "CLOSED" | "INVALID";

export function getCheckinWindowState(params: {
  startTime: string;
  endTime: string;
  nowMs?: number;
}): CheckinWindowState {
  const startMs = new Date(params.startTime).getTime();
  const endMs = new Date(params.endTime).getTime();
  const nowMs = params.nowMs ?? Date.now();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    return "INVALID";
  }

  const opensAtMs = startMs - CHECKIN_EARLY_MINUTES * 60 * 1000;

  if (nowMs < opensAtMs) {
    return "NOT_OPEN";
  }

  if (nowMs >= endMs) {
    return "CLOSED";
  }

  return "OPEN";
}

export function getCheckinOpensAt(startTime: string): string | null {
  const startMs = new Date(startTime).getTime();

  if (!Number.isFinite(startMs)) {
    return null;
  }

  return new Date(startMs - CHECKIN_EARLY_MINUTES * 60 * 1000).toISOString();
}
