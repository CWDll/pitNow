import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { ReservationType } from "@/src/domain/types";
import {
  isReservationStatusLogFailureFatal,
  logReservationStatusChange,
} from "@/src/lib/reservation-status";

const HELPER_VERIFY_BASE_FEE = 5000;

type ConsentMethod = "CHECKBOX" | "SIGNATURE";

export interface ReservationRequestBody {
  reservationType: ReservationType;
  bayId: string;
  vehicleId: string;
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
  is_active: boolean;
}

interface PartnerRow {
  id: string;
  hourly_price: number | string | null;
}

interface VehicleRow {
  id: string;
  user_id: string;
  plate_number: string;
  model: string;
  year: number;
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

interface AvailabilityBlockOverlapRow {
  id: string;
}

interface ReservationInsertResult {
  id: string;
  status: string;
  total_price: number | string;
  blocked_until: string;
}

type ReservationWindowResult =
  | {
      error: ApiErrorSpec;
    }
  | {
      durationMinutes: number;
      durationHours: number;
      blockedUntilDate: Date;
    };

type LookupResult<T extends object> = { error: ApiErrorSpec } | T;

export interface ApiErrorSpec {
  status: number;
  code: string;
  message: string;
}

export interface ReservationQuote {
  partnerId: string;
  durationMinutes: number;
  blockedUntil: string;
  totalPrice: number;
  helperVerifyFee: number;
  legalTaskRows: SelfMaintenanceTaskRow[];
  packageId: string | null;
}

export interface ConfirmedReservationResult {
  id: string;
  status: string;
  reservationType: ReservationType;
  vehicleId: string;
  blockedUntil: string;
  totalPrice: number;
  helperVerifyFee: number;
}

export type ReservationServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ApiErrorSpec };

export function apiError(
  status: number,
  code: string,
  message: string,
): ApiErrorSpec {
  return { status, code, message };
}

