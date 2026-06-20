import { NextResponse } from "next/server";

import type { ConfirmPaymentPayload } from "@/src/domain/types";
import { requireRequestUser } from "@/src/lib/auth";
import {
  confirmTossPayment,
  getPaymentProviderMode,
  toPaymentAmount,
} from "@/src/lib/payments";
import { apiError, type ApiErrorSpec } from "@/src/lib/reservation-create";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  hasSupabaseServiceRoleEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";

interface SettlementPaymentForConfirm {
  id: string;
  user_id: string;
  reservation_id: string | null;
  checkout_id: string | null;
  payment_purpose: string;
  provider: "FAKE" | "TOSS";
  provider_order_id: string;
  status: string;
  amount: number | string;
}

function jsonError({ status, code, message }: ApiErrorSpec) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

function parsePayload(payload: unknown): ConfirmPaymentPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const { paymentId, providerPaymentKey, providerOrderId, amount } =
    payload as Record<string, unknown>;

  if (
    typeof paymentId !== "string" ||
    typeof providerOrderId !== "string" ||
    typeof amount !== "number" ||
    !Number.isFinite(amount)
  ) {
    return null;
  }

  return {
    paymentId: paymentId.trim(),
    providerOrderId: providerOrderId.trim(),
    amount,
    providerPaymentKey:
      typeof providerPaymentKey === "string"
        ? providerPaymentKey.trim()
        : undefined,
  };
}

function isMissingSettlementPaymentSchema(error: { message?: string } | null) {
  return Boolean(
    error?.message?.includes("payment_purpose") ||
      error?.message?.includes("checkout_id"),
  );
}

export async function POST(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  if (!hasSupabaseServiceRoleEnv || !supabaseAdmin) {
    return jsonError(
      apiError(
        503,
        "SERVICE_ROLE_REQUIRED",
        "사후정산 결제 승인 API에는 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.",
      ),
    );
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return jsonError(
      apiError(400, "INVALID_JSON", "요청 본문(JSON)이 올바르지 않습니다."),
    );
  }

  const body = parsePayload(payload);

  if (!body) {
    return jsonError(
      apiError(400, "INVALID_INPUT", "결제 승인 요청 형식이 올바르지 않습니다."),
    );
  }

  const { auth } = authResult;
  const { data: payment, error: paymentError } = await supabaseAdmin
    .from("payments")
    .select(
      "id, user_id, reservation_id, checkout_id, payment_purpose, provider, provider_order_id, status, amount",
    )
    .eq("id", body.paymentId)
    .eq("user_id", auth.userId)
    .maybeSingle<SettlementPaymentForConfirm>();

  if (paymentError) {
    console.error("SETTLEMENT PAYMENT CONFIRM LOOKUP ERROR:", paymentError);

    if (isMissingSettlementPaymentSchema(paymentError)) {
      return jsonError(
        apiError(
          500,
          "MISSING_SETTLEMENT_PAYMENT_SCHEMA",
          "db/migrations/20260620_checkout_settlement_payments.sql을 Supabase에 적용해 주세요.",
        ),
      );
    }

    return jsonError(
      apiError(500, "PAYMENT_LOOKUP_FAILED", "정산 결제 정보를 조회하지 못했습니다."),
    );
  }

  if (!payment) {
    return jsonError(
      apiError(404, "PAYMENT_NOT_FOUND", "정산 결제 정보를 찾을 수 없습니다."),
    );
  }

  if (payment.payment_purpose !== "CHECKOUT_SETTLEMENT") {
    return jsonError(
      apiError(400, "INVALID_PAYMENT_PURPOSE", "사후정산 결제가 아닙니다."),
    );
  }

  if (payment.status !== "READY") {
    return jsonError(
      apiError(
        400,
        "INVALID_PAYMENT_STATUS",
        "결제 준비 상태에서만 승인할 수 있습니다.",
      ),
    );
  }

  if (payment.provider_order_id !== body.providerOrderId) {
    return jsonError(
      apiError(400, "ORDER_ID_MISMATCH", "결제 주문 ID가 일치하지 않습니다."),
    );
  }

  const storedAmount = toPaymentAmount(payment.amount);

  if (storedAmount !== body.amount) {
    return jsonError(
      apiError(400, "AMOUNT_MISMATCH", "결제 금액이 일치하지 않습니다."),
    );
  }

  const providerMode = getPaymentProviderMode();

  if (payment.provider === "FAKE" && providerMode !== "FAKE") {
    return jsonError(
      apiError(400, "PAYMENT_PROVIDER_MISMATCH", "결제 provider가 일치하지 않습니다."),
    );
  }

  if (payment.provider === "TOSS" && providerMode === "FAKE") {
    return jsonError(
      apiError(400, "PAYMENT_PROVIDER_MISMATCH", "결제 provider가 일치하지 않습니다."),
    );
  }

  const approvedAt = new Date().toISOString();
  let providerPayload: unknown = {
    mode: "FAKE",
  };
  const providerPaymentKey =
    body.providerPaymentKey || `fake_${payment.provider_order_id}`;

  if (payment.provider === "TOSS") {
    if (!body.providerPaymentKey) {
      return jsonError(
        apiError(
          400,
          "TOSS_PAYMENT_KEY_REQUIRED",
          "Toss 결제 승인에는 paymentKey가 필요합니다.",
        ),
      );
    }

    const tossConfirmResult = await confirmTossPayment({
      paymentKey: body.providerPaymentKey,
      orderId: payment.provider_order_id,
      amount: storedAmount,
    });

    if (!tossConfirmResult.ok) {
      await supabaseAdmin
        .from("payments")
        .update({
          status: "FAILED",
          failure_code: tossConfirmResult.code,
          failure_message: tossConfirmResult.message,
          metadata: {
            tossConfirmError: tossConfirmResult.providerPayload,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id)
        .eq("status", "READY");

      return jsonError(
        apiError(
          tossConfirmResult.status,
          tossConfirmResult.code,
          tossConfirmResult.message,
        ),
      );
    }

    providerPayload = tossConfirmResult.providerPayload;
  }

  const { error: confirmError } = await supabaseAdmin
    .from("payments")
    .update({
      status: "SETTLEMENT_CONFIRMED",
      provider_payment_key: providerPaymentKey,
      approved_at: approvedAt,
      metadata: {
        mode: providerMode,
        providerPayload,
      },
      updated_at: approvedAt,
    })
    .eq("id", payment.id)
    .eq("status", "READY");

  if (confirmError) {
    console.error("SETTLEMENT PAYMENT FINALIZE ERROR:", confirmError);
    return jsonError(
      apiError(500, "PAYMENT_FINALIZE_FAILED", "사후정산 결제 저장에 실패했습니다."),
    );
  }

  return NextResponse.json({
    success: true,
    paymentStatus: "SETTLEMENT_CONFIRMED",
    reservationId: payment.reservation_id,
    checkoutId: payment.checkout_id,
  });
}
