BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS partner_reservation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note_type text NOT NULL DEFAULT 'NOTE'
    CHECK (note_type IN ('NOTE', 'ISSUE', 'DELAY', 'NO_SHOW')),
  body text NOT NULL CHECK (length(trim(body)) > 0),
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (is_resolved = false AND resolved_at IS NULL AND resolved_by IS NULL)
    OR
    (is_resolved = true AND resolved_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_partner_reservation_notes_reservation
  ON partner_reservation_notes(reservation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_reservation_notes_partner
  ON partner_reservation_notes(partner_id, created_at DESC);

CREATE OR REPLACE FUNCTION validate_partner_reservation_note()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  reservation_partner_id uuid;
BEGIN
  SELECT partner_id INTO reservation_partner_id
  FROM reservations
  WHERE id = NEW.reservation_id;

  IF reservation_partner_id IS NULL THEN
    RAISE EXCEPTION 'reservation_not_found';
  END IF;

  IF reservation_partner_id <> NEW.partner_id THEN
    RAISE EXCEPTION 'reservation_partner_mismatch';
  END IF;

  NEW.body = trim(NEW.body);
  NEW.updated_at = now();

  IF NEW.is_resolved = false THEN
    NEW.resolved_at = NULL;
    NEW.resolved_by = NULL;
  END IF;

  IF NEW.is_resolved = true AND NEW.resolved_at IS NULL THEN
    NEW.resolved_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_partner_reservation_note
  ON partner_reservation_notes;

CREATE TRIGGER trg_validate_partner_reservation_note
BEFORE INSERT OR UPDATE ON partner_reservation_notes
FOR EACH ROW
EXECUTE FUNCTION validate_partner_reservation_note();

ALTER TABLE partner_reservation_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_reservation_notes_partner_admin_select
  ON partner_reservation_notes;
CREATE POLICY partner_reservation_notes_partner_admin_select
  ON partner_reservation_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = partner_reservation_notes.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS partner_reservation_notes_partner_admin_insert
  ON partner_reservation_notes;
CREATE POLICY partner_reservation_notes_partner_admin_insert
  ON partner_reservation_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = partner_reservation_notes.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS partner_reservation_notes_partner_admin_update
  ON partner_reservation_notes;
CREATE POLICY partner_reservation_notes_partner_admin_update
  ON partner_reservation_notes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = partner_reservation_notes.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = partner_reservation_notes.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

COMMIT;
