import { NextResponse } from "next/server";

import { requireRequestUser } from "@/src/lib/auth";
import { hasPartnerAdminMembership } from "@/src/lib/partner-admin";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";

type PartnerReservationNoteType = "NOTE" | "ISSUE" | "DELAY" | "NO_SHOW";

interface Context {
  params: Promise<{ id: string }>;
}

interface PartnerReservationNoteRow {
  id: string;
  reservation_id: string;
  partner_id: string;
  author_user_id: string | null;
  note_type: PartnerReservationNoteType;
  body: string;
  is_resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
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

function normalizeNote(row: PartnerReservationNoteRow) {
  return {
    id: row.id,
    reservationId: row.reservation_id,
    partnerId: row.partner_id,
    authorUserId: row.author_user_id,
    noteType: row.note_type,
    body: row.body,
    isResolved: row.is_resolved,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isMissingNotesSchema(error: { code?: string; message?: string } | null) {
  const message = error?.message ?? "";
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    message.includes("partner_reservation_notes")
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
      "partner-admin 메모 API에는 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.",
    );
  }

  const { id } = await context.params;
  const noteId = id.trim();

  if (!noteId) {
    return jsonError(400, "INVALID_NOTE_ID", "note id가 필요합니다.");
  }

  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "요청 본문(JSON)이 올바르지 않습니다.");
  }

  const isResolved =
    payload && typeof payload === "object"
      ? (payload as { isResolved?: unknown }).isResolved
      : undefined;

  if (typeof isResolved !== "boolean") {
    return jsonError(
      400,
      "INVALID_INPUT",
      "isResolved boolean 값이 필요합니다.",
    );
  }

  const { data: currentNote, error: currentError } = await supabaseAdmin
    .from("partner_reservation_notes")
    .select(
      "id,reservation_id,partner_id,author_user_id,note_type,body,is_resolved,resolved_at,resolved_by,created_at,updated_at",
    )
    .eq("id", noteId)
    .maybeSingle<PartnerReservationNoteRow>();

  if (currentError) {
    if (isMissingNotesSchema(currentError)) {
      return jsonError(
        500,
        "MISSING_PARTNER_NOTES_SCHEMA",
        "partner_reservation_notes 마이그레이션 적용이 필요합니다.",
      );
    }

    console.error("PARTNER NOTE DETAIL LOOKUP ERROR:", currentError);
    return jsonError(500, "DB_ERROR", "현장 메모 조회 중 오류가 발생했습니다.");
  }

  if (!currentNote) {
    return jsonError(404, "NOTE_NOT_FOUND", "현장 메모를 찾을 수 없습니다.");
  }

  const membership = await hasPartnerAdminMembership(
    authResult.auth.client,
    authResult.auth.userId,
    currentNote.partner_id,
  );

  if (membership.error) {
    console.error("PARTNER NOTE UPDATE MEMBERSHIP ERROR:", membership.error);
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
      "이 현장 메모에 대한 관리자 권한이 없습니다.",
    );
  }

  const { data: updatedNote, error: updateError } = await supabaseAdmin
    .from("partner_reservation_notes")
    .update({
      is_resolved: isResolved,
      resolved_at: isResolved ? new Date().toISOString() : null,
      resolved_by: isResolved ? authResult.auth.userId : null,
    })
    .eq("id", currentNote.id)
    .select(
      "id,reservation_id,partner_id,author_user_id,note_type,body,is_resolved,resolved_at,resolved_by,created_at,updated_at",
    )
    .single<PartnerReservationNoteRow>();

  if (updateError || !updatedNote) {
    console.error("PARTNER NOTE UPDATE ERROR:", updateError);
    return jsonError(500, "DB_ERROR", "현장 메모 수정 중 오류가 발생했습니다.");
  }

  return NextResponse.json({
    success: true,
    note: normalizeNote(updatedNote),
  });
}
