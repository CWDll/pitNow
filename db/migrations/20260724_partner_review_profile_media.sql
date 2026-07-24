BEGIN;

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname text NOT NULL,
  full_name text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(nickname) BETWEEN 2 AND 20),
  CHECK (full_name IS NULL OR char_length(full_name) BETWEEN 1 AND 50),
  CHECK (phone IS NULL OR char_length(phone) BETWEEN 8 AND 20)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_nickname_lower
  ON user_profiles(lower(nickname));

CREATE OR REPLACE FUNCTION make_default_pitnow_nickname(p_user_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'PitNow 드라이버 ' ||
    upper(substr(replace(p_user_id::text, '-', ''), 1, 8));
$$;

INSERT INTO user_profiles (user_id, nickname)
SELECT id, make_default_pitnow_nickname(id)
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION handle_new_pitnow_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_profiles (user_id, nickname)
  VALUES (NEW.id, make_default_pitnow_nickname(NEW.id))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_pitnow_user_profile ON auth.users;
CREATE TRIGGER trg_create_pitnow_user_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION handle_new_pitnow_user_profile();

CREATE OR REPLACE FUNCTION touch_user_profile_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_user_profile_updated_at ON user_profiles;
CREATE TRIGGER trg_touch_user_profile_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION touch_user_profile_updated_at();

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_profiles_owner_select ON user_profiles;
CREATE POLICY user_profiles_owner_select
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_profiles_owner_update ON user_profiles;
CREATE POLICY user_profiles_owner_update
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS partner_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_cover boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_images_partner_sort
  ON partner_images(partner_id, sort_order, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_images_one_cover
  ON partner_images(partner_id)
  WHERE is_cover = true;

ALTER TABLE partner_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_images_public_select ON partner_images;
CREATE POLICY partner_images_public_select
  ON partner_images
  FOR SELECT
  TO anon, authenticated
  USING (true);

ALTER TABLE partner_admin_audit_logs
  DROP CONSTRAINT IF EXISTS partner_admin_audit_logs_action_check;

ALTER TABLE partner_admin_audit_logs
  ADD CONSTRAINT partner_admin_audit_logs_action_check CHECK (
    action IN (
      'BAY_ACTIVE_UPDATED',
      'BAY_COMPATIBILITY_UPDATED',
      'AVAILABILITY_BLOCK_CREATED',
      'AVAILABILITY_BLOCK_UPDATED',
      'AVAILABILITY_BLOCK_DEACTIVATED',
      'AVAILABILITY_BLOCK_REACTIVATED',
      'RESERVATION_NOTE_CREATED',
      'RESERVATION_NOTE_RESOLVED',
      'RESERVATION_NOTE_REOPENED',
      'PARTNER_IMAGE_CREATED',
      'PARTNER_IMAGE_COVER_UPDATED',
      'PARTNER_IMAGE_DELETED'
    )
  );

ALTER TABLE partner_admin_audit_logs
  DROP CONSTRAINT IF EXISTS partner_admin_audit_logs_target_type_check;

ALTER TABLE partner_admin_audit_logs
  ADD CONSTRAINT partner_admin_audit_logs_target_type_check CHECK (
    target_type IN (
      'BAY',
      'AVAILABILITY_BLOCK',
      'RESERVATION_NOTE',
      'PARTNER_IMAGE'
    )
  );

CREATE TABLE IF NOT EXISTS review_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_images_review_sort
  ON review_images(review_id, sort_order, created_at);

ALTER TABLE review_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS review_images_public_select ON review_images;
CREATE POLICY review_images_public_select
  ON review_images
  FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES
  (
    'partner-images',
    'partner-images',
    true,
    8388608,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  (
    'review-images',
    'review-images',
    true,
    8388608,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS partner_images_public_read ON storage.objects;
CREATE POLICY partner_images_public_read
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'partner-images');

DROP POLICY IF EXISTS review_images_public_read ON storage.objects;
CREATE POLICY review_images_public_read
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'review-images');

COMMIT;
