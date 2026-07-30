BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE self_maintenance_tasks
  ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'BEGINNER'
    CHECK (difficulty IN ('BEGINNER', 'INTERMEDIATE')),
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

UPDATE self_maintenance_tasks
SET
  difficulty = catalog.difficulty,
  description = catalog.description,
  sort_order = catalog.sort_order
FROM (
  VALUES
    ('engine-oil', 'BEGINNER', '오일 배출, 필터 교체, 새 오일 주입 작업', 10),
    ('brake-pad', 'INTERMEDIATE', '캘리퍼 분리, 패드 교체, 재조립 작업', 20),
    ('tire-rotation', 'BEGINNER', '차량 기준에 맞춰 타이어 장착 위치를 교환하는 작업', 30),
    ('air-filter', 'BEGINNER', '에어클리너 커버를 열고 필터를 교체하는 작업', 40),
    ('wiper', 'BEGINNER', '기존 와이퍼 블레이드를 분리하고 새 부품을 장착하는 작업', 50)
) AS catalog(code, difficulty, description, sort_order)
WHERE self_maintenance_tasks.code = catalog.code;

CREATE TABLE IF NOT EXISTS self_task_check_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES self_maintenance_tasks(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (length(trim(label)) > 0),
  sort_order integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, label)
);

CREATE INDEX IF NOT EXISTS idx_self_task_check_items_task
  ON self_task_check_items(task_id, sort_order)
  WHERE is_active = true;

INSERT INTO self_task_check_items (task_id, label, sort_order)
SELECT task.id, item.label, item.sort_order
FROM self_maintenance_tasks task
JOIN (
  VALUES
    ('engine-oil', '드레인볼트 체결 상태', 10),
    ('engine-oil', '오일필터 체결 상태', 20),
    ('engine-oil', '엔진오일량', 30),
    ('engine-oil', '외부 누유 여부', 40),
    ('engine-oil', '관련 경고등 점등 여부', 50),
    ('brake-pad', '브레이크 패드 장착 상태', 10),
    ('brake-pad', '캘리퍼 체결 상태', 20),
    ('brake-pad', '휠 체결 상태', 30),
    ('brake-pad', '브레이크 페달 작동 상태', 40),
    ('brake-pad', '육안상 누유 또는 이상 여부', 50),
    ('tire-rotation', '타이어 장착 위치', 10),
    ('tire-rotation', '휠너트 체결 상태', 20),
    ('tire-rotation', '타이어 공기압', 30),
    ('tire-rotation', '육안상 장착 이상 여부', 40),
    ('air-filter', '필터 장착 방향', 10),
    ('air-filter', '에어클리너 커버 체결 상태', 20),
    ('wiper', '와이퍼 체결 상태', 10),
    ('wiper', '와이퍼 작동 여부', 20),
    ('wiper', '유리 간섭 여부', 30)
) AS item(task_code, label, sort_order)
  ON item.task_code = task.code
ON CONFLICT (task_id, label) DO UPDATE
SET
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

CREATE TABLE IF NOT EXISTS partner_self_task_check_settings (
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES self_maintenance_tasks(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_id, task_id)
);

