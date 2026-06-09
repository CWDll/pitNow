BEGIN;

ALTER TABLE checkouts
  ADD COLUMN IF NOT EXISTS base_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS helper_verify_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS helper_verify_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_settlement numeric NOT NULL DEFAULT 0;

UPDATE checkouts co
SET
  base_price = r.total_price,
  helper_verify_requested = coalesce(r.helper_verify_requested, false),
  helper_verify_fee = coalesce(r.helper_verify_fee, 0),
  total_settlement = r.total_price + coalesce(co.extra_fee, 0)
FROM reservations r
WHERE co.reservation_id = r.id
  AND co.base_price = 0
  AND co.total_settlement = 0;

COMMIT;
