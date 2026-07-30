import { NextResponse } from "next/server";

import { getSelfMaintenanceCatalog } from "@/src/lib/self-maintenance-catalog";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  supabase,
} from "@/src/lib/supabase";

export async function GET(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const partnerId = new URL(req.url).searchParams.get("partnerId")?.trim();

  if (!partnerId) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_PARTNER_ID",
          message: "partnerId가 필요합니다.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const catalog = await getSelfMaintenanceCatalog({
      db: supabase,
      partnerId,
    });

    return NextResponse.json({
      success: true,
      catalog,
    });
  } catch (error) {
    console.error("SELF MAINTENANCE CATALOG ERROR:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "DB_ERROR",
          message: "SELF 작업 정보를 불러오지 못했습니다.",
        },
      },
      { status: 500 },
    );
  }
}
