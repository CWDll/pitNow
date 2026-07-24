import {
  getPublicMediaUrl,
  REVIEW_IMAGE_BUCKET,
} from "./public-media";
import { hasSupabaseEnv, supabase, supabaseAdmin } from "./supabase";

interface ReviewRow {
  id: string;
  partner_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  review_images: Array<{
    storage_path: string;
    sort_order: number;
  }> | null;
}

interface LegacyReviewRow {
  id: string;
  partner_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

interface ProfileRow {
  user_id: string;
  nickname: string;
}

export interface PublicReview {
  id: string;
  partnerId: string;
  authorId: string;
  nickname: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  imageUrls: string[];
}

function fallbackNickname(userId: string): string {
  return `PitNow 드라이버 ${userId.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

export async function getPublicReviews(
  partnerId: string,
): Promise<PublicReview[]> {
  if (!hasSupabaseEnv) {
    return [];
  }

  const { data: reviewData, error } = await supabase
    .from("reviews")
    .select(
      "id,partner_id,user_id,rating,comment,created_at,review_images(storage_path,sort_order)",
    )
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .returns<ReviewRow[]>();

  let data: ReviewRow[] = reviewData ?? [];

  if (error) {
    const missingImageRelation =
      error.code === "PGRST200" &&
      (error.message.includes("review_images") ||
        error.details?.includes("review_images"));

    if (!missingImageRelation) {
      console.error("PUBLIC REVIEW LOOKUP ERROR:", error);
      return [];
    }

    const { data: legacyData, error: legacyError } = await supabase
      .from("reviews")
      .select("id,partner_id,user_id,rating,comment,created_at")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .returns<LegacyReviewRow[]>();

    if (legacyError) {
      console.error("PUBLIC LEGACY REVIEW LOOKUP ERROR:", legacyError);
      return [];
    }

    data = (legacyData ?? []).map((review) => ({
      ...review,
      review_images: [],
    }));
  }

  const userIds = [...new Set(data.map((review) => review.user_id))];
  const nicknames = new Map<string, string>();

  if (supabaseAdmin && userIds.length > 0) {
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id,nickname")
      .in("user_id", userIds)
      .returns<ProfileRow[]>();

    if (!profileError) {
      for (const profile of profiles ?? []) {
        nicknames.set(profile.user_id, profile.nickname);
      }
    }
  }

  return data.map((review) => ({
    id: review.id,
    partnerId: review.partner_id,
    authorId: review.user_id,
    nickname: nicknames.get(review.user_id) ?? fallbackNickname(review.user_id),
    rating: review.rating,
    comment: review.comment,
    createdAt: review.created_at,
    imageUrls: [...(review.review_images ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((image) =>
        getPublicMediaUrl(
          supabase,
          REVIEW_IMAGE_BUCKET,
          image.storage_path,
        ),
      ),
  }));
}
