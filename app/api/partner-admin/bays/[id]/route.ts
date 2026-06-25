import { NextResponse } from "next/server";

import { requireRequestUser } from "@/src/lib/auth";
import { hasPartnerAdminMembership } from "@/src/lib/partner-admin";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";

interface Context {
  params: Promise<{ id: string }>;
}

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

function parseBody(payload: unknown): { isActive: boolean } | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const isActive = (payload as { isActive?: unknown }).isActive;

  if (typeof isActive !== "boolean") {
    return null;
  }

  return { isActive };
}

export async function PATCH(req: Request, context: Context) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  const { id } = await context.params;
  const bayId = id.trim();

  if (!bayId) {
    return jsonError(400, "INVALID_BAY_ID", "bay id가 필요합니다.");
  }

  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "요청 본문(JSON)이 올바르지 않습니다.");
  }

  const body = parseBody(payload);

  if (!body) {
    return jsonError(400, "INVALID_INPUT", "isActive boolean 값이 필요합니다.");
  }

  const db = supabaseAdmin ?? authResult.auth.client;
  const { data: bay, error: bayError } = await db
    .from("bays")
    .select("id,partner_id,name,is_active")
    .eq("id", bayId)
    .maybeSingle<BayRow>();

  if (bayError) {
    console.error("PARTNER ADMIN BAY DETAIL LOOKUP ERROR:", bayError);
    return jsonError(500, "DB_ERROR", "베이 조회 중 오류가 발생했습니다.");
  }

  if (!bay) {
    return jsonError(404, "BAY_NOT_FOUND", "베이를 찾을 수 없습니다.");
  }

  const membership = await hasPartnerAdminMembership(
    authResult.auth.client,
    authResult.auth.userId,
    bay.partner_id,
  );

  if (membership.error) {
    console.error("PARTNER ADMIN BAY UPDATE MEMBERSHIP ERROR:", membership.error);
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
      "이 베이에 대한 관리자 권한이 없습니다.",
    );
  }

  const { data: updatedBay, error: updateError } = await db
    .from("bays")
    .update({ is_active: body.isActive })
    .eq("id", bay.id)
    .select("id,partner_id,name,is_active")
    .maybeSingle<BayRow>();

  if (updateError || !updatedBay) {
    console.error("PARTNER ADMIN BAY UPDATE ERROR:", updateError);
    return jsonError(500, "DB_ERROR", "베이 상태 변경 중 오류가 발생했습니다.");
  }

  return NextResponse.json({
    success: true,
    bay: {
      id: updatedBay.id,
      partnerId: updatedBay.partner_id,
      name: updatedBay.name,
      isActive: updatedBay.is_active,
    },
  });
}
