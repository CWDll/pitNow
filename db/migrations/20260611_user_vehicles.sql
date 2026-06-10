BEGIN;

CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plate_number text NOT NULL,
  model text NOT NULL,
  year int NOT NULL CHECK (year >= 1990 AND year <= 2100),
  type_label text NOT NULL DEFAULT '세단',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_user_created
  ON vehicles(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicles_user_plate
  ON vehicles(user_id, plate_number);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicles_one_active_per_user
  ON vehicles(user_id)
  WHERE is_active = true;

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicles_owner_select ON vehicles;
CREATE POLICY vehicles_owner_select
  ON vehicles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS vehicles_owner_insert ON vehicles;
CREATE POLICY vehicles_owner_insert
  ON vehicles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS vehicles_owner_update ON vehicles;
CREATE POLICY vehicles_owner_update
  ON vehicles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS vehicles_owner_delete ON vehicles;
CREATE POLICY vehicles_owner_delete
  ON vehicles
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.set_active_vehicle(p_vehicle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  SELECT user_id
    INTO target_user_id
    FROM vehicles
   WHERE id = p_vehicle_id
     AND user_id = auth.uid();

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'vehicle not found'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE vehicles
     SET is_active = false,
         updated_at = now()
   WHERE user_id = target_user_id;

  UPDATE vehicles
     SET is_active = true,
         updated_at = now()
   WHERE id = p_vehicle_id
     AND user_id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_active_vehicle(uuid) TO authenticated;

COMMIT;
