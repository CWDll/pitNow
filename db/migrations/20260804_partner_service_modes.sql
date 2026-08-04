BEGIN;

ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS supports_self_service boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS supports_shop_service boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN partners.supports_self_service IS
  'Whether the partner accepts user-performed SELF reservations.';
COMMENT ON COLUMN partners.supports_shop_service IS
  'Whether the partner accepts partner-performed SHOP package reservations.';

-- Public sample partners exercise both single-mode cases during release QA.
UPDATE partners
SET supports_shop_service = false
WHERE id = '22222222-2222-2222-2222-222222222222';

UPDATE partners
SET supports_self_service = false
WHERE id = '33333333-3333-3333-3333-333333333333';

COMMIT;
