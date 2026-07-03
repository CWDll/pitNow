BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS admin_package_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES partners(id) ON DELETE SET NULL,
  package_id uuid REFERENCES service_packages(id) ON DELETE SET NULL,
  price_id uuid REFERENCES partner_package_prices(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (
    action IN (
      'SERVICE_PACKAGE_CREATED',
      'SERVICE_PACKAGE_UPDATED',
      'PARTNER_PACKAGE_PRICE_UPSERTED',
      'PARTNER_PACKAGE_PRICE_UPDATED'
    )
  ),
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_package_audit_logs_partner
  ON admin_package_audit_logs(partner_id, created_at DESC)
  WHERE partner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_package_audit_logs_package
  ON admin_package_audit_logs(package_id, created_at DESC)
  WHERE package_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_package_audit_logs_price
  ON admin_package_audit_logs(price_id, created_at DESC)
  WHERE price_id IS NOT NULL;

ALTER TABLE admin_package_audit_logs ENABLE ROW LEVEL SECURITY;

COMMIT;
