import type { SupabaseClient } from "@supabase/supabase-js";

import { cancelTossPayment, toPaymentAmount } from "@/src/lib/payments";

interface ReservationPaymentForRefund {
  id: string;
  provider: "FAKE" | "TOSS";
  provider_payment_key: string | null;
  status: string;
  amount: number | string;
}

export interface ReservationRefundResult {
  paymentId: string | null;
  paymentStatus: "REFUNDED" | "REFUND_PENDING" | "NO_PAYMENT";
  provider: "FAKE" | "TOSS" | null;
  message: string;
}

function normalizeCancelReason(reason: string, fallback: string): string {
  const normalized = reason.trim();

  return normalized ? normalized.slice(0, 200) : fallback;
}

async function markPaymentRefunded(params: {
  db: SupabaseClient;
  payment: ReservationPaymentForRefund;
  metadata: Record<string, unknown>;
}) {
  const refundedAt = new Date().toISOString();

  await params.db
    .from("payments")
    .update({
      status: "REFUNDED",
      refunded_at: refundedAt,
      failure_code: null,
      failure_message: null,
      metadata: params.metadata,
      updated_at: refundedAt,
    })
    .eq("id", params.payment.id)
    .eq("status", params.payment.status);
}

async function markPaymentRefundPending(params: {
  db: SupabaseClient;
  payment: ReservationPaymentForRefund;
  code: string;
  message: string;
  metadata: Record<string, unknown>;
}) {
  await params.db
    .from("payments")
    .update({
      status: "REFUND_PENDING",
      failure_code: params.code,
      failure_message: params.message,
      metadata: params.metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.payment.id)
    .eq("status", params.payment.status);
}

export async function refundReservationPayment(params: {
  db: SupabaseClient;
  reservationId: string;
  reason: string;
  actorType: "USER" | "ADMIN" | "SYSTEM";
}): Promise<ReservationRefundResult> {
  const { data: payment, error } = await params.db
    .from("payments")
    .select("id, provider, provider_payment_key, status, amount")
    .eq("reservation_id", params.reservationId)
    .eq("payment_purpose", "RESERVATION")
    .eq("status", "RESERVATION_CONFIRMED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ReservationPaymentForRefund>();

  if (error) {
    console.error("RESERVATION REFUND PAYMENT LOOKUP ERROR:", error);
    return {
      paymentId: null,
      paymentStatus: "REFUND_PENDING",
      provider: null,
      message: "예약 결제 정보를 조회하지 못해 환불 확인이 필요합니다.",
    };
  }

  if (!payment) {
    return {
      paymentId: null,
      paymentStatus: "NO_PAYMENT",
      provider: null,
      message: "환불할 예약 선결제 내역이 없습니다.",
    };
  }

  const cancelReason = normalizeCancelReason(
    params.reason,
    params.actorType === "ADMIN" ? "관리자 예약 취소" : "사용자 예약 취소",
  );

  if (payment.provider === "FAKE") {
    await markPaymentRefunded({
      db: params.db,
      payment,
      metadata: {
        refund: {
          mode: "FAKE",
          actorType: params.actorType,
          reason: cancelReason,
        },
      },
    });

    return {
      paymentId: payment.id,
      paymentStatus: "REFUNDED",
      provider: payment.provider,
      message: "FAKE 결제를 환불 처리했습니다.",
    };
  }

  if (!payment.provider_payment_key) {
    await markPaymentRefundPending({
      db: params.db,
      payment,
      code: "MISSING_PROVIDER_PAYMENT_KEY",
      message: "Toss paymentKey가 없어 수동 환불 확인이 필요합니다.",
      metadata: {
        refund: {
          actorType: params.actorType,
          reason: cancelReason,
        },
      },
    });

    return {
      paymentId: payment.id,
      paymentStatus: "REFUND_PENDING",
      provider: payment.provider,
      message: "Toss paymentKey가 없어 수동 환불 확인이 필요합니다.",
    };
  }

  const cancelResult = await cancelTossPayment({
    paymentKey: payment.provider_payment_key,
    cancelReason,
    cancelAmount: toPaymentAmount(payment.amount),
  });

  if (!cancelResult.ok) {
    await markPaymentRefundPending({
      db: params.db,
      payment,
      code: cancelResult.code,
      message: cancelResult.message,
      metadata: {
        refund: {
          actorType: params.actorType,
          reason: cancelReason,
          tossCancelError: cancelResult.providerPayload,
        },
      },
    });

    return {
      paymentId: payment.id,
      paymentStatus: "REFUND_PENDING",
      provider: payment.provider,
      message: cancelResult.message,
    };
  }

  await markPaymentRefunded({
    db: params.db,
    payment,
    metadata: {
      refund: {
        actorType: params.actorType,
        reason: cancelReason,
        tossCancelPayload: cancelResult.providerPayload,
      },
    },
  });

  return {
    paymentId: payment.id,
    paymentStatus: "REFUNDED",
    provider: payment.provider,
    message: "Toss 결제를 취소/환불 처리했습니다.",
  };
}
