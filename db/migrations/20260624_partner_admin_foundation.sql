BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS partner_admins (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'OWNER' CHECK (role IN ('OWNER', 'STAFF')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, partner_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_admins_partner
  ON partner_admins(partner_id, user_id)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS partner_availability_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  bay_id uuid REFERENCES bays(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at)
);

CREATE INDEX IF NOT EXISTS idx_partner_availability_blocks_partner_window
  ON partner_availability_blocks(partner_id, starts_at, ends_at)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_partner_availability_blocks_bay_window
  ON partner_availability_blocks(bay_id, starts_at, ends_at)
  WHERE is_active = true AND bay_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'partner_availability_blocks_no_same_scope_overlap'
      AND conrelid = 'partner_availability_blocks'::regclass
  ) THEN
    ALTER TABLE partner_availability_blocks
      ADD CONSTRAINT partner_availability_blocks_no_same_scope_overlap
      EXCLUDE USING gist (
        partner_id WITH =,
        coalesce(bay_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
      )
      WHERE (is_active = true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION validate_partner_availability_block()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  bay_partner_id uuid;
BEGIN
  IF NEW.bay_id IS NOT NULL THEN
    SELECT partner_id INTO bay_partner_id
    FROM bays
    WHERE id = NEW.bay_id;

    IF bay_partner_id IS NULL THEN
      RAISE EXCEPTION 'bay_not_found';
    END IF;

    IF bay_partner_id <> NEW.partner_id THEN
      RAISE EXCEPTION 'bay_partner_mismatch';
    END IF;
  END IF;

  IF NEW.is_active AND EXISTS (
    SELECT 1
    FROM partner_availability_blocks existing
    WHERE existing.id <> NEW.id
      AND existing.partner_id = NEW.partner_id
      AND existing.is_active = true
      AND (
        existing.bay_id IS NULL
        OR NEW.bay_id IS NULL
        OR existing.bay_id = NEW.bay_id
      )
      AND tstzrange(existing.starts_at, existing.ends_at, '[)')
        && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'partner_availability_block_overlap';
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_partner_availability_block
  ON partner_availability_blocks;

CREATE TRIGGER trg_validate_partner_availability_block
BEFORE INSERT OR UPDATE ON partner_availability_blocks
FOR EACH ROW
EXECUTE FUNCTION validate_partner_availability_block();

ALTER TABLE partner_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_availability_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_admins_self_select ON partner_admins;
CREATE POLICY partner_admins_self_select
  ON partner_admins
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS reservations_partner_admin_select ON reservations;
CREATE POLICY reservations_partner_admin_select
  ON reservations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = reservations.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS reservation_tasks_partner_admin_select ON reservation_tasks;
CREATE POLICY reservation_tasks_partner_admin_select
  ON reservation_tasks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM reservations r
      JOIN partner_admins pa ON pa.partner_id = r.partner_id
      WHERE r.id = reservation_tasks.reservation_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS checkins_partner_admin_select ON checkins;
CREATE POLICY checkins_partner_admin_select
  ON checkins
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM reservations r
      JOIN partner_admins pa ON pa.partner_id = r.partner_id
      WHERE r.id = checkins.reservation_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS checkouts_partner_admin_select ON checkouts;
CREATE POLICY checkouts_partner_admin_select
  ON checkouts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM reservations r
      JOIN partner_admins pa ON pa.partner_id = r.partner_id
      WHERE r.id = checkouts.reservation_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS reservation_status_logs_partner_admin_select ON reservation_status_logs;
CREATE POLICY reservation_status_logs_partner_admin_select
  ON reservation_status_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM reservations r
      JOIN partner_admins pa ON pa.partner_id = r.partner_id
      WHERE r.id = reservation_status_logs.reservation_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS bays_partner_admin_update ON bays;
CREATE POLICY bays_partner_admin_update
  ON bays
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = bays.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = bays.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS partner_availability_blocks_partner_admin_select
  ON partner_availability_blocks;
CREATE POLICY partner_availability_blocks_partner_admin_select
  ON partner_availability_blocks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = partner_availability_blocks.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS partner_availability_blocks_partner_admin_insert
  ON partner_availability_blocks;
CREATE POLICY partner_availability_blocks_partner_admin_insert
  ON partner_availability_blocks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = partner_availability_blocks.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS partner_availability_blocks_partner_admin_update
  ON partner_availability_blocks;
CREATE POLICY partner_availability_blocks_partner_admin_update
  ON partner_availability_blocks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = partner_availability_blocks.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = partner_availability_blocks.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS partner_availability_blocks_partner_admin_delete
  ON partner_availability_blocks;
CREATE POLICY partner_availability_blocks_partner_admin_delete
  ON partner_availability_blocks
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = partner_availability_blocks.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

COMMIT;
