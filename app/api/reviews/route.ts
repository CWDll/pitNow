import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireRequestUser } from "@/src/lib/auth";
import {
  getPublicMediaUrl,
  REVIEW_IMAGE_BUCKET,
} from "@/src/lib/public-media";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";

type ReservationStatus =
  | "CONFIRMED"
  | "CHECKED_IN"
  | "IN_USE"
  | "COMPLETED"
  | "CANCELLED";

interface ReviewPayload {
  reservationId: string;
  rating: number;
  comment?: string;
  imagePaths: string[];
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
  reservation_id?: string;
  partner_id?: string;
  rating: number;
  comment: string | null;
  created_at?: string;
}

interface ReviewImageRow {
  id: string;
  review_id: string;
  storage_path: string;
  sort_order: number;
}

interface MyReviewRow extends ReviewRow {
  reservation_id: string;
  partner_id: string;
  created_at: string;
  partners:
    | { name: string }
    | Array<{ name: string }>
    | null;
  review_images: ReviewImageRow[] | null;
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

function parsePayload(payload: unknown): ReviewPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const reservationId = record.reservationId;
  const rating = record.rating;
  const comment = record.comment;
  const imagePaths = record.imagePaths;

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

  if (typeof comment === "string" && comment.trim().length > 500) {
    return null;
  }

  if (
    imagePaths !== undefined &&
    (!Array.isArray(imagePaths) ||
      imagePaths.length > 4 ||
      imagePaths.some(
        (path) => typeof path !== "string" || path.trim().length === 0,
      ))
  ) {
    return null;
  }

  return {
    reservationId: normalizedReservationId,
    rating,
    comment: typeof comment === "string" ? comment.trim() : undefined,
    imagePaths: Array.isArray(imagePaths)
      ? imagePaths.map((path) => String(path).trim())
      : [],
  };
}

function publicReviewImage(path: string) {
  if (!supabaseAdmin) {
    return "";
  }

  return getPublicMediaUrl(supabaseAdmin, REVIEW_IMAGE_BUCKET, path);
}

function firstRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function replaceReviewImages(params: {
  reviewId: string;
  reservationId: string;
  userId: string;
  imagePaths: string[];
}) {
  if (!supabaseAdmin) {
    return {
      error: errorResponse(
        503,
        "SERVICE_ROLE_REQUIRED",
        "리뷰 이미지 저장 설정을 확인해 주세요.",
      ),
    };
  }

  const prefix = `${params.userId}/${params.reservationId}/`;
  if (params.imagePaths.some((path) => !path.startsWith(prefix))) {
    return {
      error: errorResponse(
        403,
        "INVALID_REVIEW_IMAGE_PATH",
        "본인 예약에 업로드한 리뷰 사진만 등록할 수 있습니다.",
      ),
    };
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("review_images")
    .select("id,review_id,storage_path,sort_order")
    .eq("review_id", params.reviewId)
    .returns<ReviewImageRow[]>();

  if (existingError) {
    if (
      params.imagePaths.length === 0 &&
      (existingError.code === "42P01" ||
        existingError.code === "PGRST205" ||
        existingError.message.includes("review_images"))
    ) {
      return { images: [] };
    }

    console.error("REVIEW IMAGE LOOKUP ERROR:", existingError);
    return {
      error: errorResponse(
        500,
        "DB_ERROR",
        "기존 리뷰 사진을 확인하지 못했습니다.",
      ),
    };
  }

  const { error: deleteError } = await supabaseAdmin
    .from("review_images")
    .delete()
    .eq("review_id", params.reviewId);

  if (deleteError) {
    console.error("REVIEW IMAGE ROW DELETE ERROR:", deleteError);
    return {
      error: errorResponse(
        500,
        "DB_ERROR",
        "기존 리뷰 사진 정보를 정리하지 못했습니다.",
      ),
    };
  }

  if (params.imagePaths.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from("review_images")
      .insert(
        params.imagePaths.map((path, index) => ({
          review_id: params.reviewId,
          storage_path: path,
          sort_order: index,
        })),
      );

    if (insertError) {
      console.error("REVIEW IMAGE INSERT ERROR:", insertError);
      return {
        error: errorResponse(
          500,
          "DB_ERROR",
          "리뷰 사진 정보를 저장하지 못했습니다.",
        ),
      };
    }
  }

  const nextPaths = new Set(params.imagePaths);
  const removedPaths = (existing ?? [])
    .map((image) => image.storage_path)
    .filter((path) => !nextPaths.has(path));

  if (removedPaths.length > 0) {
    const { error: storageError } = await supabaseAdmin.storage
      .from(REVIEW_IMAGE_BUCKET)
      .remove(removedPaths);

    if (storageError) {
      console.error("REVIEW IMAGE STORAGE CLEANUP ERROR:", storageError);
    }
  }

  return {
    images: params.imagePaths.map((path, index) => ({
      path,
      url: publicReviewImage(path),
      sortOrder: index,
    })),
  };
}

async function getReservation(
  db: SupabaseClient,
  reservationId: string,
  userId: string,
) {
  const { data: reservation, error: reservationError } = await db
    .from("reservations")
    .select("id, status, bay_id")
    .eq("id", reservationId)
    .eq("user_id", userId)
    .maybeSingle<ReservationRow>();

  if (reservationError) {
    console.error("RESERVATION LOOKUP ERROR:", reservationError);
    return { error: errorResponse(500, "DB_ERROR", "예약 조회 중 오류가 발생했습니다.") };
  }

  if (!reservation) {
    return { error: errorResponse(404, "RESERVATION_NOT_FOUND", "예약을 찾을 수 없습니다.") };
  }

  return { reservation };
}

async function getReviewByReservationId(
  db: SupabaseClient,
  reservationId: string,
  userId: string,
) {
  const { data: review, error } = await db
    .from("reviews")
    .select("id, rating, comment")
    .eq("reservation_id", reservationId)
    .eq("user_id", userId)
    .maybeSingle<ReviewRow>();

  if (error) {
    console.error("REVIEW LOOKUP ERROR:", error);
    return { error: errorResponse(500, "DB_ERROR", "기존 리뷰 조회 중 오류가 발생했습니다.") };
  }

  return { review: review ?? null };
}

export async function GET(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  const { auth } = authResult;

  const { searchParams } = new URL(req.url);
  const mine = searchParams.get("mine") === "1";
  const reservationId = searchParams.get("reservationId")?.trim();

  if (mine) {
    const { data, error } = await auth.client
      .from("reviews")
      .select(
        "id,reservation_id,partner_id,rating,comment,created_at,partners(name),review_images(id,review_id,storage_path,sort_order)",
      )
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false })
      .returns<MyReviewRow[]>();

    if (error) {
      console.error("MY REVIEW LOOKUP ERROR:", error);
      return errorResponse(
        500,
        "DB_ERROR",
        "내 리뷰를 불러오지 못했습니다.",
      );
    }

    return NextResponse.json({
      success: true,
      reviews: (data ?? []).map((review) => ({
        id: review.id,
        reservationId: review.reservation_id,
        partnerId: review.partner_id,
        partnerName:
          firstRelation(review.partners)?.name ?? "정비소 정보 없음",
        rating: review.rating,
        comment: review.comment,
        createdAt: review.created_at,
        images: (review.review_images ?? [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((image) => ({
            path: image.storage_path,
            url: publicReviewImage(image.storage_path),
          })),
      })),
    });
  }

  if (!reservationId) {
    return errorResponse(400, "INVALID_INPUT", "reservationId는 필수입니다.");
  }

  const result = await getReviewByReservationId(
    auth.client,
    reservationId,
    auth.userId,
  );
  if ("error" in result) {
    return result.error;
  }

  let reviewImages: Array<{ path: string; url: string }> = [];
  if (result.review && supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from("review_images")
      .select("id,review_id,storage_path,sort_order")
      .eq("review_id", result.review.id)
      .order("sort_order", { ascending: true })
      .returns<ReviewImageRow[]>();

    reviewImages = (data ?? []).map((image) => ({
      path: image.storage_path,
      url: publicReviewImage(image.storage_path),
    }));
  }

  return NextResponse.json({
    success: true,
    review: result.review
      ? {
          ...result.review,
          images: reviewImages,
        }
      : null,
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

  const { auth } = authResult;
  const db = auth.client;

  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "요청 본문(JSON)이 올바르지 않습니다.");
  }

  const body = parsePayload(payload);

  if (!body) {
    return errorResponse(400, "INVALID_INPUT", "reservationId, rating(1~5)은 필수입니다.");
  }

  const { reservationId, rating, comment, imagePaths } = body;

  const reservationResult = await getReservation(
    db,
    reservationId,
    auth.userId,
  );
  if ("error" in reservationResult) {
    return reservationResult.error;
  }

  if (reservationResult.reservation.status !== "COMPLETED") {
    return errorResponse(400, "INVALID_RESERVATION_STATUS", "완료된 예약만 후기 작성이 가능합니다.");
  }

  const { data: bay, error: bayError } = await db
    .from("bays")
    .select("id, partner_id")
    .eq("id", reservationResult.reservation.bay_id)
    .maybeSingle<BayRow>();

  if (bayError) {
    console.error("BAY LOOKUP ERROR:", bayError);
    return errorResponse(500, "DB_ERROR", "베이 조회 중 오류가 발생했습니다.");
  }

  if (!bay) {
    return errorResponse(404, "BAY_NOT_FOUND", "베이를 찾을 수 없습니다.");
  }

  const reviewResult = await getReviewByReservationId(
    db,
    reservationId,
    auth.userId,
  );
  if ("error" in reviewResult) {
    return reviewResult.error;
  }

  if (reviewResult.review) {
    return errorResponse(409, "ALREADY_REVIEWED", "이미 후기를 작성한 예약입니다.");
  }

  const { data: createdReview, error: insertReviewError } = await db
    .from("reviews")
    .insert({
      reservation_id: reservationId,
      partner_id: bay.partner_id,
      user_id: auth.userId,
      rating,
      comment: comment ?? null,
    })
    .select("id, rating, comment")
    .single<ReviewRow>();

  if (insertReviewError) {
    console.error("REVIEW INSERT ERROR:", insertReviewError);

    if (insertReviewError.code === "23505") {
      return errorResponse(409, "ALREADY_REVIEWED", "이미 후기를 작성한 예약입니다.");
    }

    return errorResponse(500, "DB_ERROR", "후기 저장 중 오류가 발생했습니다.");
  }

  const imageResult = await replaceReviewImages({
    reviewId: createdReview.id,
    reservationId,
    userId: auth.userId,
    imagePaths,
  });

  if ("error" in imageResult) {
    await supabaseAdmin
      ?.from("reviews")
      .delete()
      .eq("id", createdReview.id);
    return imageResult.error;
  }

  return NextResponse.json({
    success: true,
    review: {
      ...createdReview,
      images: imageResult.images,
    },
  });
}

export async function PATCH(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  const { auth } = authResult;
  const db = auth.client;

  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "요청 본문(JSON)이 올바르지 않습니다.");
  }

  const body = parsePayload(payload);

  if (!body) {
    return errorResponse(400, "INVALID_INPUT", "reservationId, rating(1~5)은 필수입니다.");
  }

  const { reservationId, rating, comment, imagePaths } = body;
  const reviewResult = await getReviewByReservationId(
    db,
    reservationId,
    auth.userId,
  );

  if ("error" in reviewResult) {
    return reviewResult.error;
  }

  if (!reviewResult.review) {
    return errorResponse(404, "REVIEW_NOT_FOUND", "수정할 리뷰를 찾을 수 없습니다.");
  }

  const { data: updatedReview, error: updateError } = await db
    .from("reviews")
    .update({
      rating,
      comment: comment ?? null,
    })
    .eq("id", reviewResult.review.id)
    .eq("user_id", auth.userId)
    .select("id, rating, comment")
    .single<ReviewRow>();

  if (updateError) {
    console.error("REVIEW UPDATE ERROR:", updateError);
    return errorResponse(500, "DB_ERROR", "리뷰 수정 중 오류가 발생했습니다.");
  }

  const imageResult = await replaceReviewImages({
    reviewId: updatedReview.id,
    reservationId,
    userId: auth.userId,
    imagePaths,
  });

  if ("error" in imageResult) {
    return imageResult.error;
  }

  return NextResponse.json({
    success: true,
    review: {
      ...updatedReview,
      images: imageResult.images,
    },
  });
}

function methodNotAllowed(allow: string) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: `${allow} 메서드만 허용됩니다.`,
      },
    },
    {
      status: 405,
      headers: {
        Allow: allow,
      },
    },
  );
}

export function PUT() {
  return methodNotAllowed("GET, POST, PATCH");
}

export function DELETE() {
  return methodNotAllowed("GET, POST, PATCH");
}

export function OPTIONS() {
  return methodNotAllowed("GET, POST, PATCH");
}
