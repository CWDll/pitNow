import { supabase } from "@/src/lib/supabase";

export const RESERVATION_PHOTO_BUCKET = "reservation-photos";
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

interface UploadReservationPhotoParams {
  reservationId: string;
  phase: "checkin" | "checkout";
  field: string;
  file: File;
}

function getSafeFileExtension(file: File): string {
  const nameExtension = file.name.split(".").pop()?.toLowerCase();

  if (nameExtension && /^[a-z0-9]+$/.test(nameExtension)) {
    return nameExtension;
  }

  if (file.type === "image/png") {
    return "png";
  }

  if (file.type === "image/webp") {
    return "webp";
  }

  if (file.type === "image/heic") {
    return "heic";
  }

  if (file.type === "image/heif") {
    return "heif";
  }

  return "jpg";
}

function assertValidImageFile(file: File): void {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("jpg/png/webp/heic 형식의 이미지만 업로드할 수 있습니다.");
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error("이미지 파일은 10MB 이하만 업로드할 수 있습니다.");
  }
}

export async function uploadReservationPhoto({
  reservationId,
  phase,
  field,
  file,
}: UploadReservationPhotoParams): Promise<string> {
  assertValidImageFile(file);

  const extension = getSafeFileExtension(file);
  const path = `${phase}/${reservationId}/${field}-${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(RESERVATION_PHOTO_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(error.message || "사진 업로드에 실패했습니다.");
  }

  const { data } = supabase.storage
    .from(RESERVATION_PHOTO_BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}
