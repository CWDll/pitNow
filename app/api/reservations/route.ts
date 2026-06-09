import type { PostgrestError } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import type { ReservationType } from "@/src/domain/types";
import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  supabase,
} from "@/src/lib/supabase";

const MOCK_USER_ID = "00000000-0000-0000-0000-000000000001";
const HELPER_VERIFY_BASE_FEE = 5000;

type ConsentMethod = "CHECKBOX" | "SIGNATURE";

interface ReservationRequestBody {
  reservationType: ReservationType;
  bayId: string;
  packageId?: string;
  taskIds: string[];
  agreeOnlySelectedTasks: boolean;
  consentMethod?: ConsentMethod;
  helperVerifyRequested: boolean;
  signatureImageUrl?: string;
  startTime: string;
  endTime: string;
}

interface BayRow {
  id: string;
  partner_id: string | null;
}

interface PartnerRow {
  id: string;
  hourly_price: number | string | null;
}

interface SelfMaintenanceTaskRow {
  id: string;
  code: string;
  is_legal: boolean;
  is_active: boolean;
  helper_verify_unit_fee: number | string;
}

interface PartnerPackagePriceRow {
  labor_price: number | string;
  service_packages:
    | {
        id: string;
        duration_minutes: number;
        is_active: boolean;
      }
    | Array<{
        id: string;
        duration_minutes: number;
        is_active: boolean;
      }>;
}

interface ReservationInsertResult {
  id: string;
  status: string;
  total_price: number | string;
  blocked_until: string;
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

function parseNumber(value: number | string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function normalizeServicePackage(
  value: PartnerPackagePriceRow["service_packages"],
): { id: string; duration_minutes: number; is_active: boolean } | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function parseBody(payload: unknown): ReservationRequestBody | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const {
    reservationType,
    bayId,
    packageId,
    taskIds,
    agreeOnlySelectedTasks,
    consentMethod,
    helperVerifyRequested,
    signatureImageUrl,
    startTime,
    endTime,
  } = payload as Record<string, unknown>;

  if (
    (reservationType !== "SELF_SERVICE" &&
      reservationType !== "SHOP_SERVICE") ||
    typeof bayId !== "string" ||
    typeof startTime !== "string" ||
    typeof endTime !== "string" ||
    (typeof helperVerifyRequested !== "undefined" &&
      typeof helperVerifyRequested !== "boolean")
  ) {
    return null;
  }

  if (!bayId.trim() || !startTime.trim() || !endTime.trim()) {
    return null;
  }

  const normalizedTaskIds = Array.isArray(taskIds)
    ? taskIds
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  const normalizedPackageId =
    typeof packageId === "string" && packageId.trim()
      ? packageId.trim()
      : undefined;

  const normalizedConsentMethod =
    consentMethod === "CHECKBOX" || consentMethod === "SIGNATURE"
      ? consentMethod
      : undefined;

  if (reservationType === "SELF_SERVICE") {
    if (normalizedTaskIds.length === 0) {
      return null;
    }

    if (
      typeof agreeOnlySelectedTasks !== "boolean" ||
      !agreeOnlySelectedTasks
    ) {
      return null;
    }

    if (!normalizedConsentMethod) {
      return null;
    }

    if (
      normalizedConsentMethod === "SIGNATURE" &&
      (typeof signatureImageUrl !== "string" || !signatureImageUrl.trim())
    ) {
      return null;
    }
  }

  if (reservationType === "SHOP_SERVICE" && !normalizedPackageId) {
    return null;
  }

  return {
    reservationType,
    bayId: bayId.trim(),
    packageId: normalizedPackageId,
    taskIds:
      reservationType === "SELF_SERVICE"
        ? [...new Set(normalizedTaskIds)]
        : [],
    agreeOnlySelectedTasks:
      reservationType === "SELF_SERVICE"
        ? Boolean(agreeOnlySelectedTasks)
        : false,
    consentMethod: normalizedConsentMethod,
    helperVerifyRequested:
      reservationType === "SELF_SERVICE" ? Boolean(helperVerifyRequested) : false,
    signatureImageUrl:
      typeof signatureImageUrl === "string" && signatureImageUrl.trim()
        ? signatureImageUrl.trim()
        : undefined,
    startTime: startTime.trim(),
    endTime: endTime.trim(),
  };
}

function validateReservationWindow(startTime: string, endTime: string) {
  const startDate = new Date(startTime);
  const endDate = new Date(endTime);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    startDate.getTime() >= endDate.getTime()
  ) {
    return {
      error: jsonError(
        400,
        "INVALID_TIME_RANGE",
        "시간 형식이 올바르지 않거나 시간 범위가 잘못되었습니다.",
      ),
    };
  }

