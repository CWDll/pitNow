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
  partnerId?: unknown;
  requestedName?: unknown;
  requestedDescription?: unknown;
  requestedDurationMinutes?: unknown;
  requestedLaborPrice?: unknown;
  reason?: unknown;
}

interface PackageCreationRequestRow {
  id: string;
  requested_name: string;
  requested_description: string | null;
  requested_duration_minutes: number;
  requested_labor_price: number | string;
  reason: string | null;
  status: "PENDING" | "FULFILLED" | "REJECTED";
  created_at: string;
}

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

function nonNegativeInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function mapRequest(row: PackageCreationRequestRow) {
  return {
    id: row.id,
    requestedName: row.requested_name,
    requestedDescription: row.requested_description ?? "",
    requestedDurationMinutes: row.requested_duration_minutes,
    requestedLaborPrice: Number(row.requested_labor_price),
    reason: row.reason ?? "",
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function GET(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);
  if (!authResult.ok) {
    return authResult.response;
  }

  const partnerId = new URL(req.url).searchParams.get("partnerId")?.trim();
  if (!partnerId) {
    return jsonError(400, "INVALID_INPUT", "partnerId는 필수입니다.");
  }

  const membership = await hasPartnerAdminMembership(
    authResult.auth.client,
    authResult.auth.userId,
    partnerId,
  );

  if (membership.error) {
    console.error("PARTNER PACKAGE CREATION LIST MEMBERSHIP ERROR:", membership.error);
    return jsonError(500, "DB_ERROR", "정비소 관리자 권한을 확인하지 못했습니다.");
  }

  if (!membership.allowed) {
    return jsonError(403, "PARTNER_ADMIN_FORBIDDEN", "이 정비소의 패키지 요청 조회 권한이 없습니다.");
  }

  const { data, error } = await authResult.auth.client
    .from("partner_package_creation_requests")
    .select("id,requested_name,requested_description,requested_duration_minutes,requested_labor_price,reason,status,created_at")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .returns<PackageCreationRequestRow[]>();

  if (error) {
    console.error("PARTNER PACKAGE CREATION LIST ERROR:", error);
    return jsonError(500, "DB_ERROR", "신규 패키지 요청을 불러오지 못했습니다.");
  }

  return NextResponse.json({
    success: true,
    requests: (data ?? []).map(mapRequest),
  });
}

export async function POST(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  if (!hasSupabaseServiceRoleEnv || !supabaseAdmin) {
    return jsonError(
      503,
      "SERVICE_ROLE_REQUIRED",
      "패키지 생성 요청에는 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.",
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
  const requestedName =
    typeof body.requestedName === "string" ? body.requestedName.trim() : "";
  const requestedDescription =
    typeof body.requestedDescription === "string"
      ? body.requestedDescription.trim()
      : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const requestedDurationMinutes = positiveInteger(
    body.requestedDurationMinutes,
  );
  const requestedLaborPrice = nonNegativeInteger(body.requestedLaborPrice);

  if (
    !partnerId ||
    !requestedName ||
    requestedDurationMinutes === null ||
    requestedDurationMinutes % 5 !== 0 ||
    requestedLaborPrice === null
  ) {
    return jsonError(
      400,
      "INVALID_INPUT",
      "패키지명, 5분 단위 소요시간, 희망가격을 확인해 주세요.",
    );
  }

  const membership = await hasPartnerAdminMembership(
    authResult.auth.client,
    authResult.auth.userId,
    partnerId,
  );

  if (membership.error) {
    console.error(
      "PARTNER PACKAGE CREATION MEMBERSHIP ERROR:",
      membership.error,
    );
    return jsonError(
      500,
      "DB_ERROR",
      "정비소 관리자 권한을 확인하지 못했습니다.",
    );
  }

  if (!membership.allowed) {
    return jsonError(
      403,
      "PARTNER_ADMIN_FORBIDDEN",
      "이 정비소의 패키지 생성 요청 권한이 없습니다.",
    );
  }

  const { data, error } = await supabaseAdmin
    .from("partner_package_creation_requests")
    .insert({
      partner_id: partnerId,
      requested_name: requestedName,
      requested_description: requestedDescription || null,
      requested_duration_minutes: requestedDurationMinutes,
      requested_labor_price: requestedLaborPrice,
      reason: reason || null,
      requested_by: authResult.auth.userId,
      status: "PENDING",
    })
    .select("id,requested_name,requested_description,requested_duration_minutes,requested_labor_price,reason,status,created_at")
    .single<PackageCreationRequestRow>();

  if (error || !data) {
    console.error("PARTNER PACKAGE CREATION REQUEST ERROR:", error);
    return jsonError(
      500,
      "PACKAGE_CREATION_REQUEST_FAILED",
      "신규 패키지 요청을 저장하지 못했습니다.",
    );
  }

  return NextResponse.json({ success: true, request: mapRequest(data) });
}
