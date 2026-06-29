import { NextResponse } from "next/server";

import { requireRequestUser } from "@/src/lib/auth";
import { recordPartnerAdminAudit } from "@/src/lib/partner-admin-audit";
import { hasPartnerAdminMembership } from "@/src/lib/partner-admin";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";

interface Context {
  params: Promise<{ id: string }>;
}

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

interface UpdateAvailabilityBlockBody {
  startsAt?: string;
  endsAt?: string;
  reason?: string | null;
  isActive?: boolean;
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

function parseBody(payload: unknown): UpdateAvailabilityBlockBody | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as Record<string, unknown>;
  const result: UpdateAvailabilityBlockBody = {};

  if (typeof body.startsAt !== "undefined") {
    if (typeof body.startsAt !== "string" || !parseDate(body.startsAt)) {
      return null;
    }

    result.startsAt = parseDate(body.startsAt)!.toISOString();
  }

  if (typeof body.endsAt !== "undefined") {
    if (typeof body.endsAt !== "string" || !parseDate(body.endsAt)) {
      return null;
    }

    result.endsAt = parseDate(body.endsAt)!.toISOString();
  }

  if (typeof body.reason !== "undefined") {
    if (body.reason !== null && typeof body.reason !== "string") {
      return null;
    }

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    result.reason = reason || null;
  }

  if (typeof body.isActive !== "undefined") {
    if (typeof body.isActive !== "boolean") {
      return null;
    }

    result.isActive = body.isActive;
  }

  if (Object.keys(result).length === 0) {
    return null;
  }

  return result;
}

function validateTimeOrder(startsAt: string, endsAt: string): boolean {
  const startDate = parseDate(startsAt);
  const endDate = parseDate(endsAt);
  return Boolean(startDate && endDate && startDate < endDate);
}

function blockDbError(error: { message?: string; code?: string } | null) {
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

  return jsonError(
    500,
    "DB_ERROR",
    "예약 차단 시간 수정 중 오류가 발생했습니다.",
  );
}

export async function PATCH(req: Request, context: Context) {
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

  const { id } = await context.params;
  const blockId = id.trim();

  if (!blockId) {
    return jsonError(400, "INVALID_BLOCK_ID", "block id가 필요합니다.");
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
      "수정할 startsAt, endsAt, reason, isActive 값을 확인해 주세요.",
    );
  }

  const { data: currentBlock, error: currentError } = await supabaseAdmin
    .from("partner_availability_blocks")
    .select(
      "id,partner_id,bay_id,starts_at,ends_at,reason,is_active,created_at,updated_at,bays(name)",
    )
    .eq("id", blockId)
    .maybeSingle<AvailabilityBlockRow>();

  if (currentError) {
    console.error("PARTNER ADMIN AVAILABILITY DETAIL LOOKUP ERROR:", currentError);
    return jsonError(
      500,
      "DB_ERROR",
      "예약 차단 시간 조회 중 오류가 발생했습니다.",
    );
  }

  if (!currentBlock) {
    return jsonError(
      404,
      "AVAILABILITY_BLOCK_NOT_FOUND",
      "예약 차단 시간을 찾을 수 없습니다.",
    );
  }

  const membership = await hasPartnerAdminMembership(
    authResult.auth.client,
    authResult.auth.userId,
    currentBlock.partner_id,
  );

  if (membership.error) {
    console.error(
      "PARTNER ADMIN AVAILABILITY UPDATE MEMBERSHIP ERROR:",
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
      "이 예약 차단 시간에 대한 관리자 권한이 없습니다.",
    );
  }

  const nextStartsAt = body.startsAt ?? currentBlock.starts_at;
  const nextEndsAt = body.endsAt ?? currentBlock.ends_at;

  if (!validateTimeOrder(nextStartsAt, nextEndsAt)) {
    return jsonError(
      400,
      "INVALID_TIME_WINDOW",
      "예약 차단 시작 시간은 종료 시간보다 빨라야 합니다.",
    );
  }

  const updatePayload: Record<string, unknown> = {};

  if (typeof body.startsAt !== "undefined") {
    updatePayload.starts_at = body.startsAt;
  }

  if (typeof body.endsAt !== "undefined") {
    updatePayload.ends_at = body.endsAt;
  }

  if (typeof body.reason !== "undefined") {
    updatePayload.reason = body.reason;
  }

  if (typeof body.isActive !== "undefined") {
    updatePayload.is_active = body.isActive;
  }

  const { data: updatedBlock, error: updateError } = await supabaseAdmin
    .from("partner_availability_blocks")
    .update(updatePayload)
    .eq("id", currentBlock.id)
    .select(
      "id,partner_id,bay_id,starts_at,ends_at,reason,is_active,created_at,updated_at,bays(name)",
    )
    .single<AvailabilityBlockRow>();

  if (updateError || !updatedBlock) {
    console.error("PARTNER ADMIN AVAILABILITY UPDATE ERROR:", updateError);
    return blockDbError(updateError);
  }

  let auditAction:
    | "AVAILABILITY_BLOCK_UPDATED"
    | "AVAILABILITY_BLOCK_DEACTIVATED"
    | "AVAILABILITY_BLOCK_REACTIVATED" = "AVAILABILITY_BLOCK_UPDATED";

  if (currentBlock.is_active === true && updatedBlock.is_active === false) {
    auditAction = "AVAILABILITY_BLOCK_DEACTIVATED";
  }

  if (currentBlock.is_active === false && updatedBlock.is_active === true) {
    auditAction = "AVAILABILITY_BLOCK_REACTIVATED";
  }

  await recordPartnerAdminAudit({
    db: supabaseAdmin,
    partnerId: updatedBlock.partner_id,
    actorUserId: authResult.auth.userId,
    action: auditAction,
    targetType: "AVAILABILITY_BLOCK",
    targetId: updatedBlock.id,
    beforeState: normalizeBlock(currentBlock),
    afterState: normalizeBlock(updatedBlock),
  });

  return NextResponse.json({
    success: true,
    block: normalizeBlock(updatedBlock),
  });
}
