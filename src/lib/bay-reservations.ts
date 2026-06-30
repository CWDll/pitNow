export const BAY_BLOCKING_RESERVATION_STATUSES = [
  "CONFIRMED",
  "CHECKED_IN",
  "IN_USE",
] as const;

type BayBlockingReservationStatus =
  (typeof BAY_BLOCKING_RESERVATION_STATUSES)[number];

export function isBayBlockingReservation(params: {
  blockedUntil: string | null;
  now?: Date;
  status: string;
}) {
  if (params.status === "CHECKED_IN" || params.status === "IN_USE") {
    return true;
  }

  if (params.status !== "CONFIRMED") {
    return false;
  }

  if (!params.blockedUntil) {
    return false;
  }

  const blockedUntilMs = new Date(params.blockedUntil).getTime();

  return Number.isFinite(blockedUntilMs)
    ? blockedUntilMs > (params.now ?? new Date()).getTime()
    : false;
}

export function isBayBlockingReservationStatus(
  status: string,
): status is BayBlockingReservationStatus {
  return BAY_BLOCKING_RESERVATION_STATUSES.includes(
    status as BayBlockingReservationStatus,
  );
}
