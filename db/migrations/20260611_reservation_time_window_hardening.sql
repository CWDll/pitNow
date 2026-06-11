BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES partners(id),
  ADD COLUMN IF NOT EXISTS reservation_type text,
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES service_packages(id),
  ADD COLUMN IF NOT EXISTS reserved_end_time timestamptz,
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reservations'
      AND column_name = 'package_id'
      AND udt_name <> 'uuid'
  ) THEN
    ALTER TABLE reservations
      ALTER COLUMN package_id TYPE uuid
      USING NULLIF(package_id::text, '')::uuid;
  END IF;
END$$;

UPDATE reservations r
SET partner_id = b.partner_id
FROM bays b
WHERE r.bay_id = b.id
  AND r.partner_id IS NULL;

UPDATE reservations
SET reservation_type = CASE
  WHEN EXISTS (
    SELECT 1
    FROM checkins c
    WHERE c.reservation_id = reservations.id
  ) THEN 'SELF_SERVICE'
  ELSE 'SHOP_SERVICE'
END
WHERE reservation_type IS NULL;

UPDATE reservations
SET
  reserved_end_time = COALESCE(reserved_end_time, end_time),
  duration_minutes = COALESCE(
    duration_minutes,
    GREATEST(60, ROUND(EXTRACT(EPOCH FROM (end_time - start_time)) / 60.0)::integer)
  ),
  blocked_until = end_time + interval '1 hour';

ALTER TABLE reservations
  ALTER COLUMN partner_id SET NOT NULL,
  ALTER COLUMN reservation_type SET NOT NULL,
  ALTER COLUMN reserved_end_time SET NOT NULL,
  ALTER COLUMN duration_minutes SET NOT NULL,
  ALTER COLUMN blocked_until SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reservations_package_id_fkey'
      AND conrelid = 'reservations'::regclass
  ) THEN
    ALTER TABLE reservations
      ADD CONSTRAINT reservations_package_id_fkey
      FOREIGN KEY (package_id) REFERENCES service_packages(id);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_reservation_hour_unit'
      AND conrelid = 'reservations'::regclass
  ) THEN
    ALTER TABLE reservations
      ADD CONSTRAINT chk_reservation_hour_unit
      CHECK (
        EXTRACT(EPOCH FROM (end_time - start_time)) >= 3600
        AND MOD(EXTRACT(EPOCH FROM (end_time - start_time))::integer, 3600) = 0
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_reservation_type'
      AND conrelid = 'reservations'::regclass
  ) THEN
    ALTER TABLE reservations
      ADD CONSTRAINT chk_reservation_type
      CHECK (reservation_type IN ('SELF_SERVICE', 'SHOP_SERVICE'));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_reservation_time_order'
      AND conrelid = 'reservations'::regclass
  ) THEN
    ALTER TABLE reservations
      ADD CONSTRAINT chk_reservation_time_order
      CHECK (end_time > start_time);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_blocked_until_buffer'
      AND conrelid = 'reservations'::regclass
  ) THEN
    ALTER TABLE reservations
      ADD CONSTRAINT chk_blocked_until_buffer
      CHECK (blocked_until = end_time + interval '1 hour');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_reserved_end_time_matches_end_time'
      AND conrelid = 'reservations'::regclass
  ) THEN
    ALTER TABLE reservations
      ADD CONSTRAINT chk_reserved_end_time_matches_end_time
      CHECK (reserved_end_time = end_time);
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'no_overlap'
      AND conrelid = 'reservations'::regclass
  ) THEN
    ALTER TABLE reservations DROP CONSTRAINT no_overlap;
  END IF;
END$$;

ALTER TABLE reservations
  ADD CONSTRAINT no_overlap
  EXCLUDE USING gist (
    bay_id WITH =,
    tstzrange(start_time, blocked_until, '[)') WITH &&
  ) WHERE (status IN ('CONFIRMED', 'CHECKED_IN', 'IN_USE'));

CREATE INDEX IF NOT EXISTS idx_reservations_active_window
  ON reservations(partner_id, bay_id, start_time, blocked_until)
  WHERE status IN ('CONFIRMED', 'CHECKED_IN', 'IN_USE');

COMMIT;
