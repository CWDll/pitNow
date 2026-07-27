BEGIN;

CREATE TABLE IF NOT EXISTS partner_checkin_credentials (
  partner_id uuid PRIMARY KEY REFERENCES partners(id) ON DELETE CASCADE,
  qr_token text NOT NULL UNIQUE,
  manual_code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  rotated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(qr_token) >= 32),
  CHECK (manual_code ~ '^PIT-[A-Z0-9]{4}-[A-Z0-9]{4}$')
);

CREATE TABLE IF NOT EXISTS reservation_checkin_verifications (
  reservation_id uuid PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('QR', 'MANUAL_CODE')),
  verified_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  verified_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservation_checkin_verifications_partner
  ON reservation_checkin_verifications(partner_id, verified_at DESC);

ALTER TABLE partner_checkin_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_checkin_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_checkin_credentials_partner_admin_select
  ON partner_checkin_credentials;
CREATE POLICY partner_checkin_credentials_partner_admin_select
  ON partner_checkin_credentials
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = partner_checkin_credentials.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS reservation_checkin_verifications_owner_select
  ON reservation_checkin_verifications;
CREATE POLICY reservation_checkin_verifications_owner_select
  ON reservation_checkin_verifications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM reservations r
      WHERE r.id = reservation_checkin_verifications.reservation_id
        AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS reservation_checkin_verifications_partner_admin_select
  ON reservation_checkin_verifications;
CREATE POLICY reservation_checkin_verifications_partner_admin_select
  ON reservation_checkin_verifications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = reservation_checkin_verifications.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

ALTER TABLE partner_admin_audit_logs
  DROP CONSTRAINT IF EXISTS partner_admin_audit_logs_action_check;

ALTER TABLE partner_admin_audit_logs
  ADD CONSTRAINT partner_admin_audit_logs_action_check CHECK (
    action IN (
      'BAY_ACTIVE_UPDATED',
      'BAY_COMPATIBILITY_UPDATED',
      'AVAILABILITY_BLOCK_CREATED',
      'AVAILABILITY_BLOCK_UPDATED',
      'AVAILABILITY_BLOCK_DEACTIVATED',
      'AVAILABILITY_BLOCK_REACTIVATED',
      'RESERVATION_NOTE_CREATED',
      'RESERVATION_NOTE_RESOLVED',
      'RESERVATION_NOTE_REOPENED',
      'PARTNER_IMAGE_CREATED',
      'PARTNER_IMAGE_COVER_UPDATED',
      'PARTNER_IMAGE_DELETED',
      'CHECKIN_CREDENTIAL_ROTATED',
      'SHOP_WORK_STARTED',
      'SHOP_WORK_COMPLETED'
    )
  );

ALTER TABLE partner_admin_audit_logs
  DROP CONSTRAINT IF EXISTS partner_admin_audit_logs_target_type_check;

ALTER TABLE partner_admin_audit_logs
  ADD CONSTRAINT partner_admin_audit_logs_target_type_check CHECK (
    target_type IN (
      'BAY',
      'AVAILABILITY_BLOCK',
      'RESERVATION_NOTE',
      'PARTNER_IMAGE',
      'CHECKIN_CREDENTIAL',
      'RESERVATION'
    )
  );

COMMIT;
