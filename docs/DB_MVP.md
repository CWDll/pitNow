개요

이 스키마는 다음을 기준으로 설계한다.
• Serverless 구조
• 단독 개발
• 예약 루프 검증
• 향후 Auth 확장 가능

모든 PK는 UUID.
모든 시간은 timestamptz.
예약 겹침 방지는 DB 레벨에서 강제한다.
Self 정비는 법적 허용 작업만 선택 가능해야 한다.

⸻

Extensions

create extension if not exists btree_gist;

````

---

## partners

```sql
create table partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  hourly_price numeric not null check (hourly_price > 0),
  lat float8,
  lng float8,
  created_at timestamptz default now()
);
````

---

## bays

```sql
create table bays (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references partners(id) on delete cascade,
  name text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

create index idx_bays_partner on bays(partner_id);
```

---

## partner_admins

Partner-side operator membership.

```sql
create table partner_admins (
  user_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null references partners(id) on delete cascade,
  role text not null default 'OWNER' check (role in ('OWNER', 'STAFF')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, partner_id)
);

create index idx_partner_admins_partner
  on partner_admins(partner_id, user_id)
  where is_active = true;
```

RLS:

- Authenticated users may select only their own `partner_admins` membership rows.
- Client-side insert/update/delete is not exposed in MVP.
- Internal admin/service role creates or disables memberships.

---

## partner_availability_blocks

Partner-managed bay or whole-shop blocked time.

```sql
create table partner_availability_blocks (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  bay_id uuid references bays(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

create index idx_partner_availability_blocks_partner_window
  on partner_availability_blocks(partner_id, starts_at, ends_at)
  where is_active = true;

create index idx_partner_availability_blocks_bay_window
  on partner_availability_blocks(bay_id, starts_at, ends_at)
  where is_active = true and bay_id is not null;
```

Rules:

- `bay_id = null` means the entire partner location is blocked.
- `bay_id` must belong to the same `partner_id`.
- Active blocks cannot overlap when they affect the same bay or when either block is whole-partner.
- Partner-admin can select/insert/update/delete blocks only for their own partner.
- Reservation prepare must reject any requested bay/time window overlapping an active block for that bay or the whole partner.

Migration:

- `db/migrations/20260624_partner_admin_foundation.sql`

---

## partner_reservation_notes

Partner-side field notes and issue records for a reservation.

```sql
create table partner_reservation_notes (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  partner_id uuid not null references partners(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  note_type text not null default 'NOTE'
    check (note_type in ('NOTE', 'ISSUE', 'DELAY', 'NO_SHOW')),
  body text not null check (length(trim(body)) > 0),
  is_resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Rules:

- `partner_id` must match `reservations.partner_id`.
- Store-admin may select/insert/update notes only for their own partner.
- Notes are partner-side operational records and are not shown in the user app.
- `ISSUE`, `DELAY`, `NO_SHOW` notes can be marked resolved.

Migration:

- `db/migrations/20260626_partner_reservation_notes.sql`

---

## partner_admin_audit_logs

Store-admin operational audit ledger for partner-owned write actions.

```sql
create table partner_admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid not null,
  reservation_id uuid references reservations(id) on delete set null,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

Rules:

- Store-admin may select audit rows only for their own partner.
- Write APIs use this as best-effort operational audit; business mutations must not fail only because audit insert fails.
- Logged actions include bay active changes, availability block create/update/deactivate/reactivate, and reservation note create/resolve/reopen.
- User-facing app must not expose this table.
- Internal Admin uses `admin_search_partner_admin_audit_logs()` for text search across audit ids, partner ids/names, actor ids, action, target ids, reservation ids, before/after state, and metadata.

Migration:

- `db/migrations/20260629_partner_admin_audit_logs.sql`
- `db/migrations/20260629_partner_admin_audit_search.sql`

---

## service_packages

Global package catalog reused from the Figma package set.

```sql
create table service_packages (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  duration_minutes int not null check (duration_minutes > 0),
  is_active boolean default true,
  created_at timestamptz default now()
);
```

---

## partner_package_prices

Partner-specific published package pricing.

```sql
create table partner_package_prices (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  package_id uuid not null references service_packages(id) on delete cascade,
  labor_price numeric not null check (labor_price >= 0),
  is_active boolean default true,
  created_at timestamptz default now(),
  unique (partner_id, package_id)
);

create index idx_partner_package_prices_partner on partner_package_prices(partner_id);
```

---

## reservations

`end_time` is the user-facing reservation end time and checkout extra fee 기준이다.
`reserved_end_time` is kept as a compatibility alias for `end_time`.
`blocked_until` is the bay occupancy end time and is always `end_time + interval '1 hour'`.

```sql
create table reservations (
id uuid primary key default gen_random_uuid(),
user_id uuid not null,
vehicle_id uuid references vehicles(id) on delete restrict,
bay_id uuid references bays(id) on delete cascade,
start_time timestamptz not null,
end_time timestamptz not null,
blocked_until timestamptz not null,
reserved_end_time timestamptz not null,
duration_minutes int not null,
selected_task_count int not null default 0,
helper_verify_requested boolean not null default false,
helper_verify_fee numeric not null default 0,
status text not null check (
status in (
‘CONFIRMED’,
‘CHECKED_IN’,
‘IN_USE’,
‘COMPLETED’,
‘CANCELLED’
)
),
total_price numeric not null,
created_at timestamptz default now()
);

alter table reservations
add constraint chk_reservation_hour_unit
check (
extract(epoch from (end_time - start_time)) >= 3600
and mod(extract(epoch from (end_time - start_time))::int, 3600) = 0
);

alter table reservations
add constraint chk_blocked_until_buffer
check (blocked_until = end_time + interval '1 hour');

alter table reservations
add constraint chk_reserved_end_time_matches_end_time
check (reserved_end_time = end_time);

alter table reservations
add constraint chk_helper_verify_fee
check (
(helper_verify_requested = false and helper_verify_fee = 0)
or (helper_verify_requested = true and helper_verify_fee >= 5000)
);

create index idx_reservations_bay on reservations(bay_id);
create index idx_reservations_user on reservations(user_id);
create index idx_reservations_vehicle on reservations(vehicle_id);
create index idx_reservations_active_window
on reservations(partner_id, bay_id, start_time, blocked_until)
where status in ('CONFIRMED', 'CHECKED_IN', 'IN_USE');
```

---

## Reservation Conflict Prevention

For MVP, both reservation types must still resolve to a real blocked bay/resource so overlap can be prevented.
If `SHOP_SERVICE` bay assignment is hidden from the user, the system or partner admin must assign one before confirmation.

```sql
alter table reservations
add constraint no_overlap
exclude using gist (
bay_id with =,
tstzrange(start_time, blocked_until) with &&
) where (status in ('CONFIRMED', 'CHECKED_IN', 'IN_USE'));

⸻

self_maintenance_tasks

create table self_maintenance_tasks (
id uuid primary key default gen_random_uuid(),
code text unique not null,
name text not null,
is_legal boolean not null default true,
is_active boolean not null default true,
helper_verify_unit_fee numeric not null default 2000,
created_at timestamptz default now()
);

⸻

reservation_tasks

create table reservation_tasks (
id uuid primary key default gen_random_uuid(),
reservation_id uuid not null references reservations(id) on delete cascade,
task_id uuid not null references self_maintenance_tasks(id),
created_at timestamptz default now(),
unique (reservation_id, task_id)
);

create index idx_reservation_tasks_reservation on reservation_tasks(reservation_id);

⸻

self_task_agreements

create table self_task_agreements (
id uuid primary key default gen_random_uuid(),
reservation_id uuid unique not null references reservations(id) on delete cascade,
agree_only_selected boolean not null,
consent_method text not null check (consent_method in ('CHECKBOX', 'SIGNATURE')),
signature_image_url text,
agreed_at timestamptz not null default now(),
check (
(consent_method = 'CHECKBOX' and signature_image_url is null)
or (consent_method = 'SIGNATURE' and signature_image_url is not null)
)
);

⸻

checkins

create table checkins (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid unique references reservations(id) on delete cascade,
  front_img text not null,
  rear_img text not null,
  left_img text not null,
  right_img text not null,
  checked_in_at timestamptz default now()
);
```

---

## checkouts

```sql
create table checkouts (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid unique references reservations(id) on delete cascade,
  base_price numeric not null default 0,
  extra_fee numeric default 0,
  helper_verify_requested boolean not null default false,
  helper_verify_fee numeric not null default 0,
  total_settlement numeric not null default 0,
  tool_check_completed boolean not null default false,
  cleaning_completed boolean not null default false,
  waste_disposal_completed boolean not null default false,
  checkout_photo_1 text,
  checkout_photo_2 text,
  completed_at timestamptz default now()
);
```

---

## Storage

MVP photo evidence uses Supabase Storage.

Bucket:

- `reservation-photos`
- public read for MVP development
- 10MB max file size
- allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`

Paths:

- `checkin/{reservation_id}/{field}-{timestamp}-{uuid}.{ext}`
- `checkout/{reservation_id}/{field}-{timestamp}-{uuid}.{ext}`

Operational note:

- 2026-06-11 Auth/RLS 1차 기준으로 anonymous upload policy is removed.
- Authenticated users may upload only under `checkin/{reservation_id}/...` or `checkout/{reservation_id}/...` for their own reservation.
- 2026-06-21 hardening 기준으로 `checkin` uploads require reservation status `CONFIRMED`.
- 2026-06-21 hardening 기준으로 `checkout` uploads require reservation status `CHECKED_IN` or `IN_USE`.
- The bucket remains public-read in the current MVP so existing public URL display keeps working.
- Before production, prefer private bucket + signed read URLs for stronger evidence protection.

---

## reviews

```sql
create table reviews (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid unique references reservations(id) on delete cascade,
  partner_id uuid references partners(id) on delete cascade,
  user_id uuid not null,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz default now()
);

create index idx_reviews_partner on reviews(partner_id);
create index idx_reviews_user on reviews(user_id);

⸻

Auth / RLS foundation

```sql
-- See db/migrations/20260611_auth_rls_foundation.sql

-- User-owned tables use auth.uid():
-- reservations
-- reservation_tasks
-- self_task_agreements
-- checkins
-- checkouts
-- reservation_status_logs
-- reviews insert/update

-- Partner-owned operator access uses partner_admins:
-- partner_admins
-- partner_availability_blocks
-- reservations select where reservations.partner_id is managed by auth.uid()
-- reservation_tasks select through managed reservation
-- checkins select through managed reservation
-- checkouts select through managed reservation
-- reservation_status_logs select through managed reservation
-- bays update where bays.partner_id is managed by auth.uid()

-- Public catalog read remains available:
-- partners, bays, service_packages, partner_package_prices, self_maintenance_tasks

-- Admin read console should use SUPABASE_SERVICE_ROLE_KEY server-side.
```

⸻

## vehicles

User-owned vehicle registry used by `/my-car` and reservation vehicle selection.

```sql
create table vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plate_number text not null,
  model text not null,
  year int not null check (year >= 1990 and year <= 2100),
  type_label text not null default '세단',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_vehicles_user_plate on vehicles(user_id, plate_number);
create unique index uq_vehicles_one_active_per_user
  on vehicles(user_id)
  where is_active = true;
```

RLS:

- Authenticated users may select/insert/update/delete only rows where `user_id = auth.uid()`.
- First registered vehicle is set active by the client.
- Representative vehicle changes use `set_active_vehicle(uuid)` so deactivating the previous vehicle and activating the next vehicle happen in one DB transaction.
- Reservation vehicle picker reads this table instead of local mock storage.

Migration:

- `db/migrations/20260611_user_vehicles.sql`

⸻

## payments

Payment intent and provider approval ledger.

Reservations are confirmed only after payment approval. Payment waiting state is stored here, not in `reservations`.

```sql
create table payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  reservation_id uuid references reservations(id) on delete set null,
  checkout_id uuid references checkouts(id) on delete set null,
  payment_purpose text not null default 'RESERVATION'
    check (payment_purpose in ('RESERVATION', 'CHECKOUT_SETTLEMENT')),
  provider text not null check (provider in ('TOSS', 'FAKE')),
  provider_payment_key text,
  provider_order_id text not null unique,
  method text not null,
  status text not null check (
    status in (
      'READY',
      'APPROVED',
      'RESERVATION_CONFIRMED',
      'SETTLEMENT_CONFIRMED',
      'FAILED',
      'CANCELLED',
      'REFUND_PENDING',
      'REFUNDED'
    )
  ),
  amount numeric not null check (amount >= 0),
  currency text not null default 'KRW',
  reservation_snapshot jsonb not null,
  failure_code text,
  failure_message text,
  metadata jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_payments_user_created on payments(user_id, created_at desc);
create index idx_payments_reservation on payments(reservation_id);
create index idx_payments_checkout on payments(checkout_id);
create index idx_payments_purpose on payments(payment_purpose);
create index idx_payments_status on payments(status);
```

RLS:

- Authenticated users may select their own payment rows.
- Users do not directly insert/update payments from the client.
- Payment prepare/confirm APIs write through server route handlers.
- Admin/service role may read payment rows for operations and refunds.

Detailed flow:

- `docs/Payment_MVP.md`

---

## reservation_status_logs

All explicit reservation state transitions must be logged.

```sql
create table reservation_status_logs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  from_status text,
  to_status text not null check (
    to_status in ('CONFIRMED', 'CHECKED_IN', 'IN_USE', 'COMPLETED', 'CANCELLED')
  ),
  actor_type text not null default 'SYSTEM' check (
    actor_type in ('SYSTEM', 'USER', 'PARTNER', 'ADMIN')
  ),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (
    from_status is null
    or from_status in ('CONFIRMED', 'CHECKED_IN', 'IN_USE', 'COMPLETED', 'CANCELLED')
  )
);

create index idx_reservation_status_logs_reservation
  on reservation_status_logs(reservation_id, created_at);

create index idx_reservation_status_logs_transition
  on reservation_status_logs(from_status, to_status);
```
