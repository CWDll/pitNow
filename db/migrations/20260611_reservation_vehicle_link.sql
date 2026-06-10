BEGIN;

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES vehicles(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_reservations_vehicle
  ON reservations(vehicle_id);

COMMIT;
