import { NextResponse } from "next/server";

import type { ConfirmPaymentPayload } from "@/src/domain/types";
import { requireRequestUser } from "@/src/lib/auth";
import { getPaymentProviderMode, toPaymentAmount } from "@/src/lib/payments";
import {
  apiError,
  createConfirmedReservation,
  parseReservationRequestPayload,
  quoteReservation,
  type ApiErrorSpec,
} from "@/src/lib/reservation-create";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  hasSupabaseServiceRoleEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";

interface PaymentForConfirm {
  id: string;
  user_id: string;
  reservation_id: string | null;
  provider: "FAKE" | "TOSS";
  provider_order_id: string;
  status: string;
  amount: number | string;
  reservation_snapshot: unknown;
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

export async function POST(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  if (!hasSupabaseServiceRoleEnv || !supabaseAdmin) {
    return jsonError(
      apiError(
        503,
        "SERVICE_ROLE_REQUIRED",
        "결제 승인 API에는 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.",
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
      "id, user_id, reservation_id, provider, provider_order_id, status, amount, reservation_snapshot",
    )
    .eq("id", body.paymentId)
    .eq("user_id", auth.userId)
    .maybeSingle<PaymentForConfirm>();

  if (paymentError) {
    console.error("PAYMENT CONFIRM LOOKUP ERROR:", paymentError);
    return jsonError(
      apiError(500, "PAYMENT_LOOKUP_FAILED", "결제 정보를 조회하지 못했습니다."),
    );
  }

  if (!payment) {
    return jsonError(
      apiError(404, "PAYMENT_NOT_FOUND", "결제 정보를 찾을 수 없습니다."),
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

  if (payment.provider !== "FAKE" || getPaymentProviderMode() !== "FAKE") {
    return jsonError(
      apiError(
        501,
        "PAYMENT_PROVIDER_NOT_IMPLEMENTED",
        "Toss 결제 승인 검증은 fake 결제 흐름 검증 후 연결합니다.",
      ),
    );
  }

  const snapshot = payment.reservation_snapshot as
    | Record<string, unknown>
    | null;
  const reservation = parseReservationRequestPayload(snapshot);

  if (!reservation || toPaymentAmount(snapshot?.amount as number) !== storedAmount) {
    return jsonError(
      apiError(
        500,
        "INVALID_PAYMENT_SNAPSHOT",
        "결제에 저장된 예약 정보가 올바르지 않습니다.",
      ),
    );
  }

  const approvedAt = new Date().toISOString();
  const { error: approveError } = await supabaseAdmin
    .from("payments")
    .update({
      status: "APPROVED",
      provider_payment_key:
        body.providerPaymentKey || `fake_${payment.provider_order_id}`,
      approved_at: approvedAt,
      updated_at: approvedAt,
    })
    .eq("id", payment.id)
    .eq("status", "READY");

  if (approveError) {
    console.error("PAYMENT APPROVE UPDATE ERROR:", approveError);
    return jsonError(
      apiError(500, "PAYMENT_APPROVE_FAILED", "결제 승인 저장에 실패했습니다."),
    );
  }

  const quoteResult = await quoteReservation({
    db: supabaseAdmin,
    body: reservation,
    userId: auth.userId,
  });

  if (!quoteResult.ok) {
    await supabaseAdmin
      .from("payments")
      .update({
        status: "REFUNDED",
        refunded_at: new Date().toISOString(),
        failure_code: quoteResult.error.code,
        failure_message: quoteResult.error.message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);

    return NextResponse.json(
      {
        success: false,
        paymentStatus: "REFUNDED",
        error: {
          code: quoteResult.error.code,
          message:
            "결제는 승인되었지만 예약 시간이 방금 마감되어 환불 처리했습니다.",
        },
      },
      { status: 409 },
    );
  }

  const createResult = await createConfirmedReservation({
    db: supabaseAdmin,
    body: reservation,
    quote: quoteResult.value,
    userId: auth.userId,
    actorUserId: auth.source === "supabase" ? auth.userId : null,
    statusReason: "payment_confirmed",
    statusMetadata: {
      paymentId: payment.id,
      provider: payment.provider,
      providerOrderId: payment.provider_order_id,
    },
  });

  if (!createResult.ok) {
    const refundStatus =
      createResult.error.code === "RESERVATION_OVERLAP"
        ? "REFUNDED"
        : "REFUND_PENDING";

    await supabaseAdmin
      .from("payments")
      .update({
        status: refundStatus,
        refunded_at:
          refundStatus === "REFUNDED" ? new Date().toISOString() : null,
        failure_code: createResult.error.code,
        failure_message: createResult.error.message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);

    return NextResponse.json(
      {
        success: false,
        paymentStatus: refundStatus,
        error: {
          code: createResult.error.code,
          message:
            refundStatus === "REFUNDED"
              ? "결제는 승인되었지만 예약 시간이 방금 마감되어 환불 처리했습니다."
              : "결제는 승인되었지만 예약 확정에 실패해 환불 확인이 필요합니다.",
        },
      },
      { status: refundStatus === "REFUNDED" ? 409 : 500 },
    );
  }

  const { error: confirmError } = await supabaseAdmin
    .from("payments")
    .update({
      reservation_id: createResult.value.id,
      status: "RESERVATION_CONFIRMED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id)
    .eq("status", "APPROVED");

  if (confirmError) {
    console.error("PAYMENT FINALIZE UPDATE ERROR:", confirmError);
    return jsonError(
      apiError(
        500,
        "PAYMENT_FINALIZE_FAILED",
        "예약은 생성되었지만 결제 확정 상태 저장에 실패했습니다.",
      ),
    );
  }

  return NextResponse.json({
    success: true,
    paymentStatus: "RESERVATION_CONFIRMED",
    reservationId: createResult.value.id,
    reservation: createResult.value,
  });
}

