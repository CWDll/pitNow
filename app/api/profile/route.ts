import { NextResponse } from "next/server";

import { requireRequestUser } from "@/src/lib/auth";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
} from "@/src/lib/supabase";

interface ProfileRow {
  user_id: string;
  nickname: string;
  full_name: string | null;
  phone: string | null;
}

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

function cleanOptionalText(value: unknown, maxLength: number) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    return undefined;
  }

  return normalized;
}

export async function GET(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { data, error } = await authResult.auth.client
    .from("user_profiles")
    .select("user_id,nickname,full_name,phone")
    .eq("user_id", authResult.auth.userId)
    .maybeSingle<ProfileRow>();

  if (error) {
    console.error("PROFILE LOOKUP ERROR:", error);
    return jsonError(
      500,
      "PROFILE_LOOKUP_FAILED",
      "사용자 정보를 불러오지 못했습니다.",
    );
  }

  return NextResponse.json({ success: true, profile: data });
}

export async function PATCH(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);
  if (!authResult.ok) {
    return authResult.response;
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "요청 형식이 올바르지 않습니다.");
  }

  if (!payload || typeof payload !== "object") {
    return jsonError(400, "INVALID_INPUT", "사용자 정보를 확인해 주세요.");
  }

  const record = payload as Record<string, unknown>;
  const nickname =
    typeof record.nickname === "string" ? record.nickname.trim() : "";
  const fullName = cleanOptionalText(record.fullName, 50);
  const phone = cleanOptionalText(record.phone, 20);

  if (nickname.length < 2 || nickname.length > 20) {
    return jsonError(
      400,
      "INVALID_NICKNAME",
      "닉네임은 2자 이상 20자 이하로 입력해 주세요.",
    );
  }

  if (fullName === undefined || phone === undefined) {
    return jsonError(
      400,
      "INVALID_PROFILE",
      "이름과 연락처 입력값을 확인해 주세요.",
    );
  }

  if (phone !== null && phone.length < 8) {
    return jsonError(
      400,
      "INVALID_PHONE",
      "연락처는 8자 이상 입력해 주세요.",
    );
  }

  const { data, error } = await authResult.auth.client
    .from("user_profiles")
    .update({
      nickname,
      full_name: fullName,
      phone,
    })
    .eq("user_id", authResult.auth.userId)
    .select("user_id,nickname,full_name,phone")
    .single<ProfileRow>();

  if (error) {
    console.error("PROFILE UPDATE ERROR:", error);

    if (error.code === "23505") {
      return jsonError(
        409,
        "NICKNAME_ALREADY_USED",
        "이미 사용 중인 닉네임입니다.",
      );
    }

    return jsonError(
      500,
      "PROFILE_UPDATE_FAILED",
      "사용자 정보를 저장하지 못했습니다.",
    );
  }

  return NextResponse.json({ success: true, profile: data });
}
