import { NextResponse } from "next/server";

import { requireRequestUser } from "@/src/lib/auth";
import { hasPartnerAdminMembership } from "@/src/lib/partner-admin";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  hasSupabaseServiceRoleEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";

interface RequestBody {
  packageId?: unknown;
  partnerId?: unknown;
  reason?: unknown;
  requestedLaborPrice?: unknown;
}

interface PartnerPackagePriceRow {
  id: string;
  labor_price: number | string;
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

function parseNonNegativeInteger(value: unknown): number | null {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function POST(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  if (!hasSupabaseServiceRoleEnv || !supabaseAdmin) {
    return jsonError(
      503,
      "SERVICE_ROLE_REQUIRED",
      "패키지 변경 요청에는 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.",
    );
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  let body: RequestBody;

  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonError(400, "INVALID_JSON", "요청 JSON이 올바르지 않습니다.");
  }

  const partnerId =
    typeof body.partnerId === "string" ? body.partnerId.trim() : "";
  const packageId =
    typeof body.packageId === "string" ? body.packageId.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const requestedLaborPrice = parseNonNegativeInteger(body.requestedLaborPrice);

  if (!partnerId || !packageId || requestedLaborPrice === null) {
    return jsonError(
      400,
      "INVALID_INPUT",
      "partnerId, packageId, requestedLaborPrice는 필수입니다.",
    );
  }

  const membership = await hasPartnerAdminMembership(
    authResult.auth.client,
    authResult.auth.userId,
    partnerId,
  );

  if (membership.error) {
    console.error(
      "PARTNER ADMIN PACKAGE REQUEST MEMBERSHIP ERROR:",
      membership.error,
    );
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

  const { data: priceRow, error: priceError } = await supabaseAdmin
    .from("partner_package_prices")
    .select("id,labor_price")
    .eq("partner_id", partnerId)
    .eq("package_id", packageId)
    .maybeSingle<PartnerPackagePriceRow>();

  if (priceError) {
    console.error("PARTNER PACKAGE REQUEST PRICE LOOKUP ERROR:", priceError);
    return jsonError(
      500,
      "DB_ERROR",
      "패키지 가격 조회 중 오류가 발생했습니다.",
    );
  }

  if (!priceRow) {
    return jsonError(
      404,
      "PARTNER_PACKAGE_NOT_FOUND",
      "해당 업장의 패키지 가격 row를 찾지 못했습니다.",
    );
  }

  const { data, error } = await supabaseAdmin
    .from("partner_package_change_requests")
    .insert({
      current_labor_price: Number(priceRow.labor_price) || 0,
      package_id: packageId,
      partner_id: partnerId,
      price_id: priceRow.id,
      reason: reason || null,
      requested_by: authResult.auth.userId,
      requested_labor_price: requestedLaborPrice,
      status: "PENDING",
    })
    .select("id,status")
    .single<{ id: string; status: string }>();

  if (error || !data) {
    console.error("PARTNER PACKAGE REQUEST CREATE ERROR:", error);
    return jsonError(
      500,
      "PACKAGE_REQUEST_CREATE_FAILED",
      "패키지 변경 요청 저장에 실패했습니다.",
    );
  }

  return NextResponse.json({
    success: true,
    request: data,
  });
}
