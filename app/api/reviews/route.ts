import { NextResponse } from "next/server";

import { supabase } from "@/src/lib/supabase";

const MOCK_USER_ID = "00000000-0000-0000-0000-000000000001";

type ReservationStatus =
  | "CONFIRMED"
  | "CHECKED_IN"
  | "IN_USE"
  | "COMPLETED"
  | "CANCELLED";

interface CreateReviewPayload {
  reservationId: string;
  rating: number;
  comment?: string;
}

interface ReservationRow {
  id: string;
  status: ReservationStatus;
  bay_id: string;
}

interface BayRow {
  id: string;
  partner_id: string;
}

interface ReviewRow {
  id: string;
}

interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

function errorResponse(status: number, code: string, message: string) {
  const body: ApiErrorBody = {
    success: false,
    error: {
      code,
      message,
    },
  };

  return NextResponse.json(body, { status });
}

function parsePayload(payload: unknown): CreateReviewPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const reservationId = record.reservationId;
  const rating = record.rating;
  const comment = record.comment;

  if (typeof reservationId !== "string" || typeof rating !== "number") {
    return null;
  }

  const normalizedReservationId = reservationId.trim();

  if (!normalizedReservationId) {
    return null;
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return null;
  }

  if (comment !== undefined && typeof comment !== "string") {
    return null;
  }

  return {
    reservationId: normalizedReservationId,
    rating,
    comment: typeof comment === "string" ? comment.trim() : undefined,
  };
}

export async function POST(req: Request) {
  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "요청 본문(JSON)이 올바르지 않습니다.");
  }

  const body = parsePayload(payload);

  if (!body) {
    return errorResponse(
      400,
      "INVALID_INPUT",
      "reservationId, rating(1~5)은 필수입니다.",
    );
  }

  const { reservationId, rating, comment } = body;

  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("id, status, bay_id")
    .eq("id", reservationId)
    .maybeSingle<ReservationRow>();

  if (reservationError) {
    console.error("RESERVATION LOOKUP ERROR:", reservationError);
    return errorResponse(500, "DB_ERROR", "예약 조회 중 오류가 발생했습니다.");
  }

  if (!reservation) {
    return errorResponse(404, "RESERVATION_NOT_FOUND", "예약을 찾을 수 없습니다.");
  }

  if (reservation.status !== "COMPLETED") {
    return errorResponse(400, "INVALID_RESERVATION_STATUS", "완료된 예약만 후기 작성이 가능합니다.");
  }

  const { data: bay, error: bayError } = await supabase
    .from("bays")
    .select("id, partner_id")
    .eq("id", reservation.bay_id)
    .maybeSingle<BayRow>();

  if (bayError) {
    console.error("BAY LOOKUP ERROR:", bayError);
    return errorResponse(500, "DB_ERROR", "베이 조회 중 오류가 발생했습니다.");
  }

  if (!bay) {
    return errorResponse(404, "BAY_NOT_FOUND", "베이를 찾을 수 없습니다.");
  }

  const { data: existingReview, error: existingReviewError } = await supabase
    .from("reviews")
    .select("id")
    .eq("reservation_id", reservationId)
    .maybeSingle<ReviewRow>();

  if (existingReviewError) {
    console.error("REVIEW LOOKUP ERROR:", existingReviewError);
    return errorResponse(500, "DB_ERROR", "기존 후기 조회 중 오류가 발생했습니다.");
  }

  if (existingReview) {
    return errorResponse(409, "ALREADY_REVIEWED", "이미 후기를 작성한 예약입니다.");
  }

  const { data: createdReview, error: insertReviewError } = await supabase
    .from("reviews")
    .insert({
      reservation_id: reservationId,
      partner_id: bay.partner_id,
      user_id: MOCK_USER_ID,
      rating,
      comment: comment ?? null,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertReviewError) {
    console.error("REVIEW INSERT ERROR:", insertReviewError);

    if (insertReviewError.code === "23505") {
      return errorResponse(409, "ALREADY_REVIEWED", "이미 후기를 작성한 예약입니다.");
    }

    return errorResponse(500, "DB_ERROR", "후기 저장 중 오류가 발생했습니다.");
  }

  return NextResponse.json({
    success: true,
    reviewId: createdReview.id,
  });
}

function methodNotAllowed() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "POST 메서드만 허용됩니다.",
      },
    },
    {
      status: 405,
      headers: {
        Allow: "POST",
      },
    },
  );
}

export function GET() {
  return methodNotAllowed();
}

export function PUT() {
  return methodNotAllowed();
}

export function PATCH() {
  return methodNotAllowed();
}

export function DELETE() {
  return methodNotAllowed();
}

export function OPTIONS() {
  return methodNotAllowed();
}
