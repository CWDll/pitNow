"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { extractApiErrorMessage } from "@/src/lib/api-error";
import { authFetch } from "@/src/lib/auth-fetch";
import { requireClientSession } from "@/src/lib/client-auth";

function SettlementPaymentSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("추가 정산 결제를 확인하는 중입니다.");
  const [error, setError] = useState("");

  useEffect(() => {
    let isCancelled = false;

    async function confirmPayment() {
      const hasSession = await requireClientSession();

      if (!hasSession || isCancelled) {
        return;
      }

      const paymentId = searchParams.get("paymentId") ?? "";
      const paymentKey = searchParams.get("paymentKey") ?? "";
      const orderId = searchParams.get("orderId") ?? "";
      const amount = Number(searchParams.get("amount") ?? "");

      if (!paymentId || !paymentKey || !orderId || !Number.isFinite(amount)) {
        setError("Toss 추가 정산 승인 정보가 올바르지 않습니다.");
        setMessage("");
        return;
      }

      const response = await authFetch("/api/payments/settlement/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentId,
          providerPaymentKey: paymentKey,
          providerOrderId: orderId,
          amount,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (isCancelled) {
        return;
      }

      if (!response.ok) {
        setError(
          extractApiErrorMessage(
            payload,
            "추가 정산 결제는 완료되었지만 확인 저장에 실패했습니다.",
          ),
        );
        setMessage("");
        return;
      }

      const reservationId =
        payload && typeof payload === "object" && "reservationId" in payload
          ? (payload as { reservationId?: unknown }).reservationId
          : null;

      if (typeof reservationId !== "string") {
        setError("예약 ID를 확인할 수 없습니다.");
        setMessage("");
        return;
      }

      setMessage("추가 정산 결제가 완료되었습니다.");
      router.replace(`/complete?reservationId=${reservationId}`);
    }

    void confirmPayment();

    return () => {
      isCancelled = true;
    };
  }, [router, searchParams]);

  return (
    <section className="flex min-h-[70dvh] items-center justify-center">
      <div className="w-full rounded-3xl bg-white p-6 text-center shadow-sm">
        <p className="text-xs font-semibold tracking-[0.28em] text-blue-600">
          PITNOW SETTLEMENT
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-zinc-950">
          추가 정산 확인
        </h1>
        {message ? <p className="mt-4 text-zinc-600">{message}</p> : null}
        {error ? (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default function SettlementPaymentSuccessPage() {
  return (
    <Suspense fallback={<section className="min-h-[70dvh]" />}>
      <SettlementPaymentSuccessContent />
    </Suspense>
  );
}