  const durationMs = endDate.getTime() - startDate.getTime();
  const hourMs = 60 * 60 * 1000;

  if (durationMs < hourMs) {
    return {
      error: jsonError(400, "MIN_DURATION", "최소 예약 시간은 1시간입니다."),
    };
  }

  if (durationMs % hourMs !== 0) {
    return {
      error: jsonError(
        400,
        "INVALID_DURATION_UNIT",
        "예약 시간은 1시간 단위로만 선택할 수 있습니다.",
      ),
    };
  }

  return {
    startDate,
    endDate,
    durationMs,
    durationMinutes: Math.floor(durationMs / (60 * 1000)),
    durationHours: durationMs / hourMs,
    blockedUntilDate: new Date(endDate.getTime() + hourMs),
  };
}

async function getBayAndPartner(bayId: string) {
  const { data: bay, error: bayError } = await supabase
    .from("bays")
    .select("id, partner_id")
    .eq("id", bayId)
    .maybeSingle<BayRow>();

  if (bayError) {
    console.error("BAY LOOKUP ERROR:", bayError);
    return {
      error: jsonError(500, "DB_ERROR", "베이 조회 중 오류가 발생했습니다."),
    };
  }

  if (!bay || !bay.partner_id) {
    return {
      error: jsonError(
        400,
        "INVALID_BAY",
        "유효하지 않은 bayId 입니다. 존재하는 베이를 선택해 주세요.",
      ),
    };
  }

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("id, hourly_price")
    .eq("id", bay.partner_id)
    .maybeSingle<PartnerRow>();

  if (partnerError) {
    console.error("PARTNER LOOKUP ERROR:", partnerError);
    return {
      error: jsonError(500, "DB_ERROR", "매장 조회 중 오류가 발생했습니다."),
    };
  }

  const hourlyPrice = parseNumber(partner?.hourly_price ?? null);

  if (!partner || hourlyPrice === null || hourlyPrice < 0) {
    return {
      error: jsonError(
        400,
        "INVALID_PARTNER_PRICE",
        "매장의 시간당 요금 정보가 올바르지 않습니다.",
      ),
    };
  }

  return { bay, partner, hourlyPrice };
}

async function getLegalSelfTasks(taskCodes: string[]) {
  const { data, error } = await supabase
    .from("self_maintenance_tasks")
    .select("id, code, is_legal, is_active, helper_verify_unit_fee")
    .in("code", taskCodes)
    .returns<SelfMaintenanceTaskRow[]>();

  if (error) {
    console.error("LEGAL TASK LOOKUP ERROR:", error);
    return {
      error: jsonError(
        500,
        "DB_ERROR",
        "법적 허용 작업 조회에 실패했습니다.",
      ),
    };
  }

  const rows = data ?? [];
  const rowsByCode = new Map(rows.map((row) => [row.code, row]));
  const orderedRows = taskCodes
    .map((code) => rowsByCode.get(code) ?? null)
    .filter((row): row is SelfMaintenanceTaskRow => row !== null);
  const allTasksAllowed =
    orderedRows.length === taskCodes.length &&
    orderedRows.every((row) => row.is_legal && row.is_active);

  if (!allTasksAllowed) {
    return {
      error: jsonError(
        400,
        "ILLEGAL_SELF_TASK",
        "법적으로 허용된 셀프 정비 작업만 선택할 수 있습니다.",
      ),
    };
  }

  return { tasks: orderedRows };
}

