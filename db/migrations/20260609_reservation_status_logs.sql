BEGIN;

CREATE TABLE IF NOT EXISTS reservation_status_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL CHECK (
    to_status IN (
      'CONFIRMED',
      'CHECKED_IN',
      'IN_USE',
      'COMPLETED',
      'CANCELLED'
    )
  ),
  actor_type text NOT NULL DEFAULT 'SYSTEM' CHECK (
    actor_type IN ('SYSTEM', 'USER', 'PARTNER', 'ADMIN')
  ),
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    from_status IS NULL
    OR from_status IN (
      'CONFIRMED',
      'CHECKED_IN',
      'IN_USE',
      'COMPLETED',
      'CANCELLED'
    )
  )
);

ALTER TABLE reservation_status_logs DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_reservation_status_logs_reservation
  ON reservation_status_logs(reservation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_reservation_status_logs_transition
  ON reservation_status_logs(from_status, to_status);

COMMIT;
