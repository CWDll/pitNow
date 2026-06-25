import { NextResponse } from "next/server";

import { requireRequestUser } from "@/src/lib/auth";
import { getPartnerAdminMemberships } from "@/src/lib/partner-admin";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
} from "@/src/lib/supabase";

function jsonError(status: number, code: string, message: string) {
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

export async function GET(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  const { auth } = authResult;
  const { data: partners, error } = await getPartnerAdminMemberships(
    auth.client,
    auth.userId,
  );

  if (error) {
    console.error("PARTNER ADMIN MEMBERSHIP LOOKUP ERROR:", error);
    return jsonError(
      500,
      "DB_ERROR",
      "정비소 관리자 권한 조회 중 오류가 발생했습니다.",
    );
  }

  return NextResponse.json({
    success: true,
    partners,
  });
}
