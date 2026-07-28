BEGIN;

DO $$
DECLARE
  constraint_name text;
  status_attnum smallint;
BEGIN
  SELECT attnum
  INTO status_attnum
  FROM pg_attribute
  WHERE attrelid = 'reservations'::regclass
    AND attname = 'status'
    AND NOT attisdropped;

  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'reservations'::regclass
      AND contype = 'c'
      AND status_attnum = ANY (conkey)
  LOOP
    EXECUTE format(
      'ALTER TABLE reservations DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_status_check
  CHECK (
    status IN (
      'CONFIRMED',
      'CHECKED_IN',
      'IN_USE',
      'COMPLETED',
      'CANCELLED',
      'NO_SHOW'
    )
  );

DO $$
DECLARE
  constraint_name text;
  from_status_attnum smallint;
  to_status_attnum smallint;
BEGIN
  SELECT attnum
  INTO from_status_attnum
  FROM pg_attribute
  WHERE attrelid = 'reservation_status_logs'::regclass
    AND attname = 'from_status'
    AND NOT attisdropped;

  SELECT attnum
  INTO to_status_attnum
  FROM pg_attribute
  WHERE attrelid = 'reservation_status_logs'::regclass
    AND attname = 'to_status'
    AND NOT attisdropped;

  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'reservation_status_logs'::regclass
      AND contype = 'c'
      AND (
        from_status_attnum = ANY (conkey)
        OR to_status_attnum = ANY (conkey)
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE reservation_status_logs DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE reservation_status_logs
  ADD CONSTRAINT reservation_status_logs_from_status_check
  CHECK (
    from_status IS NULL
    OR from_status IN (
      'CONFIRMED',
      'CHECKED_IN',
      'IN_USE',
      'COMPLETED',
      'CANCELLED',
      'NO_SHOW'
    )
  ),
  ADD CONSTRAINT reservation_status_logs_to_status_check
  CHECK (
    to_status IN (
      'CONFIRMED',
      'CHECKED_IN',
      'IN_USE',
      'COMPLETED',
      'CANCELLED',
      'NO_SHOW'
    )
  );

-- Legacy reservations created before hourly booking hardening can have
-- non-hour durations. A NOT VALID check still runs when those rows are
-- updated, so temporarily remove it while changing status only.
ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS chk_reservation_hour_unit;

WITH expired_reservations AS (
  SELECT id, end_time
  FROM reservations
  WHERE status = 'CONFIRMED'
    AND end_time <= now()
),
inserted_logs AS (
  INSERT INTO reservation_status_logs (
    reservation_id,
    from_status,
    to_status,
    actor_type,
    reason,
    metadata
  )
  SELECT
    id,
    'CONFIRMED',
    'NO_SHOW',
    'SYSTEM',
    'reservation_no_show_migration_backfill',
    jsonb_build_object(
      'autoExpired',
      true,
      'endTime',
      end_time,
      'evaluatedAt',
      now()
    )
  FROM expired_reservations
  RETURNING reservation_id
)
UPDATE reservations AS reservation
SET status = 'NO_SHOW'
FROM inserted_logs
WHERE reservation.id = inserted_logs.reservation_id
  AND reservation.status = 'CONFIRMED';

ALTER TABLE reservations
  ADD CONSTRAINT chk_reservation_hour_unit
  CHECK (
    EXTRACT(EPOCH FROM (end_time - start_time)) >= 3600
    AND MOD(EXTRACT(EPOCH FROM (end_time - start_time))::integer, 3600) = 0
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_reservations_confirmed_end_time
  ON reservations(end_time)
  WHERE status = 'CONFIRMED';

COMMIT;
