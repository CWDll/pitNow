export const reservationCancellationPolicy = [
  "체크인 전 예약 취소 시 결제 금액 전액 환불",
  "체크인 이후에는 앱에서 직접 취소 불가",
  "예약 종료까지 체크인하지 않으면 노쇼 처리되며 자동 환불되지 않음",
] as const;

export function calculateConfirmedReservationRefundAmount(
  amount: number | string,
): number {
  const parsed = typeof amount === "number" ? amount : Number(amount);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.round(parsed);
}
