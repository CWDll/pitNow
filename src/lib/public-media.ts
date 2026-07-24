import type { SupabaseClient } from "@supabase/supabase-js";

export const PARTNER_IMAGE_BUCKET = "partner-images";
export const REVIEW_IMAGE_BUCKET = "review-images";
export const MAX_PUBLIC_IMAGE_BYTES = 8 * 1024 * 1024;
export const ALLOWED_PUBLIC_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function assertPublicImage(file: File): string | null {
  if (!ALLOWED_PUBLIC_IMAGE_TYPES.has(file.type)) {
    return "jpg, png, webp 형식의 이미지만 업로드할 수 있습니다.";
  }

  if (file.size > MAX_PUBLIC_IMAGE_BYTES) {
    return "이미지는 한 장당 8MB 이하만 업로드할 수 있습니다.";
  }

  return null;
}

export function imageExtension(file: File): string {
  if (file.type === "image/png") {
    return "png";
  }

  if (file.type === "image/webp") {
    return "webp";
  }

  return "jpg";
}

export function getPublicMediaUrl(
  db: SupabaseClient,
  bucket: string,
  path: string,
): string {
  return db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