function parseNumber(value: number | string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeServicePackage(
  value: PartnerPackagePriceRow["service_packages"],
): { id: string; duration_minutes: number; is_active: boolean } | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function parseReservationRequestPayload(
  payload: unknown,
): ReservationRequestBody | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const {
    reservationType,
    bayId,
    vehicleId,
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
    typeof vehicleId !== "string" ||
    typeof startTime !== "string" ||
    typeof endTime !== "string" ||
    (typeof helperVerifyRequested !== "undefined" &&
      typeof helperVerifyRequested !== "boolean")
  ) {
    return null;
  }

  if (!bayId.trim() || !vehicleId.trim() || !startTime.trim() || !endTime.trim()) {
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
    vehicleId: vehicleId.trim(),
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

function validateReservationWindow(
  startTime: string,
  endTime: string,
): ReservationWindowResult {
  const startDate = new Date(startTime);
  const endDate = new Date(endTime);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    startDate.getTime() >= endDate.getTime()
  ) {
    return {
      error: apiError(
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
      error: apiError(400, "MIN_DURATION", "최소 예약 시간은 1시간입니다."),
    };
  }

  if (durationMs % hourMs !== 0) {
    return {
      error: apiError(
        400,
        "INVALID_DURATION_UNIT",
        "예약 시간은 1시간 단위로만 선택할 수 있습니다.",
      ),
    };
  }

  return {
    durationMinutes: Math.floor(durationMs / (60 * 1000)),
    durationHours: durationMs / hourMs,
    blockedUntilDate: new Date(endDate.getTime() + hourMs),
  };
}

async function getOwnedVehicle(params: {
  db: SupabaseClient;
  vehicleId: string;
  userId: string;
}): Promise<LookupResult<{ vehicle: VehicleRow }>> {
  const { db, vehicleId, userId } = params;
  const { data, error } = await db
    .from("vehicles")
    .select("id, user_id, plate_number, model, year")
    .eq("id", vehicleId)
    .eq("user_id", userId)
    .maybeSingle<VehicleRow>();

  if (error) {
    console.error("VEHICLE LOOKUP ERROR:", error);
    return {
      error: apiError(500, "DB_ERROR", "차량 조회 중 오류가 발생했습니다."),
    };
  }

  if (!data) {
    return {
      error: apiError(
        400,
        "INVALID_VEHICLE",
        "로그인한 사용자에게 등록된 차량을 선택해 주세요.",
      ),
    };
  }

  return { vehicle: data };
}

async function getBayAndPartner(
  db: SupabaseClient,
  bayId: string,
): Promise<LookupResult<{ bay: BayRow; hourlyPrice: number }>> {
  const { data: bay, error: bayError } = await db
    .from("bays")
    .select("id, partner_id, is_active")
    .eq("id", bayId)
    .maybeSingle<BayRow>();

  if (bayError) {
    console.error("BAY LOOKUP ERROR:", bayError);
    return {
      error: apiError(500, "DB_ERROR", "베이 조회 중 오류가 발생했습니다."),
    };
  }

  if (!bay || !bay.partner_id) {
    return {
      error: apiError(
        400,
        "INVALID_BAY",
        "유효하지 않은 bayId 입니다. 존재하는 베이를 선택해 주세요.",
      ),
    };
  }

  if (!bay.is_active) {
    return {
      error: apiError(
        400,
        "BAY_INACTIVE",
        "현재 예약할 수 없는 베이입니다. 다른 베이를 선택해 주세요.",
      ),
    };
  }

  const { data: partner, error: partnerError } = await db
    .from("partners")
    .select("id, hourly_price")
    .eq("id", bay.partner_id)
    .maybeSingle<PartnerRow>();

  if (partnerError) {
    console.error("PARTNER LOOKUP ERROR:", partnerError);
    return {
      error: apiError(500, "DB_ERROR", "매장 조회 중 오류가 발생했습니다."),
    };
  }

  const hourlyPrice = parseNumber(partner?.hourly_price ?? null);

  if (!partner || hourlyPrice === null || hourlyPrice < 0) {
    return {
      error: apiError(
        400,
        "INVALID_PARTNER_PRICE",
        "매장의 시간당 요금 정보가 올바르지 않습니다.",
      ),
    };
  }

  return { bay, hourlyPrice };
}

async function getLegalSelfTasks(
  db: SupabaseClient,
  taskCodes: string[],
): Promise<LookupResult<{ tasks: SelfMaintenanceTaskRow[] }>> {
  const { data, error } = await db
    .from("self_maintenance_tasks")
    .select("id, code, is_legal, is_active, helper_verify_unit_fee")
    .in("code", taskCodes)
    .returns<SelfMaintenanceTaskRow[]>();

  if (error) {
    console.error("LEGAL TASK LOOKUP ERROR:", error);
    return {
      error: apiError(
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
      error: apiError(
        400,
        "ILLEGAL_SELF_TASK",
        "법적으로 허용된 셀프 정비 작업만 선택할 수 있습니다.",
      ),
    };
  }

  return { tasks: orderedRows };
}

async function getPartnerPackage(params: {
  db: SupabaseClient;
  partnerId: string;
  packageId: string;
}): Promise<LookupResult<{ laborPrice: number; durationMinutes: number }>> {
  const { db, partnerId, packageId } = params;
  const { data, error } = await db
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
      error: apiError(500, "DB_ERROR", "패키지 조회 중 오류가 발생했습니다."),
    };
  }

  const servicePackage = data
    ? normalizeServicePackage(data.service_packages)
    : null;
  const laborPrice = parseNumber(data?.labor_price ?? null);

  if (!data || !servicePackage?.is_active || laborPrice === null) {
    return {
      error: apiError(
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

async function assertAvailabilityWindow(params: {
  db: SupabaseClient;
  partnerId: string;
  bayId: string;
  startTime: string;
  endTime: string;
}): Promise<LookupResult<Record<string, never>>> {
  const { db, partnerId, bayId, startTime, endTime } = params;
  const { data, error } = await db
    .from("partner_availability_blocks")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .lt("starts_at", endTime)
    .gt("ends_at", startTime)
    .or(`bay_id.is.null,bay_id.eq.${bayId}`)
    .limit(1)
    .returns<AvailabilityBlockOverlapRow[]>();

  if (error) {
    const isMissingSchema =
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      error.message.includes("partner_availability_blocks");

    if (isMissingSchema) {
      return {
        error: apiError(
          500,
          "MISSING_AVAILABILITY_BLOCK_SCHEMA",
          "partner_availability_blocks 테이블이 없습니다. store-admin 마이그레이션 적용이 필요합니다.",
        ),
      };
    }

    console.error("AVAILABILITY BLOCK LOOKUP ERROR:", error);
    return {
      error: apiError(
        500,
        "DB_ERROR",
        "예약 가능 시간 확인 중 오류가 발생했습니다.",
      ),
    };
  }

  if ((data ?? []).length > 0) {
    return {
      error: apiError(
        400,
        "PARTNER_AVAILABILITY_BLOCKED",
        "선택한 시간은 정비소에서 예약을 막아둔 시간입니다.",
      ),
    };
  }

  return {};
}

export function reservationDbErrorToApiError(error: PostgrestError): ApiErrorSpec {
  if (error.code === "23P01") {
    return apiError(400, "RESERVATION_OVERLAP", "이미 예약된 시간입니다.");
  }

  if (error.code === "23503") {
    return apiError(
      400,
      "INVALID_REFERENCE",
      "예약에 필요한 매장/베이/패키지 정보가 올바르지 않습니다.",
    );
  }

  if (error.code === "23514") {
    if (error.message.includes("chk_helper_verify_fee")) {
      return apiError(
        400,
        "INVALID_HELPER_VERIFY_FEE",
        "카 마스터 검수 금액 조건이 올바르지 않습니다.",
      );
    }

    if (error.message.includes("chk_blocked_until_buffer")) {
      return apiError(
        400,
        "INVALID_BLOCKED_UNTIL",
        "예약 종료 후 유예시간(1시간) 계산이 올바르지 않습니다.",
      );
    }

    if (error.message.includes("chk_reservation_hour_unit")) {
      return apiError(
        400,
        "INVALID_DURATION_UNIT",
        "예약 시간은 1시간 단위여야 합니다.",
      );
    }

    return apiError(
      400,
      "POLICY_VIOLATION",
      "예약 시간 또는 동의 조건이 정책에 맞지 않습니다.",
    );
  }

  if (error.code === "23502") {
    return apiError(
      400,
      "MISSING_REQUIRED_RESERVATION_FIELD",
      "필수 예약 데이터가 누락되었습니다.",
    );
  }

  if (error.code === "42703" || error.code === "PGRST204") {
    return apiError(
      500,
      "SCHEMA_OUT_OF_SYNC",
      "DB 스키마가 최신 예약 API와 맞지 않습니다. 마이그레이션 적용이 필요합니다.",
    );
  }

  if (error.code === "42P01") {
    return apiError(
      500,
      "MISSING_TABLE",
      "필수 테이블이 없습니다. DB 마이그레이션을 먼저 적용해 주세요.",
    );
  }

  return apiError(400, "CREATE_RESERVATION_FAILED", "예약 생성 실패");
}

export async function quoteReservation(params: {
  db: SupabaseClient;
  body: ReservationRequestBody;
  userId: string;
}): Promise<ReservationServiceResult<ReservationQuote>> {
  const { db, body, userId } = params;
  const windowResult = validateReservationWindow(body.startTime, body.endTime);

  if ("error" in windowResult) {
    return { ok: false, error: windowResult.error };
  }

  const bayResult = await getBayAndPartner(db, body.bayId);

  if ("error" in bayResult) {
    return { ok: false, error: bayResult.error };
  }

  const vehicleResult = await getOwnedVehicle({
    db,
    vehicleId: body.vehicleId,
    userId,
  });

  if ("error" in vehicleResult) {
    return { ok: false, error: vehicleResult.error };
  }

  const partnerId = bayResult.bay.partner_id;

  if (!partnerId) {
    return {
      ok: false,
      error: apiError(
        400,
        "INVALID_BAY",
        "유효하지 않은 bayId 입니다. 존재하는 베이를 선택해 주세요.",
      ),
    };
  }

  const availabilityResult = await assertAvailabilityWindow({
    db,
    partnerId,
    bayId: body.bayId,
    startTime: body.startTime,
    endTime: body.endTime,
  });

  if ("error" in availabilityResult) {
    return { ok: false, error: availabilityResult.error };
  }

  let totalPrice = 0;
  let helperVerifyFee = 0;
  let legalTaskRows: SelfMaintenanceTaskRow[] = [];
  let packageId: string | null = null;

  if (body.reservationType === "SELF_SERVICE") {
    const taskResult = await getLegalSelfTasks(db, body.taskIds);

    if ("error" in taskResult) {
      return { ok: false, error: taskResult.error };
    }

    legalTaskRows = taskResult.tasks;
    helperVerifyFee = body.helperVerifyRequested
      ? HELPER_VERIFY_BASE_FEE +
        legalTaskRows.reduce((sum, task) => {
          const unitFee = parseNumber(task.helper_verify_unit_fee);
          return sum + Math.max(0, unitFee ?? 0);
        }, 0)
      : 0;
    totalPrice = windowResult.durationHours * bayResult.hourlyPrice + helperVerifyFee;
  } else {
    const partnerPackageResult = await getPartnerPackage({
      db,
      partnerId,
      packageId: body.packageId ?? "",
    });

    if ("error" in partnerPackageResult) {
      return { ok: false, error: partnerPackageResult.error };
    }

    const expectedDurationMinutes =
      Math.max(1, Math.ceil(partnerPackageResult.durationMinutes / 60)) * 60;

    if (windowResult.durationMinutes !== expectedDurationMinutes) {
      return {
        ok: false,
        error: apiError(
          400,
          "PACKAGE_DURATION_MISMATCH",
          "선택한 예약 시간이 패키지 소요 시간과 맞지 않습니다.",
        ),
      };
    }

    packageId = body.packageId ?? null;
    totalPrice = partnerPackageResult.laborPrice;
  }

  return {
    ok: true,
    value: {
      partnerId,
      durationMinutes: windowResult.durationMinutes,
      blockedUntil: windowResult.blockedUntilDate.toISOString(),
      totalPrice,
      helperVerifyFee,
      legalTaskRows,
      packageId,
    },
  };
}

export async function createConfirmedReservation(params: {
  db: SupabaseClient;
  body: ReservationRequestBody;
  quote: ReservationQuote;
  userId: string;
  actorUserId: string | null;
  statusReason?: string;
  statusMetadata?: Record<string, unknown>;
}): Promise<ReservationServiceResult<ConfirmedReservationResult>> {
  const {
    db,
    body,
    quote,
    userId,
    actorUserId,
    statusReason = "reservation_created",
    statusMetadata = {},
  } = params;

  const { data, error } = await db
    .from("reservations")
    .insert({
      user_id: userId,
      vehicle_id: body.vehicleId,
      partner_id: quote.partnerId,
      bay_id: body.bayId,
      reservation_type: body.reservationType,
      package_id: quote.packageId,
      start_time: body.startTime,
      end_time: body.endTime,
      duration_minutes: quote.durationMinutes,
      reserved_end_time: body.endTime,
      blocked_until: quote.blockedUntil,
      selected_task_count:
        body.reservationType === "SELF_SERVICE" ? body.taskIds.length : 0,
      helper_verify_requested:
        body.reservationType === "SELF_SERVICE"
          ? body.helperVerifyRequested
          : false,
      helper_verify_fee: quote.helperVerifyFee,
      status: "CONFIRMED",
      total_price: quote.totalPrice,
    })
    .select("id, status, total_price, blocked_until")
    .single<ReservationInsertResult>();

  if (error) {
    console.error("RESERVATION INSERT ERROR:", error);
    return { ok: false, error: reservationDbErrorToApiError(error) };
  }

  if (!data) {
    return {
      ok: false,
      error: apiError(
        500,
        "EMPTY_INSERT_RESULT",
        "예약 생성 결과를 확인할 수 없습니다.",
      ),
    };
  }

  if (body.reservationType === "SELF_SERVICE") {
    const reservationTasks = quote.legalTaskRows.map((task) => ({
      reservation_id: data.id,
      task_id: task.id,
    }));

    const { error: taskInsertError } = await db
      .from("reservation_tasks")
      .insert(reservationTasks);

    if (taskInsertError) {
      console.error("RESERVATION TASK INSERT ERROR:", taskInsertError);
      await db.from("reservations").delete().eq("id", data.id);
      return {
        ok: false,
        error: apiError(500, "DB_ERROR", "선택 작업 저장에 실패했습니다."),
      };
    }

    const { error: agreementInsertError } = await db
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
      await db
        .from("reservation_tasks")
        .delete()
        .eq("reservation_id", data.id);
      await db.from("reservations").delete().eq("id", data.id);
      return {
        ok: false,
        error: apiError(500, "DB_ERROR", "작업 동의 정보 저장에 실패했습니다."),
      };
    }
  }

  const logResult = await logReservationStatusChange({
    reservationId: data.id,
    fromStatus: null,
    toStatus: "CONFIRMED",
    actorType: "USER",
    actorUserId,
    reason: statusReason,
    client: db,
    metadata: {
      reservationType: body.reservationType,
      vehicleId: body.vehicleId,
      packageId: quote.packageId,
      selectedTaskCount:
        body.reservationType === "SELF_SERVICE" ? body.taskIds.length : 0,
      ...statusMetadata,
    },
  });

  if (isReservationStatusLogFailureFatal(logResult)) {
    await db.from("reservations").delete().eq("id", data.id);
    return {
      ok: false,
      error: apiError(
        500,
        "STATUS_LOG_ERROR",
        "예약 상태 변경 로그 저장에 실패했습니다.",
      ),
    };
  }

  return {
    ok: true,
    value: {
      id: data.id,
      status: data.status,
      reservationType: body.reservationType,
      vehicleId: body.vehicleId,
      blockedUntil: data.blocked_until,
      totalPrice: Number(data.total_price),
      helperVerifyFee: quote.helperVerifyFee,
    },
  };
}
