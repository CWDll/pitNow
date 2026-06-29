import type { SupabaseClient } from "@supabase/supabase-js";

export type PartnerAdminAuditAction =
  | "BAY_ACTIVE_UPDATED"
  | "AVAILABILITY_BLOCK_CREATED"
  | "AVAILABILITY_BLOCK_UPDATED"
  | "AVAILABILITY_BLOCK_DEACTIVATED"
  | "AVAILABILITY_BLOCK_REACTIVATED"
  | "RESERVATION_NOTE_CREATED"
  | "RESERVATION_NOTE_RESOLVED"
  | "RESERVATION_NOTE_REOPENED";

export type PartnerAdminAuditTargetType =
  | "BAY"
  | "AVAILABILITY_BLOCK"
  | "RESERVATION_NOTE";

interface RecordPartnerAdminAuditParams {
  db: SupabaseClient;
  partnerId: string;
  actorUserId: string;
  action: PartnerAdminAuditAction;
  targetType: PartnerAdminAuditTargetType;
  targetId: string;
  reservationId?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

function isMissingAuditSchema(error: { code?: string; message?: string } | null) {
  const message = error?.message ?? "";

  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    message.includes("partner_admin_audit_logs")
  );
}

export async function recordPartnerAdminAudit({
  db,
  partnerId,
  actorUserId,
  action,
  targetType,
  targetId,
  reservationId = null,
  beforeState = null,
  afterState = null,
  metadata = null,
}: RecordPartnerAdminAuditParams) {
  const { error } = await db.from("partner_admin_audit_logs").insert({
    partner_id: partnerId,
    actor_user_id: actorUserId,
    action,
    target_type: targetType,
    target_id: targetId,
    reservation_id: reservationId,
    before_state: beforeState ?? {},
    after_state: afterState ?? {},
    metadata: metadata ?? {},
  });

  if (!error) {
    return;
  }

  if (isMissingAuditSchema(error)) {
    console.warn(
      "PARTNER ADMIN AUDIT SKIPPED: apply db/migrations/20260629_partner_admin_audit_logs.sql",
    );
    return;
  }

  console.error("PARTNER ADMIN AUDIT INSERT ERROR:", error);
}
