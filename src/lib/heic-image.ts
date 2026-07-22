const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);

export function looksLikeHeic(value: { name?: string; type?: string }): boolean {
  const name = value.name?.toLowerCase().split(/[?#]/, 1)[0] ?? "";
  return (
    HEIC_MIME_TYPES.has(value.type?.toLowerCase() ?? "") ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

export async function convertHeicBlobToJpeg(blob: Blob): Promise<Blob> {
  const { heicTo } = await import("heic-to");
  return heicTo({ blob, type: "image/jpeg", quality: 0.9 });
}

export async function normalizeReservationImage(file: File): Promise<File> {
  if (!looksLikeHeic(file)) {
    return file;
  }

  const converted = await convertHeicBlobToJpeg(file);
  const baseName = file.name.replace(/\.(heic|heif)$/i, "") || "reservation-photo";

  return new File([converted], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
