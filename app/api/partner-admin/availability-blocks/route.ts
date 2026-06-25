import { NextResponse } from "next/server";

import { requireRequestUser } from "@/src/lib/auth";
import { hasPartnerAdminMembership } from "@/src/lib/partner-admin";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";

interface AvailabilityBlockRow {
  id: string;
  partner_id: string;
  bay_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  bays:
    | {
        name: string;
      }
    | Array<{
        name: string;
      }>
    | null;
}

interface BayRow {
  id: string;
  partner_id: string;
}

interface CreateAvailabilityBlockBody {
  partnerId: string;
  bayId: string | null;
  startsAt: string;
  endsAt: string;
  reason: string | null;
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

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function normalizeBlock(row: AvailabilityBlockRow) {
  return {
    id: row.id,
    partnerId: row.partner_id,
    bayId: row.bay_id,
    bayName: firstRelation(row.bays)?.name ?? null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    reason: row.reason,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseBody(payload: unknown): CreateAvailabilityBlockBody | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as Record<string, unknown>;
  const partnerId = typeof body.partnerId === "string" ? body.partnerId.trim() : "";
  const rawBayId = typeof body.bayId === "string" ? body.bayId.trim() : "";
  const startsAt = typeof body.startsAt === "string" ? body.startsAt.trim() : "";
  const endsAt = typeof body.endsAt === "string" ? body.endsAt.trim() : "";
  const rawReason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!partnerId || !startsAt || !endsAt) {
    return null;
  }

  const startDate = parseDate(startsAt);
  const endDate = parseDate(endsAt);

  if (!startDate || !endDate || startDate >= endDate) {
    return null;
  }

  return {
    partnerId,
    bayId: rawBayId || null,
    startsAt: startDate.toISOString(),
    endsAt: endDate.toISOString(),
    reason: rawReason || null,
  };
}

function blockDbError(statusFallback = 500) {
  return (error: { message?: string; code?: string } | null) => {
    const message = error?.message ?? "";

    if (
      message.includes("partner_availability_block_overlap") ||
      error?.code === "23P01"
    ) {
      return jsonError(
        400,
        "AVAILABILITY_BLOCK_OVERLAP",
        "겹치는 예약 차단 시간이 이미 있습니다.",
      );
    }

    if (message.includes("bay_partner_mismatch")) {
      return jsonError(
        400,
        "BAY_PARTNER_MISMATCH",
        "선택한 베이가 정비소와 일치하지 않습니다.",
      );
    }

    if (message.includes("bay_not_found")) {
      return jsonError(400, "BAY_NOT_FOUND", "선택한 베이를 찾을 수 없습니다.");
    }

    return jsonError(
      statusFallback,
      "DB_ERROR",
      "예약 차단 시간 처리 중 오류가 발생했습니다.",
    );
  };
}

async function assertPartnerAdmin(params: {
  db: typeof supabaseAdmin;
  authClient: Parameters<typeof hasPartnerAdminMembership>[0];
  userId: string;
  partnerId: string;
}) {
  const membership = await hasPartnerAdminMembership(
    params.authClient,
    params.userId,
    params.partnerId,
  );

  if (membership.error) {
    console.error("PARTNER ADMIN AVAILABILITY MEMBERSHIP ERROR:", membership.error);
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

  return {
    ok: true as const,
  };
}

async function assertBayBelongsToPartner(params: {
  db: NonNullable<typeof supabaseAdmin>;
  bayId: string | null;
  partnerId: string;
}) {
  if (!params.bayId) {
    return { ok: true as const };
  }

  const { data, error } = await params.db
    .from("bays")
    .select("id,partner_id")
    .eq("id", params.bayId)
    .maybeSingle<BayRow>();

  if (error) {
    console.error("PARTNER ADMIN AVAILABILITY BAY LOOKUP ERROR:", error);
    return {
      ok: false as const,
      response: jsonError(500, "DB_ERROR", "베이 조회 중 오류가 발생했습니다."),
    };
  }

  if (!data) {
    return {
      ok: false as const,
      response: jsonError(400, "BAY_NOT_FOUND", "선택한 베이를 찾을 수 없습니다."),
    };
  }

  if (data.partner_id !== params.partnerId) {
    return {
      ok: false as const,
      response: jsonError(
        400,
        "BAY_PARTNER_MISMATCH",
        "선택한 베이가 정비소와 일치하지 않습니다.",
      ),
    };
  }

  return { ok: true as const };
}

export async function GET(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  if (!supabaseAdmin) {
    return jsonError(
      503,
      "SERVICE_ROLE_REQUIRED",
      "partner-admin 조회에는 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.",
    );
  }

  const { searchParams } = new URL(req.url);
  const partnerId = searchParams.get("partnerId")?.trim();
  const includeInactive = searchParams.get("includeInactive") === "true";

  if (!partnerId) {
    return jsonError(400, "INVALID_INPUT", "partnerId는 필수입니다.");
  }

  const membership = await assertPartnerAdmin({
    db: supabaseAdmin,
    authClient: authResult.auth.client,
    userId: authResult.auth.userId,
    partnerId,
  });

  if (!membership.ok) {
    return membership.response;
  }

  let query = supabaseAdmin
    .from("partner_availability_blocks")
    .select(
      "id,partner_id,bay_id,starts_at,ends_at,reason,is_active,created_at,updated_at,bays(name)",
    )
    .eq("partner_id", partnerId)
    .order("starts_at", { ascending: true });

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query.returns<AvailabilityBlockRow[]>();

  if (error) {
    console.error("PARTNER ADMIN AVAILABILITY LOOKUP ERROR:", error);
    return jsonError(
      500,
      "DB_ERROR",
      "예약 차단 시간 조회 중 오류가 발생했습니다.",
    );
  }

  return NextResponse.json({
    success: true,
    blocks: (data ?? []).map(normalizeBlock),
  });
}

export async function POST(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  if (!supabaseAdmin) {
    return jsonError(
      503,
      "SERVICE_ROLE_REQUIRED",
      "partner-admin 쓰기에는 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.",
    );
  }

  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "요청 본문(JSON)이 올바르지 않습니다.");
  }

  const body = parseBody(payload);

  if (!body) {
    return jsonError(
      400,
      "INVALID_INPUT",
      "partnerId, startsAt, endsAt 값과 시간 순서를 확인해 주세요.",
    );
  }

  const membership = await assertPartnerAdmin({
    db: supabaseAdmin,
    authClient: authResult.auth.client,
    userId: authResult.auth.userId,
    partnerId: body.partnerId,
  });

  if (!membership.ok) {
    return membership.response;
  }

  const bayCheck = await assertBayBelongsToPartner({
    db: supabaseAdmin,
    bayId: body.bayId,
    partnerId: body.partnerId,
  });

  if (!bayCheck.ok) {
    return bayCheck.response;
  }

  const { data, error } = await supabaseAdmin
    .from("partner_availability_blocks")
    .insert({
      partner_id: body.partnerId,
      bay_id: body.bayId,
      starts_at: body.startsAt,
      ends_at: body.endsAt,
      reason: body.reason,
      created_by: authResult.auth.userId,
    })
    .select(
      "id,partner_id,bay_id,starts_at,ends_at,reason,is_active,created_at,updated_at,bays(name)",
    )
    .single<AvailabilityBlockRow>();

  if (error || !data) {
    console.error("PARTNER ADMIN AVAILABILITY CREATE ERROR:", error);
    return blockDbError()(error);
  }

  return NextResponse.json({
    success: true,
    blockId: data.id,
    block: normalizeBlock(data),
  });
}
