BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS blocked_until timestamptz,
  ADD COLUMN IF NOT EXISTS selected_task_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS helper_verify_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS helper_verify_fee numeric NOT NULL DEFAULT 0;

UPDATE reservations
SET blocked_until = end_time + interval '1 hour'
WHERE blocked_until IS NULL;

ALTER TABLE reservations
  ALTER COLUMN blocked_until SET NOT NULL;

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
        extract(epoch from (end_time - start_time)) >= 3600
        AND mod(extract(epoch from (end_time - start_time))::int, 3600) = 0
      ) NOT VALID;
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
    WHERE conname = 'chk_helper_verify_fee'
      AND conrelid = 'reservations'::regclass
  ) THEN
    ALTER TABLE reservations
      ADD CONSTRAINT chk_helper_verify_fee
      CHECK (
        (helper_verify_requested = false AND helper_verify_fee = 0)
        OR (helper_verify_requested = true AND helper_verify_fee >= 5000)
      );
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
    tstzrange(start_time, blocked_until) WITH &&
  ) WHERE (status IN ('CONFIRMED', 'CHECKED_IN', 'IN_USE'));

CREATE TABLE IF NOT EXISTS self_maintenance_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  is_legal boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  helper_verify_unit_fee numeric NOT NULL DEFAULT 2000,
  created_at timestamptz DEFAULT now()
);

INSERT INTO self_maintenance_tasks (code, name, is_legal, is_active, helper_verify_unit_fee)
VALUES
  ('engine-oil', '엔진오일 교환', true, true, 2000),
  ('brake-pad', '브레이크 패드 교환', true, true, 3000),
  ('tire-rotation', '타이어 로테이션', true, true, 2000),
  ('air-filter', '에어필터 교환', true, true, 1500),
  ('wiper', '와이퍼 블레이드 교체', true, true, 1000)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  is_legal = EXCLUDED.is_legal,
  is_active = EXCLUDED.is_active,
  helper_verify_unit_fee = EXCLUDED.helper_verify_unit_fee;

CREATE TABLE IF NOT EXISTS reservation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES self_maintenance_tasks(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (reservation_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_reservation_tasks_reservation ON reservation_tasks(reservation_id);

CREATE TABLE IF NOT EXISTS self_task_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid UNIQUE NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  agree_only_selected boolean NOT NULL,
  consent_method text NOT NULL CHECK (consent_method IN ('CHECKBOX', 'SIGNATURE')),
  signature_image_url text,
  agreed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (consent_method = 'CHECKBOX' AND signature_image_url IS NULL)
    OR (consent_method = 'SIGNATURE' AND signature_image_url IS NOT NULL)
  )
);

COMMIT;