async function getPartnerPackage(params: {
  partnerId: string;
  packageId: string;
}) {
  const { partnerId, packageId } = params;
  const { data, error } = await supabase
    .from("partner_package_prices")
    .select(
      "labor_price, service_packages!inner(id, duration_minutes, is_active)",
    )
    .eq("partner_id", partnerId)
    .eq("package_id", packageId)
    .eq("is_active", true)
    .maybeSingle<PartnerPackagePriceRow>();

  if (error) {
    console.error("PARTNER PACKAGE LOOKUP ERROR:", error);
    return {
      error: jsonError(500, "DB_ERROR", "패키지 조회 중 오류가 발생했습니다."),
    };
  }

  const servicePackage = data
    ? normalizeServicePackage(data.service_packages)
    : null;
  const laborPrice = parseNumber(data?.labor_price ?? null);

  if (!data || !servicePackage?.is_active || laborPrice === null) {
    return {
      error: jsonError(
        400,
        "INVALID_PACKAGE",
        "해당 매장에서 예약할 수 없는 패키지입니다.",
      ),
    };
  }

  return {
    laborPrice,
    durationMinutes: servicePackage.duration_minutes,
  };
}

function reservationDbErrorResponse(error: PostgrestError) {
  if (error.code === "23P01") {
    return jsonError(400, "RESERVATION_OVERLAP", "이미 예약된 시간입니다.");
  }

  if (error.code === "23503") {
    return jsonError(
      400,
      "INVALID_REFERENCE",
      "예약에 필요한 매장/베이/패키지 정보가 올바르지 않습니다.",
    );
  }

  if (error.code === "23514") {
    if (error.message.includes("chk_helper_verify_fee")) {
      return jsonError(
        400,
        "INVALID_HELPER_VERIFY_FEE",
        "카 마스터 검수 금액 조건이 올바르지 않습니다.",
      );
    }

    if (error.message.includes("chk_blocked_until_buffer")) {
      return jsonError(
        400,
        "INVALID_BLOCKED_UNTIL",
        "예약 종료 후 유예시간(1시간) 계산이 올바르지 않습니다.",
      );
    }

    if (error.message.includes("chk_reservation_hour_unit")) {
      return jsonError(
        400,
        "INVALID_DURATION_UNIT",
        "예약 시간은 1시간 단위여야 합니다.",
      );
    }

    return jsonError(
      400,
      "POLICY_VIOLATION",
      "예약 시간 또는 동의 조건이 정책에 맞지 않습니다.",
    );
  }

  if (error.code === "23502") {
    return jsonError(
      400,
      "MISSING_REQUIRED_RESERVATION_FIELD",
      "필수 예약 데이터가 누락되었습니다.",
    );
  }

  if (error.code === "42703" || error.code === "PGRST204") {
    return jsonError(
      500,
      "SCHEMA_OUT_OF_SYNC",
      "DB 스키마가 최신 예약 API와 맞지 않습니다. 마이그레이션 적용이 필요합니다.",
    );
  }

  if (error.code === "42P01") {
    return jsonError(
      500,
      "MISSING_TABLE",
      "필수 테이블이 없습니다. DB 마이그레이션을 먼저 적용해 주세요.",
    );
  }

  return jsonError(400, "CREATE_RESERVATION_FAILED", "예약 생성 실패");
}

