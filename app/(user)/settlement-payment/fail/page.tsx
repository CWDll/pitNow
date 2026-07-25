"use client";

import Link from "next/link";
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { authFetch } from "@/src/lib/auth-fetch";

function SettlementPaymentFailContent() {
  const searchParams = useSearchParams();

  const paymentId = searchParams.get("paymentId") ?? "";
  const reservationId = searchParams.get("reservationId") ?? "";
  const code = searchParams.get("code") ?? "PAYMENT_FAILED";
  const message =
    searchParams.get("message") ?? "추가 정산 결제가 완료되지 않았습니다.";
  const retryHref = reservationId
    ? `/settlement-payment?reservationId=${encodeURIComponent(reservationId)}`
    : "/reservation";

  useEffect(() => {
    if (!paymentId) {
      return;
    }

    async function recordFailure() {
      await authFetch("/api/payments/fail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentId,
          code,
          message,
          cancelled: code === "PAY_PROCESS_CANCELED",
        }),
      }).catch(() => null);
    }

    void recordFailure();
  }, [code, message, paymentId]);

  return (
    <section className="flex min-h-[70dvh] items-center justify-center">
      <div className="w-full rounded-3xl bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold tracking-[0.28em] text-red-500">
          PITNOW SETTLEMENT
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-zinc-950">
          추가 정산 결제가 완료되지 않았습니다
        </h1>
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {message}
        </p>
        <div className="mt-6 grid gap-2">
          <Link
            href={retryHref}
            className="flex h-12 items-center justify-center rounded-2xl bg-zinc-950 text-base font-semibold text-white"
          >
            {reservationId ? "추가 정산 다시 시도" : "예약 내역으로 이동"}
          </Link>
          {reservationId ? (
            <Link
              href="/reservation"
              className="flex h-12 items-center justify-center rounded-2xl bg-zinc-100 text-base font-semibold text-zinc-700"
            >
              예약 내역으로 이동
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default function SettlementPaymentFailPage() {
  return (
    <Suspense fallback={<section className="min-h-[70dvh]" />}>
      <SettlementPaymentFailContent />
    </Suspense>
  );
}
