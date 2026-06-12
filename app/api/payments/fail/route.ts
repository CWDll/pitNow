import { NextResponse } from "next/server";

import type { FailPaymentPayload } from "@/src/domain/types";
import { requireRequestUser } from "@/src/lib/auth";
import { apiError, type ApiErrorSpec } from "@/src/lib/reservation-create";
import { markPaymentFailed } from "@/src/lib/payments";
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

function parsePayload(payload: unknown): FailPaymentPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const { paymentId, code, message, cancelled } = payload as Record<
    string,
    unknown
  >;

  if (typeof paymentId !== "string" || !paymentId.trim()) {
    return null;
  }

  return {
    paymentId: paymentId.trim(),
    code: typeof code === "string" ? code.trim() : undefined,
    message: typeof message === "string" ? message.trim() : undefined,
    cancelled: cancelled === true,
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
        "결제 실패 기록 API에는 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.",
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
        "결제 실패 기록 요청 형식이 올바르지 않습니다.",
      ),
    );
  }

  const status = body.cancelled ? "CANCELLED" : "FAILED";
  const { data, error } = await markPaymentFailed({
    db: supabaseAdmin,
    paymentId: body.paymentId,
    userId: authResult.auth.userId,
    status,
    code: body.code ?? null,
    message: body.message ?? null,
  });

  if (error) {
    console.error("PAYMENT FAIL UPDATE ERROR:", error);
    return jsonError(
      apiError(500, "PAYMENT_FAIL_UPDATE_FAILED", "결제 실패 기록에 실패했습니다."),
    );
  }

  if (!data) {
    return jsonError(
      apiError(
        400,
        "INVALID_PAYMENT_STATUS",
        "결제 준비 상태에서만 실패/취소 처리할 수 있습니다.",
      ),
    );
  }

  return NextResponse.json({
    success: true,
    paymentStatus: data.status,
  });
}

