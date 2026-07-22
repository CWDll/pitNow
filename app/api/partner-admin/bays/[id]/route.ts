import { NextResponse } from "next/server";

import { isVehicleType, type VehicleType } from "@/src/domain/vehicle";
import { requireRequestUser } from "@/src/lib/auth";
import {
  BAY_BLOCKING_RESERVATION_STATUSES,
  isBayBlockingReservation,
} from "@/src/lib/bay-reservations";
import { recordPartnerAdminAudit } from "@/src/lib/partner-admin-audit";
import { hasPartnerAdminMembership } from "@/src/lib/partner-admin";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  supabaseAdmin,
} from "@/src/lib/supabase";

interface Context {
  params: Promise<{ id: string }>;
}

interface BayRow {
  id: string;
  partner_id: string;
  name: string;
  is_active: boolean;
  allowed_vehicle_types: VehicleType[];
  max_vehicle_weight_kg: number | null;
}

interface ActiveReservationRow {
  blocked_until: string | null;
  end_time: string;
  id: string;
  start_time: string;
  status: string;
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

interface PatchBody {
  isActive?: boolean;
  allowedVehicleTypes?: VehicleType[];
  maxVehicleWeightKg?: number | null;
}

function parseBody(payload: unknown): PatchBody | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const source = payload as Record<string, unknown>;
  const body: PatchBody = {};

  if ("isActive" in source) {
    if (typeof source.isActive !== "boolean") {
      return null;
    }
    body.isActive = source.isActive;
  }

  if ("allowedVehicleTypes" in source) {
    if (
      !Array.isArray(source.allowedVehicleTypes) ||
      !source.allowedVehicleTypes.every(isVehicleType)
    ) {
      return null;
    }
    body.allowedVehicleTypes = [...new Set(source.allowedVehicleTypes)];
  }

  if ("maxVehicleWeightKg" in source) {
    const value = source.maxVehicleWeightKg;
    if (
      value !== null &&
      (typeof value !== "number" || !Number.isInteger(value) || value <= 0)
    ) {
      return null;
    }
    body.maxVehicleWeightKg = value as number | null;
  }

  if (Object.keys(body).length === 0) {
    return null;
  }

  return body;
}

