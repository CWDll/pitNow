import { NextResponse } from "next/server";

import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";

interface CredentialRow {
  partner_id: string;
}

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

export async function GET(req: Request) {
  if (!hasSupabaseEnv || !supabaseAdmin) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const token = new URL(req.url).searchParams.get("token")?.trim() ?? "";

  if (!token) {
    return jsonError(400, "INVALID_PARTNER_TOKEN", "QR 토큰이 필요합니다.");
  }

  const { data: credential, error } = await supabaseAdmin
    .from("partner_checkin_credentials")
    .select("partner_id")
    .eq("qr_token", token)
    .eq("is_active", true)
    .maybeSingle<CredentialRow>();

  if (error) {
    console.error("PARTNER CHECKIN DESTINATION LOOKUP ERROR:", error);
    return jsonError(500, "DB_ERROR", "정비소 정보를 확인하지 못했습니다.");
  }

  if (!credential) {
    return jsonError(
      404,
      "PARTNER_CHECKIN_CREDENTIAL_INVALID",
      "유효하지 않거나 재발급된 QR입니다.",
    );
  }

  return NextResponse.json({
    success: true,
    partnerId: credential.partner_id,
  });
}
