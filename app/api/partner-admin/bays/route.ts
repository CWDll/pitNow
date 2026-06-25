import { NextResponse } from "next/server";

import { requireRequestUser } from "@/src/lib/auth";
import { hasPartnerAdminMembership } from "@/src/lib/partner-admin";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";

interface BayRow {
  id: string;
  partner_id: string;
  name: string;
  is_active: boolean;
}

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

  const { searchParams } = new URL(req.url);
  const partnerId = searchParams.get("partnerId")?.trim();

  if (!partnerId) {
    return jsonError(400, "INVALID_INPUT", "partnerId는 필수입니다.");
  }

  const membership = await hasPartnerAdminMembership(
    authResult.auth.client,
    authResult.auth.userId,
    partnerId,
  );

  if (membership.error) {
    console.error("PARTNER ADMIN BAY MEMBERSHIP ERROR:", membership.error);
    return jsonError(
      500,
      "DB_ERROR",
      "정비소 관리자 권한 확인 중 오류가 발생했습니다.",
    );
  }

  if (!membership.allowed) {
    return jsonError(
      403,
      "PARTNER_ADMIN_FORBIDDEN",
      "이 정비소에 대한 관리자 권한이 없습니다.",
    );
  }

  const db = supabaseAdmin ?? authResult.auth.client;
  const { data, error } = await db
    .from("bays")
    .select("id,partner_id,name,is_active")
    .eq("partner_id", partnerId)
    .order("name", { ascending: true })
    .returns<BayRow[]>();

  if (error) {
    console.error("PARTNER ADMIN BAY LOOKUP ERROR:", error);
    return jsonError(500, "DB_ERROR", "베이 목록 조회 중 오류가 발생했습니다.");
  }

  return NextResponse.json({
    success: true,
    bays: (data ?? []).map((bay) => ({
      id: bay.id,
      partnerId: bay.partner_id,
      name: bay.name,
      isActive: bay.is_active,
    })),
  });
}
