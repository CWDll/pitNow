import { NextResponse } from "next/server";

import { requireRequestUser } from "@/src/lib/auth";
import { expirePastConfirmedReservations } from "@/src/lib/reservation-no-shows";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";

export async function POST(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  if (!supabaseAdmin) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVICE_ROLE_REQUIRED",
          message: "예약 만료 처리에는 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.",
        },
      },
      { status: 503 },
    );
  }

  const result = await expirePastConfirmedReservations({
    client: supabaseAdmin,
    userId: authResult.auth.userId,
  });

  if (result.errors.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "NO_SHOW_SYNC_FAILED",
          message: "지난 예약의 노쇼 상태 반영에 실패했습니다.",
        },
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    expiredCount: result.expiredCount,
  });
}
