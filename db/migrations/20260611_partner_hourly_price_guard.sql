BEGIN;

ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS hourly_price numeric;

UPDATE partners
   SET hourly_price = 15000
 WHERE hourly_price IS NULL
    OR hourly_price <= 0;

ALTER TABLE partners
  ALTER COLUMN hourly_price SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'chk_partners_hourly_price_positive'
       AND conrelid = 'partners'::regclass
  ) THEN
    ALTER TABLE partners
      ADD CONSTRAINT chk_partners_hourly_price_positive
      CHECK (hourly_price > 0);
  END IF;
END;
$$;

COMMIT;
