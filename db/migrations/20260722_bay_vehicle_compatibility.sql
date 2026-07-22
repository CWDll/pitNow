-- Existing bays remain unrestricted until a partner admin sets limits.
ALTER TABLE public.bays
  ADD COLUMN IF NOT EXISTS allowed_vehicle_types text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS max_vehicle_weight_kg integer;

ALTER TABLE public.bays
  DROP CONSTRAINT IF EXISTS bays_allowed_vehicle_types_check,
  ADD CONSTRAINT bays_allowed_vehicle_types_check CHECK (
    allowed_vehicle_types <@ ARRAY[
      '경차', '세단', 'SUV', '해치백', '왜건', '쿠페', '컨버터블',
      '미니밴/MPV', '승합차', '픽업트럭', '소형 화물차', '기타'
    ]::text[]
  ),
  DROP CONSTRAINT IF EXISTS bays_max_vehicle_weight_kg_check,
  ADD CONSTRAINT bays_max_vehicle_weight_kg_check CHECK (
    max_vehicle_weight_kg IS NULL OR max_vehicle_weight_kg > 0
  );

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS vehicle_weight_kg integer;

ALTER TABLE public.vehicles
  DROP CONSTRAINT IF EXISTS vehicles_vehicle_weight_kg_check,
  ADD CONSTRAINT vehicles_vehicle_weight_kg_check CHECK (
    vehicle_weight_kg IS NULL OR vehicle_weight_kg > 0
  );

COMMENT ON COLUMN public.bays.allowed_vehicle_types IS
  'Empty array means all vehicle types are allowed.';
COMMENT ON COLUMN public.bays.max_vehicle_weight_kg IS
  'NULL means no vehicle weight limit.';
COMMENT ON COLUMN public.vehicles.vehicle_weight_kg IS
  'Vehicle curb weight in kilograms. Required only for weight-restricted bays.';