export async function PATCH(req: Request, context: Context) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  const authResult = await requireRequestUser(req);

  if (!authResult.ok) {
    return authResult.response;
  }

  const { id } = await context.params;
  const bayId = id.trim();

  if (!bayId) {
    return jsonError(400, "INVALID_BAY_ID", "bay id가 필요합니다.");
  }

  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return jsonError(
      400,
      "INVALID_JSON",
      "요청 본문(JSON)이 올바르지 않습니다.",
    );
  }

  const body = parseBody(payload);

  if (!body) {
    return jsonError(
      400,
      "INVALID_INPUT",
      "베이 상태 또는 허용 차종·중량 제한 값을 올바르게 입력해 주세요.",
    );
  }

  const db = supabaseAdmin ?? authResult.auth.client;
  const { data: bay, error: bayError } = await db
    .from("bays")
    .select(
      "id,partner_id,name,is_active,allowed_vehicle_types,max_vehicle_weight_kg",
    )
    .eq("id", bayId)
    .maybeSingle<BayRow>();

  if (bayError) {
    console.error("PARTNER ADMIN BAY DETAIL LOOKUP ERROR:", bayError);
    return jsonError(500, "DB_ERROR", "베이 조회 중 오류가 발생했습니다.");
  }

  if (!bay) {
    return jsonError(404, "BAY_NOT_FOUND", "베이를 찾을 수 없습니다.");
  }

  const membership = await hasPartnerAdminMembership(
    authResult.auth.client,
    authResult.auth.userId,
    bay.partner_id,
  );

  if (membership.error) {
    console.error(
      "PARTNER ADMIN BAY UPDATE MEMBERSHIP ERROR:",
      membership.error,
    );
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
      "이 베이에 대한 관리자 권한이 없습니다.",
    );
  }

  if (bay.is_active && body.isActive === false) {
    const { data: activeReservations, error: activeReservationError } = await db
      .from("reservations")
      .select("id,status,start_time,end_time,blocked_until")
      .eq("bay_id", bay.id)
      .in("status", BAY_BLOCKING_RESERVATION_STATUSES)
      .returns<ActiveReservationRow[]>();

    if (activeReservationError) {
      console.error(
        "PARTNER ADMIN BAY ACTIVE RESERVATION LOOKUP ERROR:",
        activeReservationError,
      );
      return jsonError(
        500,
        "DB_ERROR",
        "베이 예약 상태 확인 중 오류가 발생했습니다.",
      );
    }

    const now = new Date();
    const hasBlockingReservation = (activeReservations ?? []).some(
      (reservation) =>
        isBayBlockingReservation({
          blockedUntil: reservation.blocked_until,
          now,
          status: reservation.status,
        }),
    );

    if (hasBlockingReservation) {
      return jsonError(
        409,
        "BAY_HAS_ACTIVE_RESERVATION",
        "확정/이용 중인 예약이 있는 베이는 비활성화할 수 없습니다.",
      );
    }
  }

  const updates: Record<string, unknown> = {};

  if (body.isActive !== undefined) {
    updates.is_active = body.isActive;
  }
  if (body.allowedVehicleTypes !== undefined) {
    updates.allowed_vehicle_types = body.allowedVehicleTypes;
  }
  if (body.maxVehicleWeightKg !== undefined) {
    updates.max_vehicle_weight_kg = body.maxVehicleWeightKg;
  }

  const { data: updatedBay, error: updateError } = await db
    .from("bays")
    .update(updates)
    .eq("id", bay.id)
    .select(
      "id,partner_id,name,is_active,allowed_vehicle_types,max_vehicle_weight_kg",
    )
    .maybeSingle<BayRow>();

  if (updateError || !updatedBay) {
    console.error("PARTNER ADMIN BAY UPDATE ERROR:", updateError);
    return jsonError(500, "DB_ERROR", "베이 상태 변경 중 오류가 발생했습니다.");
  }

  await recordPartnerAdminAudit({
    db,
    partnerId: updatedBay.partner_id,
    actorUserId: authResult.auth.userId,
    action:
      body.allowedVehicleTypes !== undefined ||
      body.maxVehicleWeightKg !== undefined
        ? "BAY_COMPATIBILITY_UPDATED"
        : "BAY_ACTIVE_UPDATED",
    targetType: "BAY",
    targetId: updatedBay.id,
    beforeState: {
      isActive: bay.is_active,
      allowedVehicleTypes: bay.allowed_vehicle_types ?? [],
      maxVehicleWeightKg: bay.max_vehicle_weight_kg,
    },
    afterState: {
      isActive: updatedBay.is_active,
      allowedVehicleTypes: updatedBay.allowed_vehicle_types ?? [],
      maxVehicleWeightKg: updatedBay.max_vehicle_weight_kg,
    },
    metadata: {
      bayName: updatedBay.name,
    },
  });

  const { data: activeReservations, error: activeReservationCountError } =
    await db
      .from("reservations")
      .select("id,status,start_time,end_time,blocked_until")
      .eq("bay_id", updatedBay.id)
      .in("status", BAY_BLOCKING_RESERVATION_STATUSES)
      .returns<ActiveReservationRow[]>();

  if (activeReservationCountError) {
    console.error(
      "PARTNER ADMIN BAY RESERVATION COUNT ERROR:",
      activeReservationCountError,
    );
    return jsonError(
      500,
      "DB_ERROR",
      "베이 예약 상태 조회 중 오류가 발생했습니다.",
    );
  }

  const now = new Date();
  const blockingReservations = (activeReservations ?? []).filter(
    (reservation) =>
      isBayBlockingReservation({
        blockedUntil: reservation.blocked_until,
        now,
        status: reservation.status,
      }),
  );
  const activeReservationCount = blockingReservations.length;

  return NextResponse.json({
    success: true,
    bay: {
      activeReservationCount,
      blockingReservations: blockingReservations.map((reservation) => ({
        id: reservation.id,
        startTime: reservation.start_time,
        endTime: reservation.end_time,
        status: reservation.status,
      })),
      canDeactivate: activeReservationCount === 0,
      id: updatedBay.id,
      partnerId: updatedBay.partner_id,
      name: updatedBay.name,
      isActive: updatedBay.is_active,
      allowedVehicleTypes: updatedBay.allowed_vehicle_types ?? [],
      maxVehicleWeightKg: updatedBay.max_vehicle_weight_kg,
    },
  });
}
