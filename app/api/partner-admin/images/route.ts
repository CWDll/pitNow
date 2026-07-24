import { NextResponse } from "next/server";

import { requireRequestUser } from "@/src/lib/auth";
import { recordPartnerAdminAudit } from "@/src/lib/partner-admin-audit";
import { hasPartnerAdminMembership } from "@/src/lib/partner-admin";
import {
  assertPublicImage,
  getPublicMediaUrl,
  imageExtension,
  PARTNER_IMAGE_BUCKET,
} from "@/src/lib/public-media";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";

interface PartnerImageRow {
  id: string;
  partner_id: string;
  storage_path: string;
  sort_order: number;
  is_cover: boolean;
  created_at: string;
}

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

async function requirePartnerAccess(
  userId: string,
  partnerId: string,
) {
  if (!supabaseAdmin) {
    return {
      error: jsonError(
        503,
        "SERVICE_ROLE_REQUIRED",
        "정비소 이미지 관리 설정을 확인해 주세요.",
      ),
    };
  }

  const membership = await hasPartnerAdminMembership(
    supabaseAdmin,
    userId,
    partnerId,
  );

  if (membership.error) {
    console.error("PARTNER IMAGE MEMBERSHIP ERROR:", membership.error);
    return {
      error: jsonError(
        500,
        "MEMBERSHIP_LOOKUP_FAILED",
        "정비소 권한을 확인하지 못했습니다.",
      ),
    };
  }

  if (!membership.allowed) {
    return {
      error: jsonError(
        403,
        "PARTNER_ACCESS_DENIED",
        "이 정비소의 사진을 관리할 권한이 없습니다.",
      ),
    };
  }

  return { allowed: true };
}

function toImage(row: PartnerImageRow) {
  return {
    id: row.id,
    partnerId: row.partner_id,
    path: row.storage_path,
    url: getPublicMediaUrl(
      supabaseAdmin!,
      PARTNER_IMAGE_BUCKET,
      row.storage_path,
    ),
    sortOrder: row.sort_order,
    isCover: row.is_cover,
    createdAt: row.created_at,
  };
}

export async function GET(req: Request) {
  if (!hasSupabaseEnv || !supabaseAdmin) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);
  if (!authResult.ok) {
    return authResult.response;
  }

  const partnerId = new URL(req.url).searchParams.get("partnerId")?.trim() ?? "";
  if (!partnerId) {
    return jsonError(400, "PARTNER_ID_REQUIRED", "정비소를 선택해 주세요.");
  }

  const access = await requirePartnerAccess(authResult.auth.userId, partnerId);
  if ("error" in access) {
    return access.error;
  }

  const { data, error } = await supabaseAdmin
    .from("partner_images")
    .select("id,partner_id,storage_path,sort_order,is_cover,created_at")
    .eq("partner_id", partnerId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<PartnerImageRow[]>();

  if (error) {
    console.error("PARTNER IMAGE LIST ERROR:", error);
    return jsonError(
      500,
      "PARTNER_IMAGE_LIST_FAILED",
      "정비소 사진을 불러오지 못했습니다.",
    );
  }

  return NextResponse.json({
    success: true,
    images: (data ?? []).map(toImage),
  });
}

