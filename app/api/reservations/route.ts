import { NextResponse } from "next/server";

import {
  getSupabaseEnvErrorResponse,
  hasSupabaseEnv,
  supabase,
} from "@/src/lib/supabase";

const MOCK_USER_ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_HOURLY_PRICE = 20000;

const legalTaskAllowlist = new Map<
  string,
  { title: string; helperVerifyUnitFee: number }
>([
  ["engine-oil", { title: "엔진오일 교환", helperVerifyUnitFee: 2000 }],
  ["brake-pad", { title: "브레이크 패드 교환", helperVerifyUnitFee: 3000 }],
  ["tire-rotation", { title: "타이어 로테이션", helperVerifyUnitFee: 2000 }],
  ["air-filter", { title: "에어필터 교환", helperVerifyUnitFee: 1500 }],
  ["wiper", { title: "와이퍼 블레이드 교체", helperVerifyUnitFee: 1000 }],
]);

interface ReservationRequestBody {
  bookingMode: "SELF" | "PACKAGE";
  bayId: string;
  taskIds?: string[];
  agreeOnlySelectedTasks?: boolean;
  consentMethod?: "CHECKBOX" | "SIGNATURE";
  helperVerifyRequested?: boolean;
  helperVerifyFee?: number;
  signatureImageUrl?: string;
  startTime: string;
  endTime: string;
}

function parseBody(payload: unknown): ReservationRequestBody | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const {
    bookingMode,
    bayId,
    taskIds,
    agreeOnlySelectedTasks,
    consentMethod,
    helperVerifyRequested,
    helperVerifyFee,
    signatureImageUrl,
    startTime,
    endTime,
  } = payload as Record<string, unknown>;

  if (
    (bookingMode !== "SELF" && bookingMode !== "PACKAGE") ||
    typeof bayId !== "string" ||
    (typeof helperVerifyRequested !== "undefined" &&
      typeof helperVerifyRequested !== "boolean") ||
    (typeof helperVerifyFee !== "undefined" &&
      typeof helperVerifyFee !== "number") ||
    typeof startTime !== "string" ||
    typeof endTime !== "string"
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

  const normalizedConsentMethod =
    consentMethod === "CHECKBOX" || consentMethod === "SIGNATURE"
      ? consentMethod
      : undefined;

  if (bookingMode === "SELF") {
    if (normalizedTaskIds.length === 0) {
      return null;
    }

    if (
      typeof agreeOnlySelectedTasks !== "boolean" ||
      !agreeOnlySelectedTasks
    ) {
      return null;
    }

    if (consentMethod !== "CHECKBOX" && consentMethod !== "SIGNATURE") {
      return null;
    }

    if (consentMethod === "SIGNATURE") {
      if (typeof signatureImageUrl !== "string" || !signatureImageUrl.trim()) {
        return null;
      }
    }
  }

  return {
    bookingMode,
    bayId: bayId.trim(),
    taskIds: bookingMode === "SELF" ? [...new Set(normalizedTaskIds)] : [],
    agreeOnlySelectedTasks:
      bookingMode === "SELF" ? Boolean(agreeOnlySelectedTasks) : false,
    consentMethod: normalizedConsentMethod,
    helperVerifyRequested:
      bookingMode === "SELF" ? Boolean(helperVerifyRequested) : false,
    helperVerifyFee:
      bookingMode === "SELF" && typeof helperVerifyFee === "number"
        ? helperVerifyFee
        : 0,
    signatureImageUrl:
      typeof signatureImageUrl === "string" && signatureImageUrl.trim()
        ? signatureImageUrl.trim()
        : undefined,
    startTime: startTime.trim(),
    endTime: endTime.trim(),
  };
}

