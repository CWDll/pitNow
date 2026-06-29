BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS partner_admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (
    action IN (
      'BAY_ACTIVE_UPDATED',
      'AVAILABILITY_BLOCK_CREATED',
      'AVAILABILITY_BLOCK_UPDATED',
      'AVAILABILITY_BLOCK_DEACTIVATED',
      'AVAILABILITY_BLOCK_REACTIVATED',
      'RESERVATION_NOTE_CREATED',
      'RESERVATION_NOTE_RESOLVED',
      'RESERVATION_NOTE_REOPENED'
    )
  ),
  target_type text NOT NULL CHECK (
    target_type IN (
      'BAY',
      'AVAILABILITY_BLOCK',
      'RESERVATION_NOTE'
    )
  ),
  target_id uuid NOT NULL,
  reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_admin_audit_logs_partner
  ON partner_admin_audit_logs(partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_admin_audit_logs_actor
  ON partner_admin_audit_logs(actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_admin_audit_logs_target
  ON partner_admin_audit_logs(target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_admin_audit_logs_reservation
  ON partner_admin_audit_logs(reservation_id, created_at DESC)
  WHERE reservation_id IS NOT NULL;

ALTER TABLE partner_admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_admin_audit_logs_partner_admin_select
  ON partner_admin_audit_logs;
CREATE POLICY partner_admin_audit_logs_partner_admin_select
  ON partner_admin_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = partner_admin_audit_logs.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS partner_admin_audit_logs_partner_admin_insert
  ON partner_admin_audit_logs;
CREATE POLICY partner_admin_audit_logs_partner_admin_insert
  ON partner_admin_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = partner_admin_audit_logs.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

COMMIT;
