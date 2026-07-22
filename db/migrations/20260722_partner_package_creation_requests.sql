BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS partner_package_creation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  requested_name text NOT NULL CHECK (length(trim(requested_name)) > 0),
  requested_description text,
  requested_duration_minutes integer NOT NULL CHECK (requested_duration_minutes > 0),
  requested_labor_price numeric NOT NULL CHECK (requested_labor_price >= 0),
  reason text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'FULFILLED', 'REJECTED')
  ),
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_package_creation_requests_partner
  ON partner_package_creation_requests(partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_package_creation_requests_status
  ON partner_package_creation_requests(status, created_at DESC);

ALTER TABLE partner_package_creation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_package_creation_requests_partner_admin_select
  ON partner_package_creation_requests;
CREATE POLICY partner_package_creation_requests_partner_admin_select
  ON partner_package_creation_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = partner_package_creation_requests.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS partner_package_creation_requests_partner_admin_insert
  ON partner_package_creation_requests;
CREATE POLICY partner_package_creation_requests_partner_admin_insert
  ON partner_package_creation_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = partner_package_creation_requests.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

COMMIT;
