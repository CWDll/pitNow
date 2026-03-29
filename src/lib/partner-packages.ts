import type { PartnerShopPackage } from "@/src/domain/shop-package";
import { hasSupabaseEnv, supabase } from "@/src/lib/supabase";

interface PartnerPackagePriceRow {
  labor_price: number;
  service_packages:
    | {
        id: string;
        name: string;
        description: string | null;
        duration_minutes: number;
        is_active: boolean;
      }
    | Array<{
        id: string;
        name: string;
        description: string | null;
        duration_minutes: number;
        is_active: boolean;
      }>;
}

function normalizeServicePackage(
  value: PartnerPackagePriceRow["service_packages"],
): {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  is_active: boolean;
} | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export async function getPartnerShopPackages(
  partnerId: string,
): Promise<{ packages: PartnerShopPackage[]; source: "db" | "mock" }> {
  if (!hasSupabaseEnv) {
    return { packages: [], source: "db" };
  }

  const { data, error } = await supabase
    .from("partner_package_prices")
    .select(
      "labor_price, service_packages!inner(id, name, description, duration_minutes, is_active)",
    )
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .returns<PartnerPackagePriceRow[]>();

  if (error) {
    console.error("PARTNER PACKAGE LOOKUP ERROR:", error);
    return { packages: [], source: "db" };
  }

  const packages = (data ?? [])
    .map((row) => {
      const servicePackage = normalizeServicePackage(row.service_packages);

      if (!servicePackage || !servicePackage.is_active) {
        return null;
      }

      return {
        id: servicePackage.id,
        name: servicePackage.name,
        summary: servicePackage.description ?? "상세 설명이 준비 중입니다.",
        durationMinutes: servicePackage.duration_minutes,
        price: Number(row.labor_price) || 0,
      } satisfies PartnerShopPackage;
    })
    .filter((item): item is PartnerShopPackage => Boolean(item));

  return { packages, source: "db" };
}
