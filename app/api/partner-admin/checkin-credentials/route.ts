import { NextResponse } from "next/server";

import { requireRequestUser } from "@/src/lib/auth";
import {
  createPartnerManualCode,
  createPartnerQrToken,
} from "@/src/lib/partner-checkin-credentials";
import { hasPartnerAdminMembership } from "@/src/lib/partner-admin";
import { recordPartnerAdminAudit } from "@/src/lib/partner-admin-audit";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";

interface CredentialRow {
  partner_id: string;
  qr_token: string;
  manual_code: string;
  rotated_at: string;
}

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

async function authorize(req: Request, partnerId: string) {
  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return { ok: false as const, response: authResult.response };
  }

  const membership = await hasPartnerAdminMembership(
    authResult.auth.client,
    authResult.auth.userId,
    partnerId,
  );

  if (membership.error) {
    return {
      ok: false as const,
      response: jsonError(
        500,
        "DB_ERROR",
        "정비소 관리자 권한 확인 중 오류가 발생했습니다.",
      ),
    };
  }

  if (!membership.allowed) {
    return {
      ok: false as const,
      response: jsonError(
        403,
        "PARTNER_ADMIN_FORBIDDEN",
        "이 정비소에 대한 관리자 권한이 없습니다.",
      ),
    };
  }

  return { ok: true as const, auth: authResult.auth };
}

function responseFor(req: Request, credential: CredentialRow) {
  const checkinUrl = new URL("/checkin", req.url);
  checkinUrl.searchParams.set("partnerToken", credential.qr_token);

  return NextResponse.json({
    success: true,
    credential: {
      qrValue: checkinUrl.toString(),
      manualCode: credential.manual_code,
      rotatedAt: credential.rotated_at,
    },
  });
}

export async function GET(req: Request) {
  if (!hasSupabaseEnv || !supabaseAdmin) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const partnerId = new URL(req.url).searchParams.get("partnerId")?.trim() ?? "";

  if (!partnerId) {
    return jsonError(400, "INVALID_PARTNER_ID", "partnerId가 필요합니다.");
  }

  const authorization = await authorize(req, partnerId);

  if (!authorization.ok) {
    return authorization.response;
  }

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("partner_checkin_credentials")
    .select("partner_id,qr_token,manual_code,rotated_at")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .maybeSingle<CredentialRow>();

  if (lookupError) {
    console.error("PARTNER CHECKIN CREDENTIAL LOOKUP ERROR:", lookupError);
    return jsonError(500, "DB_ERROR", "체크인 인증정보를 불러오지 못했습니다.");
  }

  if (existing) {
    return responseFor(req, existing);
  }

  const { data: created, error: createError } = await supabaseAdmin
    .from("partner_checkin_credentials")
    .upsert(
      {
        partner_id: partnerId,
        qr_token: createPartnerQrToken(),
        manual_code: createPartnerManualCode(),
        is_active: true,
        rotated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "partner_id" },
    )
    .select("partner_id,qr_token,manual_code,rotated_at")
    .single<CredentialRow>();

  if (createError || !created) {
    console.error("PARTNER CHECKIN CREDENTIAL CREATE ERROR:", createError);
    return jsonError(500, "DB_ERROR", "체크인 인증정보를 발급하지 못했습니다.");
  }

  return responseFor(req, created);
}

export async function POST(req: Request) {
  if (!hasSupabaseEnv || !supabaseAdmin) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "요청 본문이 올바르지 않습니다.");
  }

  const partnerId =
    payload && typeof payload === "object"
      ? String((payload as Record<string, unknown>).partnerId ?? "").trim()
      : "";

  if (!partnerId) {
    return jsonError(400, "INVALID_PARTNER_ID", "partnerId가 필요합니다.");
  }

  const authorization = await authorize(req, partnerId);

  if (!authorization.ok) {
    return authorization.response;
  }

  const rotatedAt = new Date().toISOString();
  const { data: credential, error } = await supabaseAdmin
    .from("partner_checkin_credentials")
    .upsert(
      {
        partner_id: partnerId,
        qr_token: createPartnerQrToken(),
        manual_code: createPartnerManualCode(),
        is_active: true,
        rotated_at: rotatedAt,
        updated_at: rotatedAt,
      },
      { onConflict: "partner_id" },
    )
    .select("partner_id,qr_token,manual_code,rotated_at")
    .single<CredentialRow>();

  if (error || !credential) {
    console.error("PARTNER CHECKIN CREDENTIAL ROTATE ERROR:", error);
    return jsonError(500, "DB_ERROR", "체크인 인증정보를 재발급하지 못했습니다.");
  }

  await recordPartnerAdminAudit({
    db: supabaseAdmin,
    partnerId,
    actorUserId: authorization.auth.userId,
    action: "CHECKIN_CREDENTIAL_ROTATED",
    targetType: "CHECKIN_CREDENTIAL",
    targetId: partnerId,
    afterState: { rotatedAt },
  });

  return responseFor(req, credential);
}
