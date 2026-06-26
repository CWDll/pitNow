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

interface ReservationRow {
  id: string;
  partner_id: string;
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

function isMissingNotesSchema(error: { code?: string; message?: string } | null) {
  const message = error?.message ?? "";
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    message.includes("partner_reservation_notes")
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

function parseNoteType(value: unknown): PartnerReservationNoteType | null {
  if (
    value === "NOTE" ||
    value === "ISSUE" ||
    value === "DELAY" ||
    value === "NO_SHOW"
  ) {
    return value;
  }

  return null;
}

async function getAuthorizedReservation(params: {
  reservationId: string;
  authClient: Parameters<typeof hasPartnerAdminMembership>[0];
  userId: string;
}) {
  if (!supabaseAdmin) {
    return {
      ok: false as const,
      response: jsonError(
        503,
        "SERVICE_ROLE_REQUIRED",
        "partner-admin 메모 API에는 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.",
      ),
    };
  }

  const { data: reservation, error } = await supabaseAdmin
    .from("reservations")
    .select("id,partner_id")
    .eq("id", params.reservationId)
    .maybeSingle<ReservationRow>();

  if (error) {
    console.error("PARTNER NOTE RESERVATION LOOKUP ERROR:", error);
    return {
      ok: false as const,
      response: jsonError(500, "DB_ERROR", "예약 조회 중 오류가 발생했습니다."),
    };
  }

  if (!reservation) {
    return {
      ok: false as const,
      response: jsonError(404, "RESERVATION_NOT_FOUND", "예약을 찾을 수 없습니다."),
    };
  }

  const membership = await hasPartnerAdminMembership(
    params.authClient,
    params.userId,
    reservation.partner_id,
  );

  if (membership.error) {
    console.error("PARTNER NOTE MEMBERSHIP ERROR:", membership.error);
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
        "이 예약에 대한 관리자 권한이 없습니다.",
      ),
    };
  }

  return {
    ok: true as const,
    reservation,
  };
}

export async function GET(req: Request, context: Context) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  const { id } = await context.params;
  const reservationId = id.trim();

  if (!reservationId) {
    return jsonError(400, "INVALID_RESERVATION_ID", "reservation id가 필요합니다.");
  }

  const reservationResult = await getAuthorizedReservation({
    reservationId,
    authClient: authResult.auth.client,
    userId: authResult.auth.userId,
  });

  if (!reservationResult.ok) {
    return reservationResult.response;
  }

  const { data, error } = await supabaseAdmin!
    .from("partner_reservation_notes")
    .select(
      "id,reservation_id,partner_id,author_user_id,note_type,body,is_resolved,resolved_at,resolved_by,created_at,updated_at",
    )
    .eq("reservation_id", reservationResult.reservation.id)
    .order("created_at", { ascending: false })
    .returns<PartnerReservationNoteRow[]>();

  if (error) {
    if (isMissingNotesSchema(error)) {
      return jsonError(
        500,
        "MISSING_PARTNER_NOTES_SCHEMA",
        "partner_reservation_notes 마이그레이션 적용이 필요합니다.",
      );
    }

    console.error("PARTNER NOTE LOOKUP ERROR:", error);
    return jsonError(500, "DB_ERROR", "현장 메모 조회 중 오류가 발생했습니다.");
  }

  return NextResponse.json({
    success: true,
    notes: (data ?? []).map(normalizeNote),
  });
}

export async function POST(req: Request, context: Context) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  const { id } = await context.params;
  const reservationId = id.trim();

  if (!reservationId) {
    return jsonError(400, "INVALID_RESERVATION_ID", "reservation id가 필요합니다.");
  }

  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "요청 본문(JSON)이 올바르지 않습니다.");
  }

  const body =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;
  const noteType = parseNoteType(body?.noteType ?? "NOTE");
  const noteBody = typeof body?.body === "string" ? body.body.trim() : "";

  if (!noteType || !noteBody) {
    return jsonError(
      400,
      "INVALID_INPUT",
      "noteType과 body 값을 확인해 주세요.",
    );
  }

  const reservationResult = await getAuthorizedReservation({
    reservationId,
    authClient: authResult.auth.client,
    userId: authResult.auth.userId,
  });

  if (!reservationResult.ok) {
    return reservationResult.response;
  }

  const { data, error } = await supabaseAdmin!
    .from("partner_reservation_notes")
    .insert({
      reservation_id: reservationResult.reservation.id,
      partner_id: reservationResult.reservation.partner_id,
      author_user_id: authResult.auth.userId,
      note_type: noteType,
      body: noteBody,
    })
    .select(
      "id,reservation_id,partner_id,author_user_id,note_type,body,is_resolved,resolved_at,resolved_by,created_at,updated_at",
    )
    .single<PartnerReservationNoteRow>();

  if (error || !data) {
    if (isMissingNotesSchema(error)) {
      return jsonError(
        500,
        "MISSING_PARTNER_NOTES_SCHEMA",
        "partner_reservation_notes 마이그레이션 적용이 필요합니다.",
      );
    }

    console.error("PARTNER NOTE CREATE ERROR:", error);
    return jsonError(500, "DB_ERROR", "현장 메모 저장 중 오류가 발생했습니다.");
  }

  return NextResponse.json({
    success: true,
    note: normalizeNote(data),
  });
}
