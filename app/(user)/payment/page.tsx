"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import type {
  CreateReservationPayload,
  PaymentMethod,
  PreparePaymentPayload,
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

interface TossCheckoutPayload {
  type: "TOSS_PAYMENT_WINDOW";
  clientKey: string;
  customerKey: string;
  orderId: string;
  orderName: string;
  successUrl: string;
  failUrl: string;
}

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => {
      payment: (params: { customerKey: string }) => {
        requestPayment: (params: {
          method: "CARD";
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

function PaymentPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [method, setMethod] =
    useState<(typeof paymentMethods)[number]>("신용/체크카드");
  const [isPaying, setIsPaying] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const garageName = searchParams.get("garageName") ?? "강남 셀프정비소";
  const bookingMode =
    searchParams.get("bookingMode") === "PACKAGE" ? "PACKAGE" : "SELF";
  const reservationType =
    bookingMode === "PACKAGE" ? "SHOP_SERVICE" : "SELF_SERVICE";
  const partnerId = searchParams.get("partnerId") ?? "";
  const carId = searchParams.get("carId") ?? "";
  const carLabel = searchParams.get("carLabel") ?? "현대 아반떼 CN7 (2022)";
  const taskIds = (searchParams.get("taskIds") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const taskLabels = searchParams.get("taskLabels") ?? "선택 작업 없음";
  const packageId = searchParams.get("packageId") ?? "";
  const packageTitle = searchParams.get("packageTitle") ?? "패키지";
  const selectedTaskCount =
    searchParams.get("selectedTaskCount") ?? String(taskIds.length);
  const agreeOnlySelectedTasks =
    searchParams.get("agreeOnlySelectedTasks") === "true";
  const consentMethod =
    searchParams.get("consentMethod") === "SIGNATURE"
      ? "SIGNATURE"
      : "CHECKBOX";
  const signatureImageUrl = searchParams.get("signatureImageUrl") ?? "";
  const dateLabel = searchParams.get("dateLabel") ?? "2/28(금) 14:00 - 15:00";
  const bayLabel = searchParams.get("bayLabel") ?? "3번 베이";
  const bayId =
    searchParams.get("bayId") ?? "00000000-0000-0000-0000-000000000001";
  const startTime = searchParams.get("startTime") ?? "";
  const endTime = searchParams.get("endTime") ?? "";
  const blockedMinutes = Number(searchParams.get("blockedMinutes") ?? "60");
  const packageMinutes = Number(
    searchParams.get("packageMinutes") ?? String(blockedMinutes),
  );
  const totalPrice = Number(searchParams.get("totalPrice") ?? "15000");
  const helperVerifyRequested =
    searchParams.get("helperVerifyRequested") === "true";
  const helperVerifyFee = Number(searchParams.get("helperVerifyFee") ?? "0");

  const workTitle = useMemo(
    () => (bookingMode === "PACKAGE" ? packageTitle : taskLabels),
    [bookingMode, packageTitle, taskLabels],
  );

  async function handlePay() {
    setError("");

    if (!startTime || !endTime) {
      setError("시간 정보가 누락되어 결제를 진행할 수 없습니다.");
      return;
    }

    if (!carId) {
      setError("예약에 연결할 차량 정보가 없습니다. 내 차를 먼저 선택해 주세요.");
      return;
    }

    if (bookingMode === "SELF" && taskIds.length === 0) {
      setError("최소 1개 이상의 셀프 정비 작업을 선택해 주세요.");
      return;
    }

    if (bookingMode === "SELF" && !agreeOnlySelectedTasks) {
      setError("선택한 작업만 수행한다는 동의가 필요합니다.");
      return;
    }

    if (
      bookingMode === "SELF" &&
      consentMethod === "SIGNATURE" &&
      !signatureImageUrl
    ) {
      setError("서명 동의 정보가 누락되었습니다.");
      return;
    }

    setIsPaying(true);

    try {
      const hasSession = await requireClientSession();

      if (!hasSession) {
        return;
      }

      const reservation: CreateReservationPayload = {
        reservationType,
        bayId,
        vehicleId: carId,
        packageId: bookingMode === "PACKAGE" ? packageId : undefined,
        taskIds: bookingMode === "SELF" ? taskIds : undefined,
        agreeOnlySelectedTasks:
          bookingMode === "SELF" ? agreeOnlySelectedTasks : undefined,
        consentMethod: bookingMode === "SELF" ? consentMethod : undefined,
        signatureImageUrl:
          bookingMode === "SELF" && consentMethod === "SIGNATURE"
            ? signatureImageUrl
            : undefined,
        helperVerifyRequested:
          bookingMode === "SELF" ? helperVerifyRequested : false,
        startTime,
        endTime,
      };

      const prepareBody: PreparePaymentPayload = {
        method: paymentMethodMap[method],
        reservation,
      };

      const prepareResponse = await authFetch("/api/payments/prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(prepareBody),
      });

      const prepareData: unknown = await prepareResponse.json();

      if (!prepareResponse.ok) {
        setError(
          extractApiErrorMessage(
            prepareData,
            "결제 준비 중 오류가 발생했습니다.",
          ),
        );
        return;
      }

      const paymentId = parseStringField(prepareData, "paymentId");
      const providerOrderId = parseStringField(prepareData, "providerOrderId");
      const preparedAmount =
        parseNumberField(prepareData, "amount") ?? totalPrice;

      if (!paymentId || !providerOrderId) {
        setError("결제 준비 정보를 확인할 수 없습니다.");
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
            "테스트 결제가 완료되지 않았습니다. 노트북에서 카드/간편결제 앱 인증이 막히면 정상적으로 취소 처리됩니다.",
          );
        }
        return;
      }

      const confirmResponse = await authFetch("/api/payments/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentId,
          providerOrderId,
          amount: preparedAmount,
        }),
      });

      const confirmData: unknown = await confirmResponse.json();

      if (!confirmResponse.ok) {
        setError(
          extractApiErrorMessage(
            confirmData,
            "결제 승인 후 예약 확정에 실패했습니다.",
          ),
        );
        return;
      }

      const reservationId = parseStringField(confirmData, "reservationId");
      if (!reservationId) {
        setError("예약 ID를 확인할 수 없습니다.");
        return;
      }

      const reservationResult =
        confirmData && typeof confirmData === "object" && "reservation" in confirmData
          ? (confirmData as { reservation?: unknown }).reservation
          : null;
      const confirmedTotalPrice =
        parseNumberField(reservationResult, "totalPrice") ?? preparedAmount;

      const query = new URLSearchParams({
        reservationId,
        reservationType,
        bookingMode,
        partnerId,
        carId,
        carLabel,
        garageName,
        workTitle,
        taskIds: taskIds.join(","),
        taskLabels,
        selectedTaskCount,
        packageId,
        packageTitle,
        dateLabel,
        bayLabel,
        totalPrice: String(confirmedTotalPrice),
        startTime,
        endTime,
        blockedMinutes: String(blockedMinutes),
      });

      if (packageId) {
        query.set("packageId", packageId);
        query.set("packageMinutes", String(packageMinutes));
      }

      router.push(`/reservation-complete?${query.toString()}`);
    } catch {
      setError("결제 처리 중 오류가 발생했습니다.");
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
        <h1 className="text-3xl font-semibold text-zinc-900">결제</h1>
      </header>

      <div className="rounded-3xl bg-zinc-100 p-4">
        <h2 className="mb-3 text-xl font-semibold">주문 요약</h2>
        <div className="space-y-2 text-base text-zinc-700">
          <p className="flex justify-between">
            <span>작업</span>
            <span>{workTitle}</span>
          </p>
          {bookingMode === "SELF" ? (
            <p className="flex justify-between">
              <span>작업 개수</span>
              <span>{selectedTaskCount}개</span>
            </p>
          ) : null}
          {bookingMode === "SELF" ? (
            <p className="flex justify-between">
              <span>카 마스터 검수</span>
              <span>
                {Math.max(0, helperVerifyFee).toLocaleString("ko-KR")}원
              </span>
            </p>
          ) : null}
          <p className="flex justify-between">
            <span>지점</span>
            <span>{garageName}</span>
          </p>
          <p className="flex justify-between">
            <span>날짜/시간</span>
            <span>{dateLabel}</span>
          </p>
          <p className="flex justify-between">
            <span>베이</span>
            <span>{bayLabel}</span>
          </p>
          <p className="flex justify-between">
            <span>차량</span>
            <span>{carLabel}</span>
          </p>
        </div>
        <div className="my-3 border-t border-zinc-300" />
        <p className="flex justify-between text-2xl font-semibold">
          <span>결제 금액</span>
          <span className="text-blue-600">
            {totalPrice.toLocaleString("ko-KR")}원
          </span>
        </p>
      </div>

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
                className={`h-5 w-5 rounded-full border ${selected ? "border-blue-600 bg-blue-600" : "border-zinc-300"}`}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-700">
        <p className="font-semibold">취소/환불 규정</p>
        <ul className="mt-2 list-disc pl-5">
          <li>이용 24시간 전 전액 환불</li>
          <li>이용 2시간 전 50% 환불</li>
          <li>패키지 예약은 업장 정책에 따라 일정이 조정될 수 있습니다.</li>
        </ul>
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
          disabled={isPaying}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white disabled:bg-zinc-300 disabled:text-zinc-500"
        >
          {isPaying
            ? "결제 처리 중..."
            : `${totalPrice.toLocaleString("ko-KR")}원 결제하기`}
        </button>
      </div>
    </section>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<section className="pb-24" />}>
      <PaymentPageContent />
    </Suspense>
  );
}
