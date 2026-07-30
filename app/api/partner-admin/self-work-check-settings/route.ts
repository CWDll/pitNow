import { NextResponse } from "next/server";

import { requireRequestUser } from "@/src/lib/auth";
import { hasPartnerAdminMembership } from "@/src/lib/partner-admin";
import { getSelfMaintenanceCatalog } from "@/src/lib/self-maintenance-catalog";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
} from "@/src/lib/supabase";

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

async function authorize(req: Request, partnerId: string) {
  const authResult = await requireRequestUser(req);
  if (!authResult.ok) {
    return authResult;
  }
  const membership = await hasPartnerAdminMembership(
    authResult.auth.client,
    authResult.auth.userId,
    partnerId,
  );
  if (membership.error) {
    return {
      ok: false as const,
      response: jsonError(500, "DB_ERROR", "정비소 권한을 확인하지 못했습니다."),
    };
  }
  if (!membership.allowed) {
    return {
      ok: false as const,
      response: jsonError(403, "PARTNER_ADMIN_FORBIDDEN", "권한이 없습니다."),
    };
  }
  return authResult;
}

export async function GET(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }
  const partnerId = new URL(req.url).searchParams.get("partnerId")?.trim() ?? "";
  if (!partnerId) {
    return jsonError(400, "PARTNER_ID_REQUIRED", "partnerId가 필요합니다.");
  }
  const authResult = await authorize(req, partnerId);
  if (!authResult.ok) {
    return authResult.response;
  }

  try {
    const catalog = await getSelfMaintenanceCatalog({
      db: authResult.auth.client,
      partnerId,
    });
    return NextResponse.json({ success: true, tasks: catalog.tasks });
  } catch (error) {
    console.error("PARTNER WORK CHECK SETTINGS LOOKUP ERROR:", error);
    return jsonError(500, "DB_ERROR", "작업 확인 설정을 불러오지 못했습니다.");
  }
}

export async function PATCH(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as {
    partnerId?: unknown;
    taskId?: unknown;
    isEnabled?: unknown;
  } | null;
  const partnerId =
    typeof body?.partnerId === "string" ? body.partnerId.trim() : "";
  const taskId = typeof body?.taskId === "string" ? body.taskId.trim() : "";
  if (!partnerId || !taskId || typeof body?.isEnabled !== "boolean") {
    return jsonError(400, "INVALID_PAYLOAD", "작업 확인 설정값이 올바르지 않습니다.");
  }
  const authResult = await authorize(req, partnerId);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { error } = await authResult.auth.client
    .from("partner_self_task_check_settings")
    .upsert(
      {
        partner_id: partnerId,
        task_id: taskId,
        is_enabled: body.isEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "partner_id,task_id" },
    );
  if (error) {
    console.error("PARTNER WORK CHECK SETTINGS UPDATE ERROR:", error);
    return jsonError(500, "DB_ERROR", "작업 확인 설정을 저장하지 못했습니다.");
  }
  return NextResponse.json({ success: true });
}