export async function POST(req: Request) {
  if (!hasSupabaseEnv || !supabaseAdmin) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);
  if (!authResult.ok) {
    return authResult.response;
  }

  const formData = await req.formData();
  const partnerId = String(formData.get("partnerId") ?? "").trim();
  const file = formData.get("file");

  if (!partnerId || !(file instanceof File)) {
    return jsonError(
      400,
      "INVALID_INPUT",
      "정비소와 이미지 파일을 확인해 주세요.",
    );
  }

  const access = await requirePartnerAccess(authResult.auth.userId, partnerId);
  if ("error" in access) {
    return access.error;
  }

  const validationMessage = assertPublicImage(file);
  if (validationMessage) {
    return jsonError(400, "INVALID_IMAGE", validationMessage);
  }

  const { data: currentImages, error: countError } = await supabaseAdmin
    .from("partner_images")
    .select("id,sort_order,is_cover")
    .eq("partner_id", partnerId)
    .order("sort_order", { ascending: false })
    .returns<Array<{ id: string; sort_order: number; is_cover: boolean }>>();

  if (countError) {
    console.error("PARTNER IMAGE COUNT ERROR:", countError);
    return jsonError(500, "DB_ERROR", "정비소 사진을 확인하지 못했습니다.");
  }

  if ((currentImages ?? []).length >= 8) {
    return jsonError(
      409,
      "PARTNER_IMAGE_LIMIT",
      "정비소 사진은 최대 8장까지 등록할 수 있습니다.",
    );
  }

  const path = `${partnerId}/${Date.now()}-${crypto.randomUUID()}.${imageExtension(file)}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(PARTNER_IMAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("PARTNER IMAGE UPLOAD ERROR:", uploadError);
    return jsonError(
      500,
      "STORAGE_ERROR",
      "정비소 사진을 업로드하지 못했습니다.",
    );
  }

  const isFirst = (currentImages ?? []).length === 0;
  const nextOrder =
    (currentImages ?? []).reduce(
      (max, image) => Math.max(max, image.sort_order),
      -1,
    ) + 1;
  const { data: created, error: insertError } = await supabaseAdmin
    .from("partner_images")
    .insert({
      partner_id: partnerId,
      storage_path: path,
      sort_order: nextOrder,
      is_cover: isFirst,
      created_by: authResult.auth.userId,
    })
    .select("id,partner_id,storage_path,sort_order,is_cover,created_at")
    .single<PartnerImageRow>();

  if (insertError || !created) {
    await supabaseAdmin.storage.from(PARTNER_IMAGE_BUCKET).remove([path]);
    console.error("PARTNER IMAGE INSERT ERROR:", insertError);
    return jsonError(
      500,
      "DB_ERROR",
      "정비소 사진 정보를 저장하지 못했습니다.",
    );
  }

  await recordPartnerAdminAudit({
    db: supabaseAdmin,
    partnerId,
    actorUserId: authResult.auth.userId,
    action: "PARTNER_IMAGE_CREATED",
    targetType: "PARTNER_IMAGE",
    targetId: created.id,
    afterState: {
      storagePath: created.storage_path,
      isCover: created.is_cover,
      sortOrder: created.sort_order,
    },
  });

  return NextResponse.json({ success: true, image: toImage(created) });
}

export async function PATCH(req: Request) {
  if (!hasSupabaseEnv || !supabaseAdmin) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);
  if (!authResult.ok) {
    return authResult.response;
  }

  let payload: { partnerId?: unknown; imageId?: unknown };
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    return jsonError(400, "INVALID_JSON", "요청 형식이 올바르지 않습니다.");
  }
  const partnerId = String(payload.partnerId ?? "").trim();
  const imageId = String(payload.imageId ?? "").trim();

  if (!partnerId || !imageId) {
    return jsonError(400, "INVALID_INPUT", "대표 사진을 확인해 주세요.");
  }

  const access = await requirePartnerAccess(authResult.auth.userId, partnerId);
  if ("error" in access) {
    return access.error;
  }

  const { data: target, error: targetError } = await supabaseAdmin
    .from("partner_images")
    .select("id,partner_id,storage_path,sort_order,is_cover,created_at")
    .eq("id", imageId)
    .eq("partner_id", partnerId)
    .maybeSingle<PartnerImageRow>();

  if (targetError || !target) {
    return jsonError(404, "IMAGE_NOT_FOUND", "정비소 사진을 찾지 못했습니다.");
  }

  if (!target.is_cover) {
    const { error: clearError } = await supabaseAdmin
      .from("partner_images")
      .update({ is_cover: false })
      .eq("partner_id", partnerId)
      .eq("is_cover", true);

    if (clearError) {
      return jsonError(500, "DB_ERROR", "기존 대표 사진을 변경하지 못했습니다.");
    }

    const { error: coverError } = await supabaseAdmin
      .from("partner_images")
      .update({ is_cover: true })
      .eq("id", imageId)
      .eq("partner_id", partnerId);

    if (coverError) {
      return jsonError(500, "DB_ERROR", "대표 사진을 지정하지 못했습니다.");
    }
  }

  await recordPartnerAdminAudit({
    db: supabaseAdmin,
    partnerId,
    actorUserId: authResult.auth.userId,
    action: "PARTNER_IMAGE_COVER_UPDATED",
    targetType: "PARTNER_IMAGE",
    targetId: imageId,
    beforeState: { isCover: target.is_cover },
    afterState: { isCover: true },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  if (!hasSupabaseEnv || !supabaseAdmin) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);
  if (!authResult.ok) {
    return authResult.response;
  }

  let payload: { partnerId?: unknown; imageId?: unknown };
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    return jsonError(400, "INVALID_JSON", "요청 형식이 올바르지 않습니다.");
  }
  const partnerId = String(payload.partnerId ?? "").trim();
  const imageId = String(payload.imageId ?? "").trim();

  if (!partnerId || !imageId) {
    return jsonError(400, "INVALID_INPUT", "삭제할 사진을 확인해 주세요.");
  }

  const access = await requirePartnerAccess(authResult.auth.userId, partnerId);
  if ("error" in access) {
    return access.error;
  }

  const { data: target, error: targetError } = await supabaseAdmin
    .from("partner_images")
    .select("id,partner_id,storage_path,sort_order,is_cover,created_at")
    .eq("id", imageId)
    .eq("partner_id", partnerId)
    .maybeSingle<PartnerImageRow>();

  if (targetError || !target) {
    return jsonError(404, "IMAGE_NOT_FOUND", "정비소 사진을 찾지 못했습니다.");
  }

  const { error: removeError } = await supabaseAdmin.storage
    .from(PARTNER_IMAGE_BUCKET)
    .remove([target.storage_path]);

  if (removeError) {
    console.error("PARTNER IMAGE STORAGE DELETE ERROR:", removeError);
    return jsonError(500, "STORAGE_ERROR", "정비소 사진 파일을 삭제하지 못했습니다.");
  }

  const { error: deleteError } = await supabaseAdmin
    .from("partner_images")
    .delete()
    .eq("id", imageId)
    .eq("partner_id", partnerId);

  if (deleteError) {
    return jsonError(500, "DB_ERROR", "정비소 사진 정보를 삭제하지 못했습니다.");
  }

  if (target.is_cover) {
    const { data: nextCover } = await supabaseAdmin
      .from("partner_images")
      .select("id")
      .eq("partner_id", partnerId)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (nextCover) {
      await supabaseAdmin
        .from("partner_images")
        .update({ is_cover: true })
        .eq("id", nextCover.id);
    }
  }

  await recordPartnerAdminAudit({
    db: supabaseAdmin,
    partnerId,
    actorUserId: authResult.auth.userId,
    action: "PARTNER_IMAGE_DELETED",
    targetType: "PARTNER_IMAGE",
    targetId: imageId,
    beforeState: {
      storagePath: target.storage_path,
      isCover: target.is_cover,
      sortOrder: target.sort_order,
    },
  });

  return NextResponse.json({ success: true });
}
