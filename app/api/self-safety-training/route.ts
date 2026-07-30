import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireRequestUser } from "@/src/lib/auth";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
} from "@/src/lib/supabase";

interface CommonContentRow {
  id: string;
  code: string;
  title: string;
  body: string;
  content_type: "CARD" | "VIDEO";
  media_url: string | null;
  version: number;
}

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

async function getRequiredCommonContents(db: SupabaseClient) {
  return db
    .from("self_safety_contents")
    .select("id,code,title,body,content_type,media_url,version")
    .eq("scope", "COMMON")
    .eq("is_active", true)
    .eq("is_required", true)
    .order("sort_order")
    .returns<CommonContentRow[]>();
}

export async function GET(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);
  if (!authResult.ok) {
    return authResult.response;
  }

  const db = authResult.auth.client;
  const contentsResult = await getRequiredCommonContents(db);

  if (contentsResult.error) {
    console.error("COMMON SAFETY CONTENT ERROR:", contentsResult.error);
    return jsonError(500, "DB_ERROR", "공통 안전교육을 불러오지 못했습니다.");
  }

  const contents = contentsResult.data ?? [];
  const contentIds = contents.map((content) => content.id);
  const completionsResult =
    contentIds.length === 0
      ? { data: [], error: null }
      : await db
          .from("user_safety_training_completions")
          .select("content_id,content_version")
          .eq("user_id", authResult.auth.userId)
          .in("content_id", contentIds);

  if (completionsResult.error) {
    console.error("COMMON SAFETY COMPLETION ERROR:", completionsResult.error);
    return jsonError(500, "DB_ERROR", "안전교육 완료 여부를 확인하지 못했습니다.");
  }

  const completionKeys = new Set(
    (completionsResult.data ?? []).map(
      (row) => `${row.content_id}:${row.content_version}`,
    ),
  );

  return NextResponse.json({
    success: true,
    completed:
      contents.length > 0 &&
      contents.every((content) =>
        completionKeys.has(`${content.id}:${content.version}`),
      ),
    contents: contents.map((content) => ({
      id: content.id,
      code: content.code,
      title: content.title,
      body: content.body,
      contentType: content.content_type,
      mediaUrl: content.media_url,
      version: content.version,
      completed: completionKeys.has(`${content.id}:${content.version}`),
    })),
  });
}

export async function POST(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);
  if (!authResult.ok) {
    return authResult.response;
  }

  const db = authResult.auth.client;
  const contentsResult = await getRequiredCommonContents(db);

  if (contentsResult.error) {
    console.error("COMMON SAFETY CONTENT ERROR:", contentsResult.error);
    return jsonError(500, "DB_ERROR", "공통 안전교육을 불러오지 못했습니다.");
  }

  const rows = (contentsResult.data ?? []).map((content) => ({
    user_id: authResult.auth.userId,
    content_id: content.id,
    content_version: content.version,
    completed_at: new Date().toISOString(),
  }));

  if (rows.length === 0) {
    return jsonError(
      409,
      "SAFETY_CONTENT_NOT_READY",
      "완료할 공통 안전교육이 없습니다.",
    );
  }

  const { error } = await db
    .from("user_safety_training_completions")
    .upsert(rows, {
      onConflict: "user_id,content_id,content_version",
    });

  if (error) {
    console.error("COMMON SAFETY COMPLETION INSERT ERROR:", error);
    return jsonError(500, "DB_ERROR", "안전교육 완료 기록을 저장하지 못했습니다.");
  }

  return NextResponse.json({ success: true, completed: true });
}
