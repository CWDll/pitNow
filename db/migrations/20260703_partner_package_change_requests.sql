BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS partner_package_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES service_packages(id) ON DELETE CASCADE,
  price_id uuid REFERENCES partner_package_prices(id) ON DELETE SET NULL,
  current_labor_price numeric NOT NULL CHECK (current_labor_price >= 0),
  requested_labor_price numeric NOT NULL CHECK (requested_labor_price >= 0),
  reason text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'APPROVED', 'REJECTED')
  ),
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_package_change_requests_partner
  ON partner_package_change_requests(partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_package_change_requests_status
  ON partner_package_change_requests(status, created_at DESC);

ALTER TABLE partner_package_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_package_change_requests_partner_admin_select
  ON partner_package_change_requests;
CREATE POLICY partner_package_change_requests_partner_admin_select
  ON partner_package_change_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = partner_package_change_requests.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS partner_package_change_requests_partner_admin_insert
  ON partner_package_change_requests;
CREATE POLICY partner_package_change_requests_partner_admin_insert
  ON partner_package_change_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = partner_package_change_requests.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

COMMIT;
