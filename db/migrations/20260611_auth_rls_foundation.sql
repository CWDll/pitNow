BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'ADMIN' CHECK (role IN ('ADMIN')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reservation_status_logs
  ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reservation_status_logs_actor_user
  ON reservation_status_logs(actor_user_id, created_at);

ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE bays ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_package_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE self_maintenance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE self_task_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_status_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partners_public_read ON partners;
CREATE POLICY partners_public_read
  ON partners
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS bays_public_read ON bays;
CREATE POLICY bays_public_read
  ON bays
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS service_packages_public_read ON service_packages;
CREATE POLICY service_packages_public_read
  ON service_packages
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS partner_package_prices_public_read ON partner_package_prices;
CREATE POLICY partner_package_prices_public_read
  ON partner_package_prices
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS self_maintenance_tasks_public_read ON self_maintenance_tasks;
CREATE POLICY self_maintenance_tasks_public_read
  ON self_maintenance_tasks
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS reservations_owner_select ON reservations;
CREATE POLICY reservations_owner_select
  ON reservations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS reservations_owner_insert ON reservations;
CREATE POLICY reservations_owner_insert
  ON reservations
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS reservations_owner_update ON reservations;
CREATE POLICY reservations_owner_update
  ON reservations
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS reservations_owner_delete ON reservations;
CREATE POLICY reservations_owner_delete
  ON reservations
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS reservation_tasks_owner_select ON reservation_tasks;
CREATE POLICY reservation_tasks_owner_select
  ON reservation_tasks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM reservations r
      WHERE r.id = reservation_tasks.reservation_id
        AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS reservation_tasks_owner_insert ON reservation_tasks;
CREATE POLICY reservation_tasks_owner_insert
  ON reservation_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM reservations r
      WHERE r.id = reservation_tasks.reservation_id
        AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS reservation_tasks_owner_delete ON reservation_tasks;
CREATE POLICY reservation_tasks_owner_delete
  ON reservation_tasks
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM reservations r
      WHERE r.id = reservation_tasks.reservation_id
        AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS self_task_agreements_owner_all ON self_task_agreements;
CREATE POLICY self_task_agreements_owner_all
  ON self_task_agreements
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM reservations r
      WHERE r.id = self_task_agreements.reservation_id
        AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM reservations r
      WHERE r.id = self_task_agreements.reservation_id
        AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS checkins_owner_all ON checkins;
CREATE POLICY checkins_owner_all
  ON checkins
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM reservations r
      WHERE r.id = checkins.reservation_id
        AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM reservations r
      WHERE r.id = checkins.reservation_id
        AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS checkouts_owner_all ON checkouts;
CREATE POLICY checkouts_owner_all
  ON checkouts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM reservations r
      WHERE r.id = checkouts.reservation_id
        AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM reservations r
      WHERE r.id = checkouts.reservation_id
        AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS reviews_public_read ON reviews;
CREATE POLICY reviews_public_read
  ON reviews
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS reviews_owner_insert ON reviews;
CREATE POLICY reviews_owner_insert
  ON reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS reviews_owner_update ON reviews;
CREATE POLICY reviews_owner_update
  ON reviews
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS reservation_status_logs_owner_select ON reservation_status_logs;
CREATE POLICY reservation_status_logs_owner_select
  ON reservation_status_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM reservations r
      WHERE r.id = reservation_status_logs.reservation_id
        AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS reservation_status_logs_owner_insert ON reservation_status_logs;
CREATE POLICY reservation_status_logs_owner_insert
  ON reservation_status_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM reservations r
      WHERE r.id = reservation_status_logs.reservation_id
        AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS admin_users_self_read ON admin_users;
CREATE POLICY admin_users_self_read
  ON admin_users
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

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
