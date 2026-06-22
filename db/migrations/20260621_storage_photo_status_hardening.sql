BEGIN;

-- Tighten reservation photo writes so authenticated users can only upload
-- evidence during the state where that evidence is expected.
DROP POLICY IF EXISTS reservation_photos_anon_insert ON storage.objects;
DROP POLICY IF EXISTS reservation_photos_authenticated_insert ON storage.objects;
DROP POLICY IF EXISTS reservation_photos_authenticated_checkin_insert ON storage.objects;
DROP POLICY IF EXISTS reservation_photos_authenticated_checkout_insert ON storage.objects;

CREATE POLICY reservation_photos_authenticated_checkin_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'reservation-photos'
    AND (storage.foldername(name))[1] = 'checkin'
    AND EXISTS (
      SELECT 1
      FROM public.reservations r
      WHERE r.id::text = (storage.foldername(name))[2]
        AND r.user_id = auth.uid()
        AND r.status = 'CONFIRMED'
    )
  );

CREATE POLICY reservation_photos_authenticated_checkout_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'reservation-photos'
    AND (storage.foldername(name))[1] = 'checkout'
    AND EXISTS (
      SELECT 1
      FROM public.reservations r
      WHERE r.id::text = (storage.foldername(name))[2]
        AND r.user_id = auth.uid()
        AND r.status IN ('CHECKED_IN', 'IN_USE')
    )
  );

COMMIT;
