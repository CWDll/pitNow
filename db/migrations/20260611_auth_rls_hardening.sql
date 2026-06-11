BEGIN;

-- Safety net for environments that applied the early storage migration before
-- the Auth/RLS foundation. Photo writes must require an authenticated owner.
DROP POLICY IF EXISTS reservation_photos_anon_insert ON storage.objects;
DROP POLICY IF EXISTS reservation_photos_authenticated_insert ON storage.objects;

CREATE POLICY reservation_photos_authenticated_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'reservation-photos'
    AND (storage.foldername(name))[1] IN ('checkin', 'checkout')
    AND EXISTS (
      SELECT 1
      FROM reservations r
      WHERE r.id::text = (storage.foldername(name))[2]
        AND r.user_id = auth.uid()
    )
  );

COMMIT;
