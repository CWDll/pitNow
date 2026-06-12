import { NextResponse } from "next/server";

import { requireRequestUser } from "@/src/lib/auth";
import {
  assertPaymentMethod,
  createProviderOrderId,
  getPaymentProviderMode,
  getTossClientKey,
  providerFromMode,
} from "@/src/lib/payments";
import {
  apiError,
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

export async function POST(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  if (!hasSupabaseServiceRoleEnv || !supabaseAdmin) {
    return jsonError(
      apiError(
        503,
        "SERVICE_ROLE_REQUIRED",
        "결제 준비 API에는 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.",
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

  const raw = payload as Record<string, unknown> | null;
  const method = assertPaymentMethod(raw?.method);
  const reservation = parseReservationRequestPayload(raw?.reservation);

  if (!method || !reservation) {
    return jsonError(
      apiError(400, "INVALID_INPUT", "결제 준비 요청 형식이 올바르지 않습니다."),
    );
  }

  const { auth } = authResult;
  const quoteResult = await quoteReservation({
    db: supabaseAdmin,
    body: reservation,
    userId: auth.userId,
  });

  if (!quoteResult.ok) {
    return jsonError(quoteResult.error);
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
  const amount = quoteResult.value.totalPrice;
  const reservationSnapshot = {
    ...reservation,
    amount,
  };

  const { data, error } = await supabaseAdmin
    .from("payments")
    .insert({
      user_id: auth.userId,
      provider,
      provider_order_id: providerOrderId,
      method,
      status: "READY",
      amount,
      currency: "KRW",
      reservation_snapshot: reservationSnapshot,
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
    console.error("PAYMENT PREPARE INSERT ERROR:", error);
    if (
      error?.code === "PGRST205" ||
      error?.code === "42P01" ||
      error?.message.includes("payments")
    ) {
      return jsonError(
        apiError(
          500,
          "MISSING_PAYMENTS_TABLE",
          "payments 테이블이 없습니다. db/migrations/20260611_payments_foundation.sql을 Supabase에 적용해 주세요.",
        ),
      );
    }

    return jsonError(
      apiError(500, "PAYMENT_PREPARE_FAILED", "결제 준비에 실패했습니다."),
    );
  }

  const origin = new URL(req.url).origin;
  const successUrl = new URL("/payment/success", origin);
  successUrl.searchParams.set("paymentId", data.id);
  const failUrl = new URL("/payment/fail", origin);
  failUrl.searchParams.set("paymentId", data.id);

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
            orderName: "PitNow 예약",
            successUrl: successUrl.toString(),
            failUrl: failUrl.toString(),
          },
  });
}
