"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import type {
  PaymentMethod,
  PrepareSettlementPaymentPayload,
} from "@/src/domain/types";
import { extractApiErrorMessage } from "@/src/lib/api-error";
import { authFetch } from "@/src/lib/auth-fetch";
import { requireClientSession } from "@/src/lib/client-auth";

const paymentMethods = [
  "신용/체크카드",
  "카카오페이",
  "네이버페이",
  "토스페이",
] as const;

const paymentMethodMap: Record<
  (typeof paymentMethods)[number],
  PaymentMethod
> = {
  "신용/체크카드": "CARD",
  "카카오페이": "KAKAO_PAY",
  "네이버페이": "NAVER_PAY",
  "토스페이": "TOSS_PAY",
};

const tossEasyPayMap: Partial<Record<PaymentMethod, string>> = {
  KAKAO_PAY: "KAKAOPAY",
  NAVER_PAY: "NAVERPAY",
  TOSS_PAY: "TOSSPAY",
};

interface TossCheckoutPayload {
  type: "TOSS_PAYMENT_WINDOW";
  clientKey: string;
  customerKey: string;
  orderId: string;
  orderName: string;
  successUrl: string;
  failUrl: string;
}

interface ReservationDetail {
  garageName: string;
  workTitle: string;
  taskLabels: string;
  carLabel: string;
  dateLabel: string;
}

interface ReservationDetailResponse {
  success?: boolean;
  reservation?: ReservationDetail;
}

interface CheckoutDetail {
  basePrice: number;
  extraFee: number;
  helperVerifyFee: number;
  totalSettlement: number;
  paidReservationAmount?: number;
  settlementAmountDue?: number;
  settlementPaymentStatus?: string | null;
}

interface CheckoutDetailResponse {
  success?: boolean;
  checkout?: CheckoutDetail;
}

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => {
      payment: (params: { customerKey: string }) => {
        requestPayment: (params: {
          method: "CARD";
          card?: {
            flowMode: "DIRECT";
            easyPay: string;
          };
          amount: {
            value: number;
            currency: "KRW";
          };
          orderId: string;
          orderName: string;
          successUrl: string;
          failUrl: string;
          windowTarget?: "self" | "iframe";
        }) => Promise<void>;
      };
    };
  }
}

function getTossPaymentRequestOptions(selectedMethod: PaymentMethod) {
  const easyPay = tossEasyPayMap[selectedMethod];

  return easyPay
    ? {
        card: {
          flowMode: "DIRECT" as const,
          easyPay,
        },
      }
    : {};
}

function parseStringField(payload: unknown, fieldName: string): string | null {
  if (!payload || typeof payload !== "object" || !(fieldName in payload)) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[fieldName];

  return typeof value === "string" ? value : null;
}

function parseNumberField(payload: unknown, fieldName: string): number | null {
  if (!payload || typeof payload !== "object" || !(fieldName in payload)) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[fieldName];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseTossCheckoutPayload(payload: unknown): TossCheckoutPayload | null {
  if (!payload || typeof payload !== "object" || !("checkout" in payload)) {
    return null;
  }

  const checkout = (payload as { checkout?: unknown }).checkout;

  if (!checkout || typeof checkout !== "object") {
    return null;
  }

  const fields = checkout as Record<string, unknown>;

  if (fields.type !== "TOSS_PAYMENT_WINDOW") {
    return null;
  }

  const clientKey = fields.clientKey;
  const customerKey = fields.customerKey;
  const orderId = fields.orderId;
  const orderName = fields.orderName;
  const successUrl = fields.successUrl;
  const failUrl = fields.failUrl;

  if (
    typeof clientKey !== "string" ||
    typeof customerKey !== "string" ||
    typeof orderId !== "string" ||
    typeof orderName !== "string" ||
    typeof successUrl !== "string" ||
    typeof failUrl !== "string"
  ) {
    return null;
  }

  return {
    type: "TOSS_PAYMENT_WINDOW",
    clientKey,
    customerKey,
    orderId,
    orderName,
    successUrl,
    failUrl,
  };
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return "Toss 결제창에서 결제가 완료되지 않았습니다.";
}

async function loadTossPaymentsSdk(): Promise<void> {
  if (window.TossPayments) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://js.tosspayments.com/v2/standard"]',
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://js.tosspayments.com/v2/standard";
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(), { once: true });
    document.head.appendChild(script);
  });
}

function SettlementPaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reservationId = searchParams.get("reservationId") ?? "";

  const [method, setMethod] =
    useState<(typeof paymentMethods)[number]>("신용/체크카드");
  const [reservation, setReservation] = useState<ReservationDetail | null>(
    null,
  );
  const [checkout, setCheckout] = useState<CheckoutDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState("");

  const paidReservationAmount = checkout?.paidReservationAmount ?? 0;
  const totalSettlement = checkout?.totalSettlement ?? 0;
  const amountDue =
    checkout?.settlementAmountDue ?? Math.max(0, totalSettlement - paidReservationAmount);
  const isAlreadyPaid =
    checkout?.settlementPaymentStatus === "SETTLEMENT_CONFIRMED";

  useEffect(() => {
    let isCancelled = false;

    async function loadSettlementDetail() {
      if (!reservationId) {
        setError("예약 정보가 없습니다.");
        setIsLoading(false);
        return;
      }

      try {
        const hasSession = await requireClientSession();

        if (!hasSession || isCancelled) {
          return;
        }

        const [reservationResponse, checkoutResponse] = await Promise.all([
          authFetch(`/api/reservations/${reservationId}`, {
            method: "GET",
            cache: "no-store",
          }),
          authFetch(
            `/api/checkouts?reservationId=${encodeURIComponent(reservationId)}`,
            {
              method: "GET",
              cache: "no-store",
            },
          ),
        ]);

        const reservationPayload =
          (await reservationResponse.json()) as ReservationDetailResponse;
        const checkoutPayload =
          (await checkoutResponse.json()) as CheckoutDetailResponse;

        if (isCancelled) {
          return;
        }

        if (
          reservationResponse.ok &&
          reservationPayload.success &&
          reservationPayload.reservation
        ) {
          setReservation(reservationPayload.reservation);
        } else {
          setError(
            extractApiErrorMessage(
              reservationPayload,
              "예약 정보를 불러오지 못했습니다.",
            ),
          );
        }

        if (
          checkoutResponse.ok &&
          checkoutPayload.success &&
          checkoutPayload.checkout
        ) {
          setCheckout(checkoutPayload.checkout);
        } else {
          setError(
            extractApiErrorMessage(
              checkoutPayload,
              "체크아웃 정산 정보를 불러오지 못했습니다.",
            ),
          );
        }
      } catch {
        if (!isCancelled) {
          setError("사후정산 정보를 불러오지 못했습니다.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSettlementDetail();

    return () => {
      isCancelled = true;
    };
  }, [reservationId]);

  async function handlePay() {
    setError("");

    if (!reservationId) {
      setError("예약 정보가 없습니다.");
      return;
    }

    if (amountDue <= 0) {
      setError("추가로 결제할 금액이 없습니다.");
      return;
    }

    if (isAlreadyPaid) {
      setError("이미 추가 정산 결제가 완료되었습니다.");
      return;
    }

    setIsPaying(true);

    try {
      const hasSession = await requireClientSession();

      if (!hasSession) {
        return;
      }

      const selectedPaymentMethod = paymentMethodMap[method];
      const prepareBody: PrepareSettlementPaymentPayload = {
        reservationId,
        method: selectedPaymentMethod,
      };
      const prepareResponse = await authFetch(
        "/api/payments/settlement/prepare",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(prepareBody),
        },
      );
      const prepareData: unknown = await prepareResponse.json();

      if (!prepareResponse.ok) {
        setError(
          extractApiErrorMessage(
            prepareData,
            "사후정산 결제 준비 중 오류가 발생했습니다.",
          ),
        );
        return;
      }

      const paymentId = parseStringField(prepareData, "paymentId");
      const providerOrderId = parseStringField(prepareData, "providerOrderId");
      const preparedAmount = parseNumberField(prepareData, "amount") ?? amountDue;

      if (!paymentId || !providerOrderId) {
        setError("정산 결제 준비 정보를 확인할 수 없습니다.");
        return;
      }

      const tossCheckout = parseTossCheckoutPayload(prepareData);

      if (tossCheckout) {
        await loadTossPaymentsSdk();

        if (!window.TossPayments) {
          setError("Toss 결제창을 초기화하지 못했습니다.");
          return;
        }

        const tossPayments = window.TossPayments(tossCheckout.clientKey);
        const payment = tossPayments.payment({
          customerKey: tossCheckout.customerKey,
        });

        try {
          await payment.requestPayment({
            method: "CARD",
            ...getTossPaymentRequestOptions(selectedPaymentMethod),
            amount: {
              value: preparedAmount,
              currency: "KRW",
            },
            orderId: tossCheckout.orderId,
            orderName: tossCheckout.orderName,
            successUrl: tossCheckout.successUrl,
            failUrl: tossCheckout.failUrl,
            windowTarget: "self",
          });
        } catch (requestPaymentError) {
          const message = getErrorMessage(requestPaymentError);

          await authFetch("/api/payments/fail", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              paymentId,
              code: "TOSS_PAYMENT_WINDOW_CLOSED",
              message,
              cancelled: true,
            }),
          }).catch(() => null);
          setError(
            "테스트 추가정산 결제가 완료되지 않았습니다. 결제창을 닫으면 취소 처리됩니다.",
          );
        }
        return;
      }

      const confirmResponse = await authFetch(
        "/api/payments/settlement/confirm",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            paymentId,
            providerOrderId,
            amount: preparedAmount,
          }),
        },
      );
      const confirmData: unknown = await confirmResponse.json();

      if (!confirmResponse.ok) {
        setError(
          extractApiErrorMessage(
            confirmData,
            "추가 정산 결제 승인에 실패했습니다.",
          ),
        );
        return;
      }

      router.replace(`/complete?reservationId=${encodeURIComponent(reservationId)}`);
    } catch {
      setError("추가 정산 결제 처리 중 오류가 발생했습니다.");
    } finally {
      setIsPaying(false);
    }
  }

  return (
    <section className="pb-24">
      <header className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-2xl text-zinc-700"
          aria-label="뒤로가기"
        >
          ←
        </button>
        <h1 className="text-3xl font-semibold text-zinc-900">추가 정산</h1>
      </header>

      <div className="rounded-3xl bg-zinc-100 p-4">
        <h2 className="mb-3 text-xl font-semibold">정산 요약</h2>
        <div className="space-y-2 text-base text-zinc-700">
          <p className="flex justify-between">
            <span>작업</span>
            <span>{reservation?.taskLabels || reservation?.workTitle || "-"}</span>
          </p>
          <p className="flex justify-between">
            <span>지점</span>
            <span>{reservation?.garageName ?? "-"}</span>
          </p>
          <p className="flex justify-between">
            <span>날짜/시간</span>
            <span>{reservation?.dateLabel ?? "-"}</span>
          </p>
          <p className="flex justify-between">
            <span>차량</span>
            <span>{reservation?.carLabel ?? "-"}</span>
          </p>
        </div>
        <div className="my-3 border-t border-zinc-300" />
        <p className="flex justify-between text-base text-zinc-700">
          <span>예약 시 결제</span>
          <span>{paidReservationAmount.toLocaleString("ko-KR")}원</span>
        </p>
        <p className="mt-2 flex justify-between text-base text-zinc-700">
          <span>총 정산</span>
          <span>{totalSettlement.toLocaleString("ko-KR")}원</span>
        </p>
        <p className="mt-3 flex justify-between text-2xl font-semibold">
          <span>추가 결제</span>
          <span className={isAlreadyPaid ? "text-emerald-600" : "text-red-500"}>
            {amountDue.toLocaleString("ko-KR")}원
          </span>
        </p>
      </div>

      {isAlreadyPaid ? (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          추가 정산 결제가 이미 완료되었습니다.
        </p>
      ) : null}

      <div className="mt-5 space-y-2">
        <h2 className="text-xl font-semibold text-zinc-900">결제 수단</h2>
        {paymentMethods.map((item) => {
          const selected = method === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => setMethod(item)}
              className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-lg ${
                selected
                  ? "border-blue-600 bg-blue-50"
                  : "border-zinc-300 bg-white"
              }`}
            >
              <span>{item}</span>
              <span
                className={`h-5 w-5 rounded-full border ${
                  selected ? "border-blue-600 bg-blue-600" : "border-zinc-300"
                }`}
              />
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-107.5 -translate-x-1/2 bg-white px-4 pb-3 pt-2">
        <button
          type="button"
          onClick={handlePay}
          disabled={isLoading || isPaying || isAlreadyPaid || amountDue <= 0}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-red-500 text-lg font-semibold text-white disabled:bg-zinc-300 disabled:text-zinc-500"
        >
          {isPaying
            ? "결제 처리 중..."
            : `${amountDue.toLocaleString("ko-KR")}원 추가 결제하기`}
        </button>
      </div>
    </section>
  );
}

export default function SettlementPaymentPage() {
  return (
    <Suspense fallback={<section className="pb-24" />}>
      <SettlementPaymentContent />
    </Suspense>
  );
}
