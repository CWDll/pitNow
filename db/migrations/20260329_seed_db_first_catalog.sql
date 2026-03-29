BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  lat float8,
  lng float8,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES partners(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bays_partner ON bays(partner_id);

CREATE TABLE IF NOT EXISTS service_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  duration_minutes int NOT NULL CHECK (duration_minutes > 0),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_package_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES service_packages(id) ON DELETE CASCADE,
  labor_price numeric NOT NULL CHECK (labor_price >= 0),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (partner_id, package_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_package_prices_partner
  ON partner_package_prices(partner_id);

CREATE TABLE IF NOT EXISTS self_maintenance_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  is_legal boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  helper_verify_unit_fee numeric NOT NULL DEFAULT 2000,
  created_at timestamptz DEFAULT now()
);

INSERT INTO partners (id, name, address, lat, lng)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    '강남 셀프정비소',
    '서울 강남구 테헤란로 123',
    37.5000,
    127.0350
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '서초 DIY 개러지',
    '서울 서초구 반포대로 42',
    37.4920,
    127.0120
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '송파 스마트 정비소',
    '서울 송파구 올림픽로 300',
    37.5130,
    127.1020
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '마포 스피드 개러지',
    '서울 마포구 월드컵북로 55',
    37.5670,
    126.9010
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    '성수 프리미엄 모터스',
    '서울 성동구 성수이로 77',
    37.5440,
    127.0550
  )
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng;

