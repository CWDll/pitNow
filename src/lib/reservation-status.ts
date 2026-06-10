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

export interface StatusLogResult {
  ok: boolean;
  skippedMissingTable: boolean;
  message?: string;
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
