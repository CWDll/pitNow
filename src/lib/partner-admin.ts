import type { SupabaseClient } from "@supabase/supabase-js";

export interface PartnerAdminMembership {
  partnerId: string;
  partnerName: string;
  role: "OWNER" | "STAFF";
}

interface PartnerAdminRow {
  partner_id: string;
  role: "OWNER" | "STAFF";
  partners:
    | {
        name: string;
      }
    | Array<{
        name: string;
      }>
    | null;
}

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export async function getPartnerAdminMemberships(
  db: SupabaseClient,
  userId: string,
): Promise<{
  data: PartnerAdminMembership[];
  error: unknown;
}> {
  const { data, error } = await db
    .from("partner_admins")
    .select("partner_id,role,partners(name)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .returns<PartnerAdminRow[]>();

  if (error) {
    return {
      data: [],
      error,
    };
  }

  return {
    data: (data ?? []).map((row) => ({
      partnerId: row.partner_id,
      partnerName:
        firstRelation(row.partners)?.name ?? "이름 없는 정비소",
      role: row.role,
    })),
    error: null,
  };
}

export async function hasPartnerAdminMembership(
  db: SupabaseClient,
  userId: string,
  partnerId: string,
): Promise<{
  allowed: boolean;
  error: unknown;
}> {
  const { data, error } = await db
    .from("partner_admins")
    .select("user_id")
    .eq("user_id", userId)
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return {
      allowed: false,
      error,
    };
  }

  return {
    allowed: Boolean(data),
    error: null,
  };
}