INSERT INTO bays (id, partner_id, name, is_active)
VALUES
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '1번 베이', true),
  ('00000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '2번 베이', true),
  ('00000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '3번 베이', true),
  ('00000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '4번 베이', true),
  ('00000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', '5번 베이', true),
  ('00000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', '6번 베이', true),
  ('00000000-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222222', '1번 베이', true),
  ('00000000-0000-0000-0000-000000000008', '22222222-2222-2222-2222-222222222222', '2번 베이', true),
  ('00000000-0000-0000-0000-000000000009', '22222222-2222-2222-2222-222222222222', '3번 베이', true),
  ('00000000-0000-0000-0000-00000000000a', '22222222-2222-2222-2222-222222222222', '4번 베이', true),
  ('00000000-0000-0000-0000-00000000000b', '33333333-3333-3333-3333-333333333333', '1번 베이', true),
  ('00000000-0000-0000-0000-00000000000c', '33333333-3333-3333-3333-333333333333', '2번 베이', true),
  ('00000000-0000-0000-0000-00000000000d', '33333333-3333-3333-3333-333333333333', '3번 베이', true),
  ('00000000-0000-0000-0000-00000000000e', '33333333-3333-3333-3333-333333333333', '4번 베이', true),
  ('00000000-0000-0000-0000-00000000000f', '33333333-3333-3333-3333-333333333333', '5번 베이', true),
  ('00000000-0000-0000-0000-000000000010', '44444444-4444-4444-4444-444444444444', '1번 베이', true),
  ('00000000-0000-0000-0000-000000000011', '44444444-4444-4444-4444-444444444444', '2번 베이', true),
  ('00000000-0000-0000-0000-000000000012', '44444444-4444-4444-4444-444444444444', '3번 베이', true),
  ('00000000-0000-0000-0000-000000000013', '55555555-5555-5555-5555-555555555555', '1번 베이', true),
  ('00000000-0000-0000-0000-000000000014', '55555555-5555-5555-5555-555555555555', '2번 베이', true),
  ('00000000-0000-0000-0000-000000000015', '55555555-5555-5555-5555-555555555555', '3번 베이', true),
  ('00000000-0000-0000-0000-000000000016', '55555555-5555-5555-5555-555555555555', '4번 베이', true),
  ('00000000-0000-0000-0000-000000000017', '55555555-5555-5555-5555-555555555555', '5번 베이', true),
  ('00000000-0000-0000-0000-000000000018', '55555555-5555-5555-5555-555555555555', '6번 베이', true),
  ('00000000-0000-0000-0000-000000000019', '55555555-5555-5555-5555-555555555555', '7번 베이', true)
ON CONFLICT (id) DO UPDATE
SET
  partner_id = EXCLUDED.partner_id,
  name = EXCLUDED.name,
  is_active = EXCLUDED.is_active;

INSERT INTO service_packages (id, code, name, description, duration_minutes, is_active)
VALUES
  (
    '90000000-0000-0000-0000-000000000001',
    'pkg-engine-basic',
    '엔진오일 패키지',
    '엔진오일 + 필터 교체',
    90,
    true
  ),
  (
    '90000000-0000-0000-0000-000000000002',
    'pkg-brake-care',
    '브레이크 케어',
    '브레이크 패드/디스크 점검 및 교체',
    120,
    true
  ),
  (
    '90000000-0000-0000-0000-000000000003',
    'pkg-battery-check',
    '배터리 점검/교체',
    '배터리 상태 진단 + 교체 + 충전 시스템 체크',
    60,
    true
  ),
  (
    '90000000-0000-0000-0000-000000000004',
    'pkg-tire-care',
    '타이어 케어',
    '타이어 위치교환 + 밸런스 + 공기압 점검',
    90,
    true
  ),
  (
    '90000000-0000-0000-0000-000000000005',
    'pkg-coolant-flush',
    '냉각수 플러시',
    '냉각수 순환라인 점검 + 냉각수 교체',
    120,
    true
  ),
  (
    '90000000-0000-0000-0000-000000000006',
    'pkg-ac-maintenance',
    '에어컨 정비',
    '에어컨 필터 + 냉매량 점검 + 냄새 제거',
    75,
    true
  ),
  (
    '90000000-0000-0000-0000-000000000007',
    'pkg-wash-detailing',
    '세차/디테일링',
    '실내외 세차 + 기본 코팅',
    90,
    true
  )
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  duration_minutes = EXCLUDED.duration_minutes,
  is_active = EXCLUDED.is_active;

INSERT INTO partner_package_prices (partner_id, package_id, labor_price, is_active)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    (SELECT id FROM service_packages WHERE code = 'pkg-engine-basic'),
    69000,
    true
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    (SELECT id FROM service_packages WHERE code = 'pkg-brake-care'),
    119000,
    true
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    (SELECT id FROM service_packages WHERE code = 'pkg-engine-basic'),
    64000,
    true
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    (SELECT id FROM service_packages WHERE code = 'pkg-brake-care'),
    109000,
    true
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    (SELECT id FROM service_packages WHERE code = 'pkg-battery-check'),
    89000,
    true
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    (SELECT id FROM service_packages WHERE code = 'pkg-tire-care'),
    79000,
    true
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    (SELECT id FROM service_packages WHERE code = 'pkg-coolant-flush'),
    99000,
    true
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    (SELECT id FROM service_packages WHERE code = 'pkg-ac-maintenance'),
    85000,
    true
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    (SELECT id FROM service_packages WHERE code = 'pkg-battery-check'),
    92000,
    true
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    (SELECT id FROM service_packages WHERE code = 'pkg-wash-detailing'),
    68000,
    true
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    (SELECT id FROM service_packages WHERE code = 'pkg-brake-care'),
    129000,
    true
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    (SELECT id FROM service_packages WHERE code = 'pkg-engine-basic'),
    75000,
    true
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    (SELECT id FROM service_packages WHERE code = 'pkg-brake-care'),
    139000,
    true
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    (SELECT id FROM service_packages WHERE code = 'pkg-tire-care'),
    88000,
    true
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    (SELECT id FROM service_packages WHERE code = 'pkg-coolant-flush'),
    112000,
    true
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    (SELECT id FROM service_packages WHERE code = 'pkg-wash-detailing'),
    72000,
    true
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    (SELECT id FROM service_packages WHERE code = 'pkg-ac-maintenance'),
    93000,
    true
  )
ON CONFLICT (partner_id, package_id) DO UPDATE
SET
  labor_price = EXCLUDED.labor_price,
  is_active = EXCLUDED.is_active;

INSERT INTO self_maintenance_tasks (code, name, is_legal, is_active, helper_verify_unit_fee)
VALUES
  ('engine-oil', '엔진오일 교환', true, true, 2000),
  ('brake-pad', '브레이크 패드 교환', true, true, 3000),
  ('tire-rotation', '타이어 로테이션', true, true, 2000),
  ('air-filter', '에어필터 교환', true, true, 1500),
  ('wiper', '와이퍼 블레이드 교체', true, true, 1000)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  is_legal = EXCLUDED.is_legal,
  is_active = EXCLUDED.is_active,
  helper_verify_unit_fee = EXCLUDED.helper_verify_unit_fee;

COMMIT;