export async function POST(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  try {
    const payload: unknown = await req.json();
    const body = parseBody(payload);

    if (!body) {
      return NextResponse.json(
        { error: "예약 요청 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const {
      bookingMode,
      bayId,
      taskIds,
      agreeOnlySelectedTasks,
      consentMethod,
      helperVerifyRequested,
      helperVerifyFee,
      signatureImageUrl,
      startTime,
      endTime,
    } = body;
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    const blockedUntilDate = new Date(endDate.getTime() + 60 * 60 * 1000);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      startDate.getTime() >= endDate.getTime()
    ) {
      return NextResponse.json(
        { error: "시간 형식이 올바르지 않거나 시간 범위가 잘못되었습니다." },
        { status: 400 },
      );
    }

    if (endDate.getTime() - startDate.getTime() < 60 * 60 * 1000) {
      return NextResponse.json(
        { error: "최소 예약 시간은 1시간입니다." },
        { status: 400 },
      );
    }

    const durationMs = endDate.getTime() - startDate.getTime();
    const isHourUnit = durationMs % (60 * 60 * 1000) === 0;

    if (!isHourUnit) {
      return NextResponse.json(
        { error: "예약 시간은 1시간 단위로만 선택할 수 있습니다." },
        { status: 400 },
      );
    }

    if (bookingMode === "SELF") {
      if (!agreeOnlySelectedTasks) {
        return NextResponse.json(
          { error: "선택한 작업만 수행한다는 동의가 필요합니다." },
          { status: 400 },
        );
      }

      if (!taskIds?.every((taskId) => legalTaskAllowlist.has(taskId))) {
        return NextResponse.json(
          { error: "법적으로 허용된 셀프 정비 작업만 선택할 수 있습니다." },
          { status: 400 },
        );
      }
    }

    const { data: bay, error: bayError } = await supabase
      .from("bays")
      .select("id, partner_id")
      .eq("id", bayId)
      .maybeSingle<{ id: string; partner_id: string | null }>();

    if (bayError) {
      console.error("BAY LOOKUP ERROR:", bayError);
      return NextResponse.json(
        { error: "베이 조회 중 오류가 발생했습니다." },
        { status: 500 },
      );
    }

    if (!bay) {
      return NextResponse.json(
        { error: "유효하지 않은 bayId 입니다. 존재하는 베이를 선택해 주세요." },
        { status: 400 },
      );
    }

    const durationHours = durationMs / (60 * 60 * 1000);
    const durationMinutes = Math.floor(durationMs / (60 * 1000));
    const baseTimePrice = durationHours * DEFAULT_HOURLY_PRICE;
    const selfHelperVerifyFee =
      bookingMode === "SELF" && helperVerifyRequested
        ? Math.max(0, helperVerifyFee ?? 0)
        : 0;
    const totalPrice = baseTimePrice + selfHelperVerifyFee;

    const reservationPayload = {
      user_id: MOCK_USER_ID,
      partner_id: bay.partner_id,
      bay_id: bayId,
      reservation_type: bookingMode,
      start_time: startTime,
      end_time: endTime,
      duration_minutes: durationMinutes,
      reserved_start_time: startTime,
      reserved_end_time: endTime,
      blocked_until: blockedUntilDate.toISOString(),
      selected_task_count: bookingMode === "SELF" ? (taskIds?.length ?? 0) : 0,
      helper_verify_requested:
        bookingMode === "SELF" ? Boolean(helperVerifyRequested) : false,
      helper_verify_fee: selfHelperVerifyFee,
      status: "CONFIRMED",
      total_price: totalPrice,
    };

    let data: { id: string; status: string } | null = null;
    let error: { code?: string; message?: string } | null = null;

    const reservationTypeCandidates =
      bookingMode === "SELF"
        ? ["SELF", "SELF_MAINTENANCE", "SELF_SERVICE", "TIME"]
        : ["PACKAGE", "PACKAGE_SERVICE", "PKG"];

    for (const reservationTypeCandidate of reservationTypeCandidates) {
      const insertPayload: Record<string, unknown> = {
        ...reservationPayload,
        reservation_type: reservationTypeCandidate,
      };

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const result = await supabase
          .from("reservations")
          .insert(insertPayload)
          .select("id, status")
          .single<{ id: string; status: string }>();

        data = result.data;
        error = result.error;

        if (!error) {
          break;
        }

        if (error.code !== "PGRST204") {
          break;
        }

        const missingColumnMatch = error.message?.match(/'([^']+)' column/);
        const missingColumn = missingColumnMatch?.[1];

        if (!missingColumn || !(missingColumn in insertPayload)) {
          break;
        }

        delete insertPayload[missingColumn];
      }

      if (!error) {
        break;
      }

      const isReservationTypeCheckError =
        error.code === "23514" &&
        error.message?.includes("reservations_reservation_type_check");

      if (!isReservationTypeCheckError) {
        break;
      }
    }

    if (error) {
      console.error("SUPABASE ERROR:", error);

      if (error.code === "23P01") {
        return NextResponse.json(
          { error: "이미 예약된 시간입니다." },
          { status: 400 },
        );
      }

      if (error.code === "23503") {
        return NextResponse.json(
          {
            error: "유효하지 않은 bayId 입니다. 존재하는 베이를 선택해 주세요.",
          },
          { status: 400 },
        );
      }

      if (error.code === "23514") {
        if (error.message?.includes("reservations_reservation_type_check")) {
          return NextResponse.json(
            {
              error:
                "현재 DB의 예약 유형 정책과 앱 값이 맞지 않습니다. 예약 유형 스키마 확인이 필요합니다.",
            },
            { status: 400 },
          );
        }

        if (error.message?.includes("chk_helper_verify_fee")) {
          return NextResponse.json(
            { error: "카 마스터 검수 금액 조건이 올바르지 않습니다." },
            { status: 400 },
          );
        }

        if (error.message?.includes("chk_blocked_until_buffer")) {
          return NextResponse.json(
            { error: "예약 종료 후 유예시간(1시간) 계산이 올바르지 않습니다." },
            { status: 400 },
          );
        }

        if (error.message?.includes("chk_reservation_hour_unit")) {
          return NextResponse.json(
            { error: "예약 시간은 1시간 단위여야 합니다." },
            { status: 400 },
          );
        }

        return NextResponse.json(
          { error: "예약 시간 또는 동의 조건이 정책에 맞지 않습니다." },
          { status: 400 },
        );
      }

      if (error.code === "23502") {
        if (error.message?.includes('"duration_minutes"')) {
          return NextResponse.json(
            { error: "예약 소요 시간(duration_minutes)이 누락되었습니다." },
            { status: 400 },
          );
        }

        if (error.message?.includes('"reserved_end_time"')) {
          return NextResponse.json(
            { error: "예약 종료 시각(reserved_end_time)이 누락되었습니다." },
            { status: 400 },
          );
        }

        if (error.message?.includes('"reserved_start_time"')) {
          return NextResponse.json(
            { error: "예약 시작 시각(reserved_start_time)이 누락되었습니다." },
            { status: 400 },
          );
        }

        if (error.message?.includes('"reservation_type"')) {
          return NextResponse.json(
            { error: "예약 유형(reservation_type)이 누락되었습니다." },
            { status: 400 },
          );
        }

        if (error.message?.includes('"partner_id"')) {
          return NextResponse.json(
            {
              error:
                "매장 정보(partner_id)가 누락되었습니다. 베이 정보를 확인해 주세요.",
            },
            { status: 400 },
          );
        }

        return NextResponse.json(
          { error: "필수 예약 데이터가 누락되었습니다." },
          { status: 400 },
        );
      }

      if (error.code === "42703") {
        return NextResponse.json(
          {
            error:
              "DB 스키마가 최신이 아닙니다. 마이그레이션 적용이 필요합니다.",
          },
          { status: 500 },
        );
      }

      if (error.code === "PGRST204") {
        return NextResponse.json(
          {
            error:
              "DB 스키마 캐시가 최신이 아닙니다. 잠시 후 다시 시도해 주세요.",
          },
          { status: 500 },
        );
      }

      if (error.code === "42P01") {
        return NextResponse.json(
          {
            error:
              "필수 테이블이 없습니다. DB 마이그레이션을 먼저 적용해 주세요.",
          },
          { status: 500 },
        );
      }

      return NextResponse.json({ error: "예약 생성 실패" }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json(
        { error: "예약 생성 결과를 확인할 수 없습니다." },
        { status: 500 },
      );
    }

    const reservationId = data.id;

    if (bookingMode === "SELF") {
      const { data: legalTaskRows, error: legalTaskLookupError } =
        await supabase
          .from("self_maintenance_tasks")
          .select("id, code, is_legal, is_active")
          .in("code", taskIds ?? [])
          .returns<
            Array<{
              id: string;
              code: string;
              is_legal: boolean;
              is_active: boolean;
            }>
          >();

      if (legalTaskLookupError) {
        console.error("LEGAL TASK LOOKUP ERROR:", legalTaskLookupError);
        await supabase.from("reservations").delete().eq("id", reservationId);
        return NextResponse.json(
          { error: "법적 허용 작업 조회에 실패했습니다." },
          { status: 500 },
        );
      }

      const legalTaskIds = (legalTaskRows ?? [])
        .filter((item) => item.is_legal && item.is_active)
        .map((item) => item.id);

      if (legalTaskIds.length !== (taskIds?.length ?? 0)) {
        await supabase.from("reservations").delete().eq("id", reservationId);
        return NextResponse.json(
          { error: "법적으로 허용된 셀프 정비 작업만 선택할 수 있습니다." },
          { status: 400 },
        );
      }

      const taskRows = legalTaskIds.map((taskId) => ({
        reservation_id: reservationId,
        task_id: taskId,
      }));

      const { error: taskInsertError } = await supabase
        .from("reservation_tasks")
        .insert(taskRows);

      if (taskInsertError) {
        console.error("RESERVATION TASK INSERT ERROR:", taskInsertError);
        await supabase.from("reservations").delete().eq("id", reservationId);
        return NextResponse.json(
          { error: "선택 작업 저장에 실패했습니다." },
          { status: 500 },
        );
      }

      const { error: agreementInsertError } = await supabase
        .from("self_task_agreements")
        .insert({
          reservation_id: reservationId,
          agree_only_selected: agreeOnlySelectedTasks,
          consent_method: consentMethod,
          signature_image_url:
            consentMethod === "SIGNATURE" ? signatureImageUrl : null,
        });

      if (agreementInsertError) {
        console.error("AGREEMENT INSERT ERROR:", agreementInsertError);
        await supabase
          .from("reservation_tasks")
          .delete()
          .eq("reservation_id", reservationId);
        await supabase.from("reservations").delete().eq("id", reservationId);
        return NextResponse.json(
          { error: "작업 동의 정보 저장에 실패했습니다." },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      id: data.id,
      status: data.status,
      blockedUntil: blockedUntilDate.toISOString(),
      helperVerifyFee: selfHelperVerifyFee,
    });
  } catch (e: unknown) {
    console.error("SERVER ERROR:", e);
    return NextResponse.json(
      { error: "서버 내부 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
