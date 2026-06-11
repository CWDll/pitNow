import type { ReservationStatus } from "@/src/domain/types";
import { supabase } from "@/src/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ReservationStatusActor = "SYSTEM" | "USER" | "PARTNER" | "ADMIN";

interface LogReservationStatusChangeParams {
  reservationId: string;
  fromStatus: ReservationStatus | null;
  toStatus: ReservationStatus;
  actorType?: ReservationStatusActor;
  reason?: string;
  metadata?: Record<string, unknown>;
  actorUserId?: string | null;
  client?: SupabaseClient;
}

interface TransitionReservationStatusParams {
  reservationId: string;
  fromStatus: ReservationStatus;
  toStatus: ReservationStatus;
  actorType?: ReservationStatusActor;
  reason?: string;
  metadata?: Record<string, unknown>;
  actorUserId?: string | null;
  client?: SupabaseClient;
}

export interface StatusLogResult {
  ok: boolean;
  skippedMissingTable: boolean;
  message?: string;
}

export type StatusTransitionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      code: "DB_ERROR" | "STATUS_CONFLICT" | "STATUS_LOG_ERROR";
      message: string;
    };

export function isReservationStatusLogFailureFatal(
  result: StatusLogResult,
): boolean {
  if (result.ok) {
    return false;
  }

  return (
    !result.skippedMissingTable ||
    process.env.NODE_ENV === "production" ||
    process.env.PITNOW_REQUIRE_STATUS_LOGS === "true"
  );
}

export async function logReservationStatusChange({
  reservationId,
  fromStatus,
  toStatus,
  actorType = "SYSTEM",
  reason,
  metadata = {},
  actorUserId = null,
  client = supabase,
}: LogReservationStatusChangeParams): Promise<StatusLogResult> {
  const insertPayload = {
    reservation_id: reservationId,
    from_status: fromStatus,
    to_status: toStatus,
    actor_type: actorType,
    reason: reason ?? null,
    metadata,
  };

  const { error } = await client.from("reservation_status_logs").insert({
    ...insertPayload,
    actor_user_id: actorUserId,
  });

  if (
    error?.code === "PGRST204" &&
    error.message.includes("actor_user_id")
  ) {
    const { error: retryError } = await client
      .from("reservation_status_logs")
      .insert(insertPayload);

    if (!retryError) {
      return { ok: true, skippedMissingTable: false };
    }

    console.error("RESERVATION STATUS LOG RETRY ERROR:", retryError);
    return {
      ok: false,
      skippedMissingTable: false,
      message: retryError.message,
    };
  }

  if (!error) {
    return { ok: true, skippedMissingTable: false };
  }

  const isMissingTable =
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.message.includes("reservation_status_logs");

  if (isMissingTable) {
    console.warn(
      "RESERVATION STATUS LOG SKIPPED: apply db/migrations/20260609_reservation_status_logs.sql",
    );
    return {
      ok: false,
      skippedMissingTable: true,
      message: error.message,
    };
  }

  console.error("RESERVATION STATUS LOG ERROR:", error);
  return {
    ok: false,
    skippedMissingTable: false,
    message: error.message,
  };
}

export async function transitionReservationStatus({
  reservationId,
  fromStatus,
  toStatus,
  actorType = "SYSTEM",
  reason,
  metadata = {},
  actorUserId = null,
  client = supabase,
}: TransitionReservationStatusParams): Promise<StatusTransitionResult> {
  const { data: updatedReservation, error: updateError } = await client
    .from("reservations")
    .update({ status: toStatus })
    .eq("id", reservationId)
    .eq("status", fromStatus)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updateError) {
    console.error("RESERVATION STATUS UPDATE ERROR:", updateError);
    return {
      ok: false,
      code: "DB_ERROR",
      message: "예약 상태 변경 중 오류가 발생했습니다.",
    };
  }

  if (!updatedReservation) {
    return {
      ok: false,
      code: "STATUS_CONFLICT",
      message: "예약 상태가 변경되어 요청을 완료할 수 없습니다.",
    };
  }

  const logResult = await logReservationStatusChange({
    reservationId,
    fromStatus,
    toStatus,
    actorType,
    actorUserId,
    reason,
    metadata,
    client,
  });

  if (isReservationStatusLogFailureFatal(logResult)) {
    await client
      .from("reservations")
      .update({ status: fromStatus })
      .eq("id", reservationId)
      .eq("status", toStatus);

    return {
      ok: false,
      code: "STATUS_LOG_ERROR",
      message: "예약 상태 변경 로그 저장에 실패했습니다.",
    };
  }

  return { ok: true };
}
