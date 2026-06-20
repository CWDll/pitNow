import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  PaymentMethod,
  PaymentPurpose,
  PaymentProvider,
  PaymentProviderMode,
  PaymentStatus,
} from "@/src/domain/types";

export const paymentMethods: PaymentMethod[] = [
  "CARD",
  "KAKAO_PAY",
  "NAVER_PAY",
  "TOSS_PAY",
];

export interface PaymentRow {
  id: string;
  user_id: string;
  reservation_id: string | null;
  checkout_id?: string | null;
  payment_purpose?: PaymentPurpose;
  provider: PaymentProvider;
  provider_payment_key: string | null;
  provider_order_id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number | string;
  currency: string;
  reservation_snapshot: unknown;
  metadata: Record<string, unknown>;
}

export function getPaymentProviderMode(): PaymentProviderMode {
  const raw = process.env.PITNOW_PAYMENT_PROVIDER;

  if (raw === "TOSS_TEST" || raw === "TOSS_LIVE" || raw === "FAKE") {
    return raw;
  }

  return process.env.NODE_ENV === "production" ? "TOSS_TEST" : "FAKE";
}

export function providerFromMode(mode: PaymentProviderMode): PaymentProvider {
  return mode === "FAKE" ? "FAKE" : "TOSS";
}

export function createProviderOrderId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;

  return `pitnow_${random}`;
}

export function toPaymentAmount(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function getTossClientKey(): string | null {
  const key = process.env.NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY;

  return key?.trim() ? key.trim() : null;
}

export function getTossSecretKey(): string | null {
  const key = process.env.TOSS_PAYMENTS_SECRET_KEY;

  return key?.trim() ? key.trim() : null;
}

export function getTossApiBaseUrl(): string {
  return process.env.TOSS_PAYMENTS_API_BASE_URL?.trim() ||
    "https://api.tosspayments.com";
}

export function getTossBasicAuthorization(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

export async function confirmTossPayment(params: {
  paymentKey: string;
  orderId: string;
  amount: number;
}) {
  const secretKey = getTossSecretKey();

  if (!secretKey) {
    return {
      ok: false as const,
      status: 503,
      code: "TOSS_SECRET_KEY_REQUIRED",
      message: "Toss 결제 승인을 위해 TOSS_PAYMENTS_SECRET_KEY가 필요합니다.",
      providerPayload: null,
    };
  }

  const response = await fetch(`${getTossApiBaseUrl()}/v1/payments/confirm`, {
    method: "POST",
    headers: {
      Authorization: getTossBasicAuthorization(secretKey),
      "Content-Type": "application/json",
      "Idempotency-Key": `pitnow-confirm-${params.orderId}`,
    },
    body: JSON.stringify({
      paymentKey: params.paymentKey,
      orderId: params.orderId,
      amount: params.amount,
    }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const providerError = payload as
      | { code?: unknown; message?: unknown }
      | null;

    return {
      ok: false as const,
      status: response.status,
      code:
        typeof providerError?.code === "string"
          ? providerError.code
          : "TOSS_CONFIRM_FAILED",
      message:
        typeof providerError?.message === "string"
          ? providerError.message
          : "Toss 결제 승인에 실패했습니다.",
      providerPayload: payload,
    };
  }

  return {
    ok: true as const,
    providerPayload: payload,
  };
}

export function assertPaymentMethod(value: unknown): PaymentMethod | null {
  return typeof value === "string" &&
    paymentMethods.includes(value as PaymentMethod)
    ? (value as PaymentMethod)
    : null;
}

export async function markPaymentFailed(params: {
  db: SupabaseClient;
  paymentId: string;
  userId: string;
  status: Extract<PaymentStatus, "FAILED" | "CANCELLED">;
  code: string | null;
  message: string | null;
}) {
  const { db, paymentId, userId, status, code, message } = params;

  return db
    .from("payments")
    .update({
      status,
      failure_code: code,
      failure_message: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentId)
    .eq("user_id", userId)
    .eq("status", "READY")
    .select("id, status")
    .maybeSingle<{ id: string; status: PaymentStatus }>();
}
