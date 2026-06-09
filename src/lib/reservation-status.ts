import type { ReservationStatus } from "@/src/domain/types";
import { supabase } from "@/src/lib/supabase";

export type ReservationStatusActor = "SYSTEM" | "USER" | "PARTNER" | "ADMIN";

interface LogReservationStatusChangeParams {
  reservationId: string;
  fromStatus: ReservationStatus | null;
  toStatus: ReservationStatus;
  actorType?: ReservationStatusActor;
  reason?: string;
  metadata?: Record<string, unknown>;
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
}: LogReservationStatusChangeParams): Promise<StatusLogResult> {
  const { error } = await supabase.from("reservation_status_logs").insert({
    reservation_id: reservationId,
    from_status: fromStatus,
    to_status: toStatus,
    actor_type: actorType,
    reason: reason ?? null,
    metadata,
  });

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
