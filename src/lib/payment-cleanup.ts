import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_READY_EXPIRY_MINUTES = 30;

export interface CleanupStaleReadyPaymentsResult {
  cutoff: string;
  expiredCount: number;
}

export interface ConfirmManualRefundResult {
  paymentId: string;
  updated: boolean;
}

export function getStaleReadyPaymentCutoff(
  expiryMinutes = DEFAULT_READY_EXPIRY_MINUTES,
): string {
  return new Date(Date.now() - expiryMinutes * 60 * 1000).toISOString();
}

export async function cleanupStaleReadyPayments(params: {
  db: SupabaseClient;
  expiryMinutes?: number;
}): Promise<CleanupStaleReadyPaymentsResult> {
  const cutoff = getStaleReadyPaymentCutoff(params.expiryMinutes);

  const { data, error } = await params.db
    .from("payments")
    .update({
      status: "CANCELLED",
      failure_code: "READY_EXPIRED",
      failure_message:
        "결제 준비 후 승인 없이 만료되어 운영 정리 처리했습니다.",
      metadata: {
        cleanup: {
          reason: "READY_EXPIRED",
          cutoff,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("status", "READY")
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    throw error;
  }

  return {
    cutoff,
    expiredCount: data?.length ?? 0,
  };
}

export async function confirmManualRefund(params: {
  db: SupabaseClient;
  paymentId: string;
  actorType?: "ADMIN" | "SYSTEM";
}): Promise<ConfirmManualRefundResult> {
  const refundedAt = new Date().toISOString();
  const { data, error } = await params.db
    .from("payments")
    .update({
      status: "REFUNDED",
      refunded_at: refundedAt,
      failure_code: null,
      failure_message: null,
      metadata: {
        manualRefundConfirmed: {
          actorType: params.actorType ?? "ADMIN",
          confirmedAt: refundedAt,
        },
      },
      updated_at: refundedAt,
    })
    .eq("id", params.paymentId)
    .eq("status", "REFUND_PENDING")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  return {
    paymentId: params.paymentId,
    updated: Boolean(data),
  };
}
