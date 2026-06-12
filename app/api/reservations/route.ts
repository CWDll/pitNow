import { NextResponse } from "next/server";

import { requireRequestUser } from "@/src/lib/auth";
import {
  createConfirmedReservation,
  parseReservationRequestPayload,
  quoteReservation,
  type ApiErrorSpec,
} from "@/src/lib/reservation-create";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
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

  if (process.env.PITNOW_ALLOW_DIRECT_RESERVATION_CREATE !== "true") {
    return jsonError({
      status: 410,
      code: "DIRECT_RESERVATION_CREATE_DISABLED",
      message:
        "예약 확정은 결제 승인 후에만 가능합니다. /api/payments/prepare와 /api/payments/confirm을 사용해 주세요.",
    });
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return jsonError({
      status: 400,
      code: "INVALID_JSON",
      message: "요청 본문(JSON)이 올바르지 않습니다.",
    });
  }

  const body = parseReservationRequestPayload(payload);

  if (!body) {
    return jsonError({
      status: 400,
      code: "INVALID_INPUT",
      message: "예약 요청 형식이 올바르지 않습니다.",
    });
  }

  const { auth } = authResult;
  const quoteResult = await quoteReservation({
    db: auth.client,
    body,
    userId: auth.userId,
  });

  if (!quoteResult.ok) {
    return jsonError(quoteResult.error);
  }

  const createResult = await createConfirmedReservation({
    db: auth.client,
    body,
    quote: quoteResult.value,
    userId: auth.userId,
    actorUserId: auth.source === "supabase" ? auth.userId : null,
  });

  if (!createResult.ok) {
    return jsonError(createResult.error);
  }

  return NextResponse.json({
    success: true,
    ...createResult.value,
  });
}