INSERT INTO partner_self_task_check_settings (partner_id, task_id, is_enabled)
SELECT partner.id, task.id, true
FROM partners partner
CROSS JOIN self_maintenance_tasks task
WHERE task.is_active = true
ON CONFLICT (partner_id, task_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS self_safety_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  scope text NOT NULL CHECK (scope IN ('COMMON', 'TASK')),
  task_id uuid REFERENCES self_maintenance_tasks(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('CARD', 'VIDEO')),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  body text NOT NULL DEFAULT '',
  media_url text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  sort_order integer NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (scope = 'COMMON' AND task_id IS NULL)
    OR (scope = 'TASK' AND task_id IS NOT NULL)
  ),
  CHECK (content_type <> 'VIDEO' OR media_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_self_safety_contents_task
  ON self_safety_contents(task_id, sort_order)
  WHERE is_active = true;

INSERT INTO self_safety_contents (
  code,
  scope,
  task_id,
  content_type,
  title,
  body,
  version,
  sort_order,
  is_required
)
VALUES (
  'common-self-safety-v1',
  'COMMON',
  NULL,
  'CARD',
  'SELF 정비 공통 안전교육',
  E'리프트와 잭의 지지점 및 잠금 상태를 확인합니다.\n보호장비를 착용하고 화기와 인화성 물질을 반입하지 않습니다.\n폐유와 교체 부품은 지정 장소에 처리합니다.\n이상 상황이 발생하면 즉시 작업을 중단하고 현장 관리자를 호출합니다.',
  1,
  10,
  true
)
ON CONFLICT (code) DO UPDATE
SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  is_active = true,
  updated_at = now();

INSERT INTO self_safety_contents (
  code,
  scope,
  task_id,
  content_type,
  title,
  body,
  version,
  sort_order,
  is_required
)
SELECT
  safety.code,
  'TASK',
  task.id,
  'CARD',
  safety.title,
  safety.body,
  1,
  safety.sort_order,
  true
FROM self_maintenance_tasks task
JOIN (
  VALUES
    (
      'engine-oil-safety-v1',
      'engine-oil',
      '엔진오일 교환 안전수칙',
      E'엔진과 배기계가 충분히 식은 뒤 작업합니다.\n차량을 안전하게 지지하고 폐유 회수 용기를 사용합니다.\n제조사 지정 오일 규격과 용량은 사용자가 직접 확인합니다.',
      10
    ),
    (
      'brake-pad-safety-v1',
      'brake-pad',
      '브레이크 패드 교환 안전수칙',
      E'제동장치 작업 이해가 부족하면 진행하지 않습니다.\n차량과 휠을 안정적으로 지지합니다.\n브레이크 호스를 비틀거나 캘리퍼 무게를 호스에 걸지 않습니다.\n작업 후 저속 구간에서 제동 상태를 확인합니다.',
      20
    ),
    (
      'tire-rotation-safety-v1',
      'tire-rotation',
      '타이어 로테이션 안전수칙',
      E'차량을 평탄한 곳에서 안전하게 지지합니다.\n휠너트는 차량 제조사 지정 순서와 토크를 따릅니다.\n공기압은 차량 표기 기준을 사용합니다.',
      30
    ),
    (
      'air-filter-safety-v1',
      'air-filter',
      '에어필터 교환 안전수칙',
      E'시동을 끄고 엔진룸의 고온부에 주의합니다.\n필터 방향과 커버 고정클립 위치를 분리 전에 확인합니다.\n흡기구 안으로 이물질이 들어가지 않도록 합니다.',
      40
    ),
    (
      'wiper-safety-v1',
      'wiper',
      '와이퍼 블레이드 교체 안전수칙',
      E'와이퍼 암이 유리로 튕기지 않도록 손으로 지지합니다.\n규격과 좌우 위치를 확인합니다.\n장착 후 저속 작동으로 간섭과 이탈 여부를 확인합니다.',
      50
    )
) AS safety(code, task_code, title, body, sort_order)
  ON safety.task_code = task.code
ON CONFLICT (code) DO UPDATE
SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  task_id = EXCLUDED.task_id,
  is_active = true,
  updated_at = now();

CREATE TABLE IF NOT EXISTS user_safety_training_completions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES self_safety_contents(id) ON DELETE CASCADE,
  content_version integer NOT NULL CHECK (content_version > 0),
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, content_id, content_version)
);

ALTER TABLE self_task_agreements
  ADD COLUMN IF NOT EXISTS agreement_text text NOT NULL DEFAULT
    '선택한 작업만 수행하며 예약하지 않은 작업은 진행하지 않습니다.',
  ADD COLUMN IF NOT EXISTS agreement_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS safety_content_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE reservation_tasks
  ADD COLUMN IF NOT EXISTS work_check_unit_fee_snapshot numeric NOT NULL DEFAULT 0
    CHECK (work_check_unit_fee_snapshot >= 0),
  ADD COLUMN IF NOT EXISTS check_scope_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE reservation_tasks reservation_task
SET
  work_check_unit_fee_snapshot = task.helper_verify_unit_fee,
  check_scope_snapshot = COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', check_item.id,
          'label', check_item.label,
          'version', check_item.version,
          'sortOrder', check_item.sort_order
        )
        ORDER BY check_item.sort_order
      )
      FROM self_task_check_items check_item
      WHERE check_item.task_id = reservation_task.task_id
        AND check_item.is_active = true
    ),
    '[]'::jsonb
  )
FROM self_maintenance_tasks task
WHERE task.id = reservation_task.task_id
  AND reservation_task.check_scope_snapshot = '[]'::jsonb;

CREATE TABLE IF NOT EXISTS reservation_work_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid UNIQUE NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'RECORDED', 'NOT_PERFORMED')),
  prepaid_fee numeric NOT NULL DEFAULT 0 CHECK (prepaid_fee >= 0),
  summary_note text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservation_work_checks_partner_status
  ON reservation_work_checks(partner_id, status, created_at DESC);

INSERT INTO reservation_work_checks (
  reservation_id,
  partner_id,
  status,
  prepaid_fee
)
SELECT
  reservation.id,
  reservation.partner_id,
  'PENDING',
  reservation.helper_verify_fee
FROM reservations reservation
WHERE reservation.reservation_type = 'SELF_SERVICE'
  AND reservation.helper_verify_requested = true