export async function POST(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "요청 본문(JSON)이 올바르지 않습니다.");
  }

  const body = parseBody(payload);

  if (!body) {
    return jsonError(
      400,
      "INVALID_INPUT",
      "예약 요청 형식이 올바르지 않습니다.",
    );
  }

  const windowResult = validateReservationWindow(body.startTime, body.endTime);

  if ("error" in windowResult) {
    return windowResult.error;
  }

  const bayResult = await getBayAndPartner(body.bayId);

  if ("error" in bayResult) {
    return bayResult.error;
  }

  const {
    bay,
    hourlyPrice,
  } = bayResult;
  const partnerId = bay.partner_id;

  if (!partnerId) {
    return jsonError(
      400,
      "INVALID_BAY",
      "유효하지 않은 bayId 입니다. 존재하는 베이를 선택해 주세요.",
    );
  }

  const {
    durationHours,
    durationMinutes,
    blockedUntilDate,
  } = windowResult;

  let totalPrice = 0;
  let helperVerifyFee = 0;
  let legalTaskRows: SelfMaintenanceTaskRow[] = [];
  let packageId: string | null = null;

  if (body.reservationType === "SELF_SERVICE") {
    const taskResult = await getLegalSelfTasks(body.taskIds);

    if ("error" in taskResult) {
      return taskResult.error;
    }

    legalTaskRows = taskResult.tasks;
    helperVerifyFee = body.helperVerifyRequested
      ? HELPER_VERIFY_BASE_FEE +
        legalTaskRows.reduce((sum, task) => {
          const unitFee = parseNumber(task.helper_verify_unit_fee);
          return sum + Math.max(0, unitFee ?? 0);
        }, 0)
      : 0;
    totalPrice = durationHours * hourlyPrice + helperVerifyFee;
  } else {
    const partnerPackageResult = await getPartnerPackage({
      partnerId,
      packageId: body.packageId ?? "",
    });

    if ("error" in partnerPackageResult) {
      return partnerPackageResult.error;
    }

    const expectedDurationMinutes =
      Math.max(1, Math.ceil(partnerPackageResult.durationMinutes / 60)) * 60;

    if (durationMinutes !== expectedDurationMinutes) {
      return jsonError(
        400,
        "PACKAGE_DURATION_MISMATCH",
        "선택한 예약 시간이 패키지 소요 시간과 맞지 않습니다.",
      );
    }

    packageId = body.packageId ?? null;
    totalPrice = partnerPackageResult.laborPrice;
  }

  const { data, error } = await supabase
    .from("reservations")
    .insert({
      user_id: MOCK_USER_ID,
      partner_id: partnerId,
      bay_id: body.bayId,
      reservation_type: body.reservationType,
      package_id: packageId,
      start_time: body.startTime,
      end_time: body.endTime,
      duration_minutes: durationMinutes,
      reserved_end_time: body.endTime,
      blocked_until: blockedUntilDate.toISOString(),
      selected_task_count:
        body.reservationType === "SELF_SERVICE" ? body.taskIds.length : 0,
      helper_verify_requested:
        body.reservationType === "SELF_SERVICE"
          ? body.helperVerifyRequested
          : false,
      helper_verify_fee: helperVerifyFee,
      status: "CONFIRMED",
      total_price: totalPrice,
    })
    .select("id, status, total_price, blocked_until")
    .single<ReservationInsertResult>();

  if (error) {
    console.error("RESERVATION INSERT ERROR:", error);
    return reservationDbErrorResponse(error);
  }

  if (!data) {
    return jsonError(
      500,
      "EMPTY_INSERT_RESULT",
      "예약 생성 결과를 확인할 수 없습니다.",
    );
  }

  if (body.reservationType === "SELF_SERVICE") {
    const reservationTasks = legalTaskRows.map((task) => ({
      reservation_id: data.id,
      task_id: task.id,
    }));

    const { error: taskInsertError } = await supabase
      .from("reservation_tasks")
      .insert(reservationTasks);

    if (taskInsertError) {
      console.error("RESERVATION TASK INSERT ERROR:", taskInsertError);
      await supabase.from("reservations").delete().eq("id", data.id);
      return jsonError(500, "DB_ERROR", "선택 작업 저장에 실패했습니다.");
    }

    const { error: agreementInsertError } = await supabase
      .from("self_task_agreements")
      .insert({
        reservation_id: data.id,
        agree_only_selected: body.agreeOnlySelectedTasks,
        consent_method: body.consentMethod,
        signature_image_url:
          body.consentMethod === "SIGNATURE" ? body.signatureImageUrl : null,
      });

    if (agreementInsertError) {
      console.error("AGREEMENT INSERT ERROR:", agreementInsertError);
      await supabase
        .from("reservation_tasks")
        .delete()
        .eq("reservation_id", data.id);
      await supabase.from("reservations").delete().eq("id", data.id);
      return jsonError(500, "DB_ERROR", "작업 동의 정보 저장에 실패했습니다.");
    }
  }

  return NextResponse.json({
    success: true,
    id: data.id,
    status: data.status,
    reservationType: body.reservationType,
    blockedUntil: data.blocked_until,
    totalPrice: Number(data.total_price),
    helperVerifyFee,
  });
}
