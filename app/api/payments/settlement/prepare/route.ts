import { NextResponse } from "next/server";

import type { PrepareSettlementPaymentPayload } from "@/src/domain/types";
import { requireRequestUser } from "@/src/lib/auth";
import {
  assertPaymentMethod,
  createProviderOrderId,
  getPaymentProviderMode,
  getTossClientKey,
  providerFromMode,
  toPaymentAmount,
} from "@/src/lib/payments";
import { apiError, type ApiErrorSpec } from "@/src/lib/reservation-create";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  hasSupabaseServiceRoleEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";

interface ReservationForSettlement {
  id: string;
  user_id: string;
  status: string;
  total_price: number | string;
}

interface CheckoutForSettlement {
  id: string;
  reservation_id: string;
  base_price: number | string;
  extra_fee: number | string | null;
  helper_verify_fee: number | string;
  total_settlement: number | string;
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

function parsePayload(payload: unknown): PrepareSettlementPaymentPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const { reservationId } = payload as Record<string, unknown>;
  const method = assertPaymentMethod(
    (payload as Record<string, unknown>).method,
  );

  if (typeof reservationId !== "string" || !reservationId.trim() || !method) {
    return null;
  }

  return {
    reservationId: reservationId.trim(),
    method,
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
        "사후정산 결제 준비 API에는 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.",
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
      apiError(
        400,
        "INVALID_INPUT",
        "reservationId와 결제 수단은 필수입니다.",
      ),
    );
  }

  const { auth } = authResult;
  const { data: reservation, error: reservationError } = await supabaseAdmin
    .from("reservations")
    .select("id, user_id, status, total_price")
    .eq("id", body.reservationId)
    .eq("user_id", auth.userId)
    .maybeSingle<ReservationForSettlement>();

  if (reservationError) {
    console.error("SETTLEMENT RESERVATION LOOKUP ERROR:", reservationError);
    return jsonError(
      apiError(500, "RESERVATION_LOOKUP_FAILED", "예약 정보를 조회하지 못했습니다."),
    );
  }

  if (!reservation) {
    return jsonError(
      apiError(404, "RESERVATION_NOT_FOUND", "예약을 찾을 수 없습니다."),
    );
  }

  if (reservation.status !== "COMPLETED") {
    return jsonError(
      apiError(
        400,
        "RESERVATION_NOT_COMPLETED",
        "완료된 예약만 사후정산 결제를 진행할 수 있습니다.",
      ),
    );
  }

  const { data: checkout, error: checkoutError } = await supabaseAdmin
    .from("checkouts")
    .select(
      "id, reservation_id, base_price, extra_fee, helper_verify_fee, total_settlement",
    )
    .eq("reservation_id", reservation.id)
    .maybeSingle<CheckoutForSettlement>();

  if (checkoutError) {
    console.error("SETTLEMENT CHECKOUT LOOKUP ERROR:", checkoutError);
    return jsonError(
      apiError(500, "CHECKOUT_LOOKUP_FAILED", "체크아웃 정산 정보를 조회하지 못했습니다."),
    );
  }

  if (!checkout) {
    return jsonError(
      apiError(404, "CHECKOUT_NOT_FOUND", "체크아웃 정산 정보를 찾을 수 없습니다."),
    );
  }

  const paidReservationAmount = toPaymentAmount(reservation.total_price);
  const totalSettlement = toPaymentAmount(checkout.total_settlement);
  const amountDue = Math.max(0, totalSettlement - paidReservationAmount);

  if (amountDue <= 0) {
    return jsonError(
      apiError(400, "NO_SETTLEMENT_DUE", "추가로 결제할 정산 금액이 없습니다."),
    );
  }

  const { data: existingPayment, error: existingPaymentError } =
    await supabaseAdmin
      .from("payments")
      .select("id, status")
      .eq("checkout_id", checkout.id)
      .eq("payment_purpose", "CHECKOUT_SETTLEMENT")
      .in("status", ["READY", "APPROVED", "SETTLEMENT_CONFIRMED"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; status: string }>();

  if (existingPaymentError) {
    console.error("SETTLEMENT PAYMENT LOOKUP ERROR:", existingPaymentError);

    if (isMissingSettlementPaymentSchema(existingPaymentError)) {
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

  if (existingPayment?.status === "SETTLEMENT_CONFIRMED") {
    return jsonError(
      apiError(409, "SETTLEMENT_ALREADY_PAID", "이미 추가 정산 결제가 완료되었습니다."),
    );
  }

  if (existingPayment) {
    await supabaseAdmin
      .from("payments")
      .update({
        status: "CANCELLED",
        failure_code: "REPLACED_BY_NEW_SETTLEMENT_PAYMENT",
        failure_message: "새 사후정산 결제를 시작해 이전 READY 결제를 취소했습니다.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingPayment.id)
      .eq("status", "READY");
  }

  const mode = getPaymentProviderMode();
  const provider = providerFromMode(mode);
  const tossClientKey = provider === "TOSS" ? getTossClientKey() : null;

  if (provider === "TOSS" && !tossClientKey) {
    return jsonError(
      apiError(
        503,
        "TOSS_CLIENT_KEY_REQUIRED",
        "Toss test 결제를 위해 NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY가 필요합니다.",
      ),
    );
  }

  const providerOrderId = createProviderOrderId();
  const settlementSnapshot = {
    purpose: "CHECKOUT_SETTLEMENT",
    reservationId: reservation.id,
    checkoutId: checkout.id,
    amount: amountDue,
    paidReservationAmount,
    basePrice: toPaymentAmount(checkout.base_price),
    extraFee: toPaymentAmount(checkout.extra_fee ?? 0),
    helperVerifyFee: toPaymentAmount(checkout.helper_verify_fee),
    totalSettlement,
  };

  const { data, error } = await supabaseAdmin
    .from("payments")
    .insert({
      user_id: auth.userId,
      reservation_id: reservation.id,
      checkout_id: checkout.id,
      payment_purpose: "CHECKOUT_SETTLEMENT",
      provider,
      provider_order_id: providerOrderId,
      method: body.method,
      status: "READY",
      amount: amountDue,
      currency: "KRW",
      reservation_snapshot: settlementSnapshot,
      metadata: {
        mode,
      },
    })
    .select("id, provider_order_id, amount, currency")
    .single<{
      id: string;
      provider_order_id: string;
      amount: number | string;
      currency: string;
    }>();

  if (error || !data) {
    console.error("SETTLEMENT PAYMENT PREPARE INSERT ERROR:", error);

    if (isMissingSettlementPaymentSchema(error)) {
      return jsonError(
        apiError(
          500,
          "MISSING_SETTLEMENT_PAYMENT_SCHEMA",
          "db/migrations/20260620_checkout_settlement_payments.sql을 Supabase에 적용해 주세요.",
        ),
      );
    }

    return jsonError(
      apiError(500, "PAYMENT_PREPARE_FAILED", "사후정산 결제 준비에 실패했습니다."),
    );
  }

  const origin = new URL(req.url).origin;
  const successUrl = new URL("/settlement-payment/success", origin);
  successUrl.searchParams.set("paymentId", data.id);
  successUrl.searchParams.set("reservationId", reservation.id);
  const failUrl = new URL("/settlement-payment/fail", origin);
  failUrl.searchParams.set("paymentId", data.id);
  failUrl.searchParams.set("reservationId", reservation.id);

  return NextResponse.json({
    success: true,
    paymentId: data.id,
    provider,
    providerOrderId: data.provider_order_id,
    amount: Number(data.amount),
    currency: data.currency,
    checkout:
      provider === "FAKE"
        ? {
            mode,
            type: "FAKE",
          }
        : {
            mode,
            type: "TOSS_PAYMENT_WINDOW",
            clientKey: tossClientKey,
            customerKey: auth.userId,
            orderId: data.provider_order_id,
            orderName: "PitNow 추가 정산",
            successUrl: successUrl.toString(),
            failUrl: failUrl.toString(),
          },
  });
}
