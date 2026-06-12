import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  PaymentMethod,
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

