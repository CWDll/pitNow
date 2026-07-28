import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ReservationStatusActor } from "@/src/lib/reservation-status";
import { transitionReservationStatus } from "@/src/lib/reservation-status";

interface ExpirePastConfirmedReservationsParams {
  client: SupabaseClient;
  now?: Date;
  partnerId?: string;
  reservationId?: string;
  userId?: string;
  actorType?: ReservationStatusActor;
  actorUserId?: string | null;
  reason?: string;
  limit?: number;
}

interface ExpiredReservationRow {
  id: string;
  end_time: string;
}

export interface ExpirePastConfirmedReservationsResult {
  expiredCount: number;
  conflictCount: number;
  errors: string[];
}

export async function expirePastConfirmedReservations({
  client,
  now = new Date(),
  partnerId,
  reservationId,
  userId,
  actorType = "SYSTEM",
  actorUserId = null,
  reason = "reservation_end_time_passed",
  limit = 200,
}: ExpirePastConfirmedReservationsParams): Promise<ExpirePastConfirmedReservationsResult> {
  let query = client
    .from("reservations")
    .select("id,end_time")
    .eq("status", "CONFIRMED")
    .lte("end_time", now.toISOString())
    .order("end_time", { ascending: true })
    .limit(limit);

  if (partnerId) {
    query = query.eq("partner_id", partnerId);
  }

  if (reservationId) {
    query = query.eq("id", reservationId);
  }

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query.returns<ExpiredReservationRow[]>();

  if (error) {
    console.error("NO SHOW RESERVATION LOOKUP ERROR:", error);
    return {
      expiredCount: 0,
      conflictCount: 0,
      errors: [error.message],
    };
  }

  const results = await Promise.all(
    (data ?? []).map(async (reservation) => {
      const result = await transitionReservationStatus({
        client,
        reservationId: reservation.id,
        fromStatus: "CONFIRMED",
        toStatus: "NO_SHOW",
        actorType,
        actorUserId,
        reason,
        metadata: {
          autoExpired: actorType === "SYSTEM",
          endTime: reservation.end_time,
          evaluatedAt: now.toISOString(),
        },
      });

      return result;
    }),
  );

  return results.reduce<ExpirePastConfirmedReservationsResult>(
    (summary, result) => {
      if (result.ok) {
        summary.expiredCount += 1;
      } else if (result.code === "STATUS_CONFLICT") {
        summary.conflictCount += 1;
      } else {
        summary.errors.push(result.message);
      }

      return summary;
    },
    {
      expiredCount: 0,
      conflictCount: 0,
      errors: [],
    },
  );
}
