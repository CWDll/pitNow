BEGIN;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'reservation-photos',
  'reservation-photos',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'reservation_photos_public_read'
  ) THEN
    CREATE POLICY reservation_photos_public_read
      ON storage.objects
      FOR SELECT
      TO anon, authenticated
      USING (bucket_id = 'reservation-photos');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'reservation_photos_anon_insert'
  ) THEN
    CREATE POLICY reservation_photos_anon_insert
      ON storage.objects
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (bucket_id = 'reservation-photos');
  END IF;
END$$;

ALTER TABLE checkouts
  ADD COLUMN IF NOT EXISTS tool_check_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cleaning_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS waste_disposal_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checkout_photo_1 text,
  ADD COLUMN IF NOT EXISTS checkout_photo_2 text;

COMMIT;
