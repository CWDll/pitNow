import { NextResponse } from "next/server";

import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";

interface Context {
  params: Promise<{ id: string }>;
}

interface AvailabilityBlockRow {
  bay_id: string | null;
  starts_at: string;
  ends_at: string;
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

export async function GET(request: Request, context: Context) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  if (!supabaseAdmin) {
    return jsonError(
      503,
      "SERVICE_ROLE_REQUIRED",
      "예약 차단 시간 조회에는 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.",
    );
  }

  const { id } = await context.params;
  const partnerId = id.trim();
  const { searchParams } = new URL(request.url);
  const startsBefore = searchParams.get("startsBefore") ?? "";
  const endsAfter = searchParams.get("endsAfter") ?? "";

  if (!partnerId || !startsBefore || !endsAfter) {
    return jsonError(
      400,
      "INVALID_INPUT",
      "partner id, startsBefore, endsAfter 값이 필요합니다.",
    );
  }

  const { data, error } = await supabaseAdmin
    .from("partner_availability_blocks")
    .select("bay_id,starts_at,ends_at")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .lt("starts_at", startsBefore)
    .gt("ends_at", endsAfter)
    .returns<AvailabilityBlockRow[]>();

  if (error) {
    console.error("PUBLIC PARTNER AVAILABILITY BLOCK LOOKUP ERROR:", error);
    return jsonError(
      500,
      "DB_ERROR",
      "예약 차단 시간 조회 중 오류가 발생했습니다.",
    );
  }

  return NextResponse.json({
    success: true,
    blocks: (data ?? []).map((block) => ({
      bayId: block.bay_id,
      startsAt: block.starts_at,
      endsAt: block.ends_at,
    })),
  });
}
