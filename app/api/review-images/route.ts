import { NextResponse } from "next/server";

import { requireRequestUser } from "@/src/lib/auth";
import {
  assertPublicImage,
  getPublicMediaUrl,
  imageExtension,
  REVIEW_IMAGE_BUCKET,
} from "@/src/lib/public-media";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";

interface ReservationRow {
  id: string;
  status: string;
}

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

async function requireCompletedReservation(
  userId: string,
  reservationId: string,
) {
  if (!supabaseAdmin) {
    return {
      error: jsonError(
        503,
        "SERVICE_ROLE_REQUIRED",
        "이미지 업로드 설정을 확인해 주세요.",
      ),
    };
  }

  const { data, error } = await supabaseAdmin
    .from("reservations")
    .select("id,status")
    .eq("id", reservationId)
    .eq("user_id", userId)
    .maybeSingle<ReservationRow>();

  if (error) {
    console.error("REVIEW IMAGE RESERVATION LOOKUP ERROR:", error);
    return {
      error: jsonError(
        500,
        "DB_ERROR",
        "완료 예약을 확인하지 못했습니다.",
      ),
    };
  }

  if (!data || data.status !== "COMPLETED") {
    return {
      error: jsonError(
        403,
        "COMPLETED_RESERVATION_REQUIRED",
        "완료된 본인 예약의 리뷰 사진만 업로드할 수 있습니다.",
      ),
    };
  }

  return { reservation: data };
}

export async function POST(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);
  if (!authResult.ok) {
    return authResult.response;
  }

  const formData = await req.formData();
  const reservationId = String(formData.get("reservationId") ?? "").trim();
  const file = formData.get("file");

  if (!reservationId || !(file instanceof File)) {
    return jsonError(
      400,
      "INVALID_INPUT",
      "예약과 이미지 파일을 확인해 주세요.",
    );
  }

  const validationMessage = assertPublicImage(file);
  if (validationMessage) {
    return jsonError(400, "INVALID_IMAGE", validationMessage);
  }

  const reservationResult = await requireCompletedReservation(
    authResult.auth.userId,
    reservationId,
  );
  if ("error" in reservationResult) {
    return reservationResult.error;
  }

  const folder = `${authResult.auth.userId}/${reservationId}`;
  const { data: existingFiles, error: listError } = await supabaseAdmin!.storage
    .from(REVIEW_IMAGE_BUCKET)
    .list(folder, { limit: 10 });

  if (listError) {
    console.error("REVIEW IMAGE LIST ERROR:", listError);
    return jsonError(500, "STORAGE_ERROR", "리뷰 사진을 확인하지 못했습니다.");
  }

  if ((existingFiles ?? []).length >= 4) {
    return jsonError(
      409,
      "REVIEW_IMAGE_LIMIT",
      "리뷰 사진은 최대 4장까지 등록할 수 있습니다.",
    );
  }

  const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${imageExtension(file)}`;
  const { error: uploadError } = await supabaseAdmin!.storage
    .from(REVIEW_IMAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("REVIEW IMAGE UPLOAD ERROR:", uploadError);
    return jsonError(500, "STORAGE_ERROR", "리뷰 사진을 업로드하지 못했습니다.");
  }

  return NextResponse.json({
    success: true,
    image: {
      path,
      url: getPublicMediaUrl(supabaseAdmin!, REVIEW_IMAGE_BUCKET, path),
    },
  });
}

export async function DELETE(req: Request) {
  if (!hasSupabaseEnv || !supabaseAdmin) {
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

  const path =
    payload && typeof payload === "object" && "path" in payload
      ? String((payload as { path?: unknown }).path ?? "").trim()
      : "";
  const ownerPrefix = `${authResult.auth.userId}/`;

  if (!path || !path.startsWith(ownerPrefix)) {
    return jsonError(403, "IMAGE_ACCESS_DENIED", "삭제할 수 없는 이미지입니다.");
  }

  const { error } = await supabaseAdmin.storage
    .from(REVIEW_IMAGE_BUCKET)
    .remove([path]);

  if (error) {
    console.error("REVIEW IMAGE DELETE ERROR:", error);
    return jsonError(500, "STORAGE_ERROR", "리뷰 사진을 삭제하지 못했습니다.");
  }

  const { error: rowDeleteError } = await supabaseAdmin
    .from("review_images")
    .delete()
    .eq("storage_path", path);

  if (rowDeleteError) {
    console.error("REVIEW IMAGE ROW DELETE ERROR:", rowDeleteError);
    return jsonError(
      500,
      "DB_ERROR",
      "리뷰 사진 정보를 정리하지 못했습니다.",
    );
  }

  return NextResponse.json({ success: true });
}
