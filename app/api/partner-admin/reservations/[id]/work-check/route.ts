import { NextResponse } from "next/server";

import type { WorkCheckResult } from "@/src/domain/self-maintenance";
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

interface ResultInput {
  reservationTaskId: string;
  checkItemId: string | null;
  itemLabel: string;
  result: WorkCheckResult;
  note: string;
  checkRound: 1 | 2;
  sortOrder: number;
}

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

function parseResults(value: unknown): ResultInput[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const results: ResultInput[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") {
      return null;
    }
    const item = row as Record<string, unknown>;
    if (
      typeof item.reservationTaskId !== "string" ||
      (typeof item.checkItemId !== "string" && item.checkItemId !== null) ||
      typeof item.itemLabel !== "string" ||
      !["NO_ISSUE", "ISSUE_FOUND", "UNABLE_TO_CHECK"].includes(
        String(item.result),
      ) ||
      (item.checkRound !== 1 && item.checkRound !== 2)
    ) {
      return null;
    }
    results.push({
      reservationTaskId: item.reservationTaskId,
      checkItemId: item.checkItemId as string | null,
      itemLabel: item.itemLabel.trim(),
      result: item.result as WorkCheckResult,
      note: typeof item.note === "string" ? item.note.trim() : "",
      checkRound: item.checkRound,
      sortOrder:
        typeof item.sortOrder === "number" ? Math.floor(item.sortOrder) : 0,
    });
  }
  return results.every((row) => row.itemLabel) ? results : null;
}

export async function PUT(req: Request, context: Context) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }
  const authResult = await requireRequestUser(req);
  if (!authResult.ok) {
    return authResult.response;
  }
  const reservationId = (await context.params).id.trim();
  const body = (await req.json().catch(() => null)) as {
    status?: unknown;
    summaryNote?: unknown;
    results?: unknown;
  } | null;
  const status =
    body?.status === "RECORDED" || body?.status === "NOT_PERFORMED"
      ? body.status
      : null;
  const results = status === "RECORDED" ? parseResults(body?.results) : [];
  if (!reservationId || !status || results === null) {
    return jsonError(400, "INVALID_PAYLOAD", "작업 확인 결과가 올바르지 않습니다.");
  }

  const db = supabaseAdmin ?? authResult.auth.client;
  const { data: reservation, error: reservationError } = await db
    .from("reservations")
    .select("id,partner_id,reservation_type,helper_verify_requested")
    .eq("id", reservationId)
    .maybeSingle<{
      id: string;
      partner_id: string;
      reservation_type: string;
      helper_verify_requested: boolean;
    }>();
  if (reservationError || !reservation) {
    return jsonError(404, "RESERVATION_NOT_FOUND", "예약을 찾을 수 없습니다.");
  }
  const membership = await hasPartnerAdminMembership(
    authResult.auth.client,
    authResult.auth.userId,
    reservation.partner_id,
  );
  if (membership.error || !membership.allowed) {
    return jsonError(403, "PARTNER_ADMIN_FORBIDDEN", "권한이 없습니다.");
  }
  if (
    reservation.reservation_type !== "SELF_SERVICE" ||
    !reservation.helper_verify_requested
  ) {
    return jsonError(
      409,
      "WORK_CHECK_NOT_REQUESTED",
      "정비사 작업 확인을 신청한 SELF 예약이 아닙니다.",
    );
  }

  const { data: workCheck, error: workCheckError } = await db
    .from("reservation_work_checks")
    .select("id")
    .eq("reservation_id", reservationId)
    .single<{ id: string }>();
  if (workCheckError || !workCheck) {
    return jsonError(409, "WORK_CHECK_NOT_FOUND", "작업 확인 요청이 없습니다.");
  }

  const { data: reservationTasks, error: tasksError } = await db
    .from("reservation_tasks")
    .select("id,check_scope_snapshot")
    .eq("reservation_id", reservationId)
    .returns<
      Array<{
        id: string;
        check_scope_snapshot: Array<{ id: string; label: string }>;
      }>
    >();
  if (tasksError) {
    return jsonError(500, "DB_ERROR", "예약 작업을 확인하지 못했습니다.");
  }
  const allowedItems = new Set(
    (reservationTasks ?? []).flatMap((task) =>
      (task.check_scope_snapshot ?? []).map(
        (item) => `${task.id}:${item.id}:${item.label}`,
      ),
    ),
  );
  if (
    results.some(
      (result) =>
        !result.checkItemId ||
        !allowedItems.has(
          `${result.reservationTaskId}:${result.checkItemId}:${result.itemLabel}`,
        ),
    )
  ) {
    return jsonError(
      400,
      "INVALID_CHECK_ITEM",
      "예약 당시 확인 범위에 없는 항목이 포함되어 있습니다.",
    );
  }

  const rounds = [...new Set(results.map((result) => result.checkRound))];
  if (status === "NOT_PERFORMED") {
    const { error: deleteError } = await db
      .from("reservation_work_check_results")
      .delete()
      .eq("work_check_id", workCheck.id);
    if (deleteError) {
      return jsonError(500, "DB_ERROR", "기존 확인 결과를 정리하지 못했습니다.");
    }
  } else if (rounds.length > 0) {
    const { error: deleteError } = await db
      .from("reservation_work_check_results")
      .delete()
      .eq("work_check_id", workCheck.id)
      .in("check_round", rounds);
    if (deleteError) {
      return jsonError(500, "DB_ERROR", "기존 확인 결과를 정리하지 못했습니다.");
    }
  }

  if (results.length > 0) {
    const { error: insertError } = await db
      .from("reservation_work_check_results")
      .insert(
        results.map((result) => ({
          work_check_id: workCheck.id,
          reservation_task_id: result.reservationTaskId,
          check_item_id: result.checkItemId,
          item_label_snapshot: result.itemLabel,
          result: result.result,
          note: result.note || null,
          check_round: result.checkRound,
          sort_order: result.sortOrder,
        })),
      );
    if (insertError) {
      console.error("WORK CHECK RESULT INSERT ERROR:", insertError);
      return jsonError(500, "DB_ERROR", "작업 확인 결과를 저장하지 못했습니다.");
    }
  }

  const now = new Date().toISOString();
  const { error: updateError } = await db
    .from("reservation_work_checks")
    .update({
      status,
      summary_note:
        typeof body?.summaryNote === "string"
          ? body.summaryNote.trim() || null
          : null,
      recorded_by: authResult.auth.userId,
      recorded_at: now,
      updated_at: now,
    })
    .eq("id", workCheck.id);
  if (updateError) {
    return jsonError(500, "DB_ERROR", "작업 확인 상태를 저장하지 못했습니다.");
  }

  return NextResponse.json({ success: true, status, recordedAt: now });
}
