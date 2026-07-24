import { getPublicMediaUrl, PARTNER_IMAGE_BUCKET } from "./public-media";
import { hasSupabaseEnv, supabase } from "./supabase";

interface PartnerImageRow {
  id: string;
  partner_id: string;
  storage_path: string;
  sort_order: number;
  is_cover: boolean;
}

export interface PublicPartnerImage {
  id: string;
  partnerId: string;
  path: string;
  url: string;
  sortOrder: number;
  isCover: boolean;
}

export async function getPartnerImages(
  partnerId?: string,
): Promise<PublicPartnerImage[]> {
  if (!hasSupabaseEnv) {
    return [];
  }

  let query = supabase
    .from("partner_images")
    .select("id,partner_id,storage_path,sort_order,is_cover")
    .order("sort_order", { ascending: true });

  if (partnerId) {
    query = query.eq("partner_id", partnerId);
  }

  const { data, error } = await query.returns<PartnerImageRow[]>();

  if (error) {
    if (
      error.code !== "42P01" &&
      error.code !== "PGRST205" &&
      !error.message.includes("partner_images")
    ) {
      console.error("PUBLIC PARTNER IMAGE LOOKUP ERROR:", error);
    }
    return [];
  }

  return (data ?? []).map((image) => ({
    id: image.id,
    partnerId: image.partner_id,
    path: image.storage_path,
    url: getPublicMediaUrl(supabase, PARTNER_IMAGE_BUCKET, image.storage_path),
    sortOrder: image.sort_order,
    isCover: image.is_cover,
  }));
}
