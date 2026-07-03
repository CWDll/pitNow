import { NextResponse } from "next/server";

import { requireRequestUser } from "@/src/lib/auth";
import { hasPartnerAdminMembership } from "@/src/lib/partner-admin";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  supabase,
} from "@/src/lib/supabase";

interface PartnerPackagePriceRow {
  id: string;
  labor_price: number | string;
  is_active: boolean;
  service_packages:
    | {
        id: string;
        code: string;
        name: string;
        description: string | null;
        duration_minutes: number;
        is_active: boolean;
      }
    | Array<{
        id: string;
        code: string;
        name: string;
        description: string | null;
        duration_minutes: number;
        is_active: boolean;
      }>
    | null;
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

function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  const { searchParams } = new URL(req.url);
  const partnerId = searchParams.get("partnerId")?.trim();

  if (!partnerId) {
    return jsonError(400, "INVALID_INPUT", "partnerId는 필수입니다.");
  }

  const membership = await hasPartnerAdminMembership(
    authResult.auth.client,
    authResult.auth.userId,
    partnerId,
  );

  if (membership.error) {
    console.error("PARTNER ADMIN PACKAGE MEMBERSHIP ERROR:", membership.error);
    return jsonError(
      500,
      "DB_ERROR",
      "정비소 관리자 권한 확인 중 오류가 발생했습니다.",
    );
  }

  if (!membership.allowed) {
    return jsonError(
      403,
      "PARTNER_ADMIN_FORBIDDEN",
      "이 정비소에 대한 관리자 권한이 없습니다.",
    );
  }

  const { data, error } = await supabase
    .from("partner_package_prices")
    .select(
      "id, labor_price, is_active, service_packages!inner(id, code, name, description, duration_minutes, is_active)",
    )
    .eq("partner_id", partnerId)
    .order("is_active", { ascending: false })
    .returns<PartnerPackagePriceRow[]>();

  if (error) {
    console.error("PARTNER ADMIN PACKAGE LOOKUP ERROR:", error);
    return jsonError(
      500,
      "DB_ERROR",
      "업장 패키지 목록 조회 중 오류가 발생했습니다.",
    );
  }

  return NextResponse.json({
    success: true,
    packages: (data ?? []).map((row) => {
      const servicePackage = firstOrSelf(row.service_packages);
      const catalogActive = Boolean(servicePackage?.is_active);

      return {
        id: row.id,
        packageId: servicePackage?.id ?? "",
        code: servicePackage?.code ?? "",
        name: servicePackage?.name ?? "Unknown package",
        description: servicePackage?.description ?? "",
        durationMinutes: servicePackage?.duration_minutes ?? 0,
        laborPrice: toNumber(row.labor_price),
        isActive: Boolean(row.is_active) && catalogActive,
        priceActive: Boolean(row.is_active),
        catalogActive,
      };
    }),
  });
}