ON CONFLICT (reservation_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS reservation_work_check_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_check_id uuid NOT NULL REFERENCES reservation_work_checks(id) ON DELETE CASCADE,
  reservation_task_id uuid NOT NULL REFERENCES reservation_tasks(id) ON DELETE CASCADE,
  check_item_id uuid REFERENCES self_task_check_items(id) ON DELETE SET NULL,
  item_label_snapshot text NOT NULL CHECK (length(trim(item_label_snapshot)) > 0),
  result text NOT NULL CHECK (
    result IN ('NO_ISSUE', 'ISSUE_FOUND', 'UNABLE_TO_CHECK')
  ),
  note text,
  check_round smallint NOT NULL DEFAULT 1 CHECK (check_round IN (1, 2)),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_check_id, reservation_task_id, check_item_id, check_round)
);

CREATE INDEX IF NOT EXISTS idx_work_check_results_work_check
  ON reservation_work_check_results(work_check_id, check_round, sort_order);

CREATE OR REPLACE FUNCTION validate_reservation_work_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  reservation_partner_id uuid;
  reservation_type_value text;
  requested boolean;
BEGIN
  SELECT partner_id, reservation_type, helper_verify_requested
  INTO reservation_partner_id, reservation_type_value, requested
  FROM reservations
  WHERE id = NEW.reservation_id;

  IF reservation_partner_id IS NULL THEN
    RAISE EXCEPTION 'reservation_not_found';
  END IF;

  IF reservation_partner_id <> NEW.partner_id THEN
    RAISE EXCEPTION 'work_check_partner_mismatch';
  END IF;

  IF reservation_type_value <> 'SELF_SERVICE' OR requested <> true THEN
    RAISE EXCEPTION 'work_check_not_requested';
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_reservation_work_check
  ON reservation_work_checks;
CREATE TRIGGER trg_validate_reservation_work_check
BEFORE INSERT OR UPDATE ON reservation_work_checks
FOR EACH ROW
EXECUTE FUNCTION validate_reservation_work_check();

ALTER TABLE self_task_check_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_self_task_check_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE self_safety_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_safety_training_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_work_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_work_check_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS self_task_check_items_public_read
  ON self_task_check_items;
CREATE POLICY self_task_check_items_public_read
  ON self_task_check_items
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS partner_self_task_check_settings_public_read
  ON partner_self_task_check_settings;
CREATE POLICY partner_self_task_check_settings_public_read
  ON partner_self_task_check_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS partner_self_task_check_settings_partner_update
  ON partner_self_task_check_settings;
CREATE POLICY partner_self_task_check_settings_partner_update
  ON partner_self_task_check_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = partner_self_task_check_settings.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = partner_self_task_check_settings.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS partner_self_task_check_settings_partner_insert
  ON partner_self_task_check_settings;
CREATE POLICY partner_self_task_check_settings_partner_insert
  ON partner_self_task_check_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = partner_self_task_check_settings.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS self_safety_contents_public_read
  ON self_safety_contents;
CREATE POLICY self_safety_contents_public_read
  ON self_safety_contents
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS user_safety_training_owner_all
  ON user_safety_training_completions;
CREATE POLICY user_safety_training_owner_all
  ON user_safety_training_completions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS reservation_work_checks_owner_select
  ON reservation_work_checks;
CREATE POLICY reservation_work_checks_owner_select
  ON reservation_work_checks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM reservations reservation
      WHERE reservation.id = reservation_work_checks.reservation_id
        AND reservation.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS reservation_work_checks_owner_insert
  ON reservation_work_checks;
CREATE POLICY reservation_work_checks_owner_insert
  ON reservation_work_checks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM reservations reservation
      WHERE reservation.id = reservation_work_checks.reservation_id
        AND reservation.user_id = auth.uid()
        AND reservation.partner_id = reservation_work_checks.partner_id
    )
  );

DROP POLICY IF EXISTS reservation_work_checks_partner_all
  ON reservation_work_checks;
CREATE POLICY reservation_work_checks_partner_all
  ON reservation_work_checks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = reservation_work_checks.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM partner_admins pa
      WHERE pa.partner_id = reservation_work_checks.partner_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS reservation_work_check_results_owner_select
  ON reservation_work_check_results;
CREATE POLICY reservation_work_check_results_owner_select
  ON reservation_work_check_results
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM reservation_work_checks work_check
      JOIN reservations reservation ON reservation.id = work_check.reservation_id
      WHERE work_check.id = reservation_work_check_results.work_check_id
        AND reservation.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS reservation_work_check_results_partner_all
  ON reservation_work_check_results;
CREATE POLICY reservation_work_check_results_partner_all
  ON reservation_work_check_results
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM reservation_work_checks work_check
      JOIN partner_admins pa ON pa.partner_id = work_check.partner_id
      WHERE work_check.id = reservation_work_check_results.work_check_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM reservation_work_checks work_check
      JOIN partner_admins pa ON pa.partner_id = work_check.partner_id
      WHERE work_check.id = reservation_work_check_results.work_check_id
        AND pa.user_id = auth.uid()
        AND pa.is_active = true
    )
  );

COMMIT;
