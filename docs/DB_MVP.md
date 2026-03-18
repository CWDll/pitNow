# DB MVP

## Overview

Schema supports two reservation types:

- `SELF_SERVICE`: slot-based bay reservation
- `SHOP_SERVICE`: package-based reservation with duration-derived blocking

All primary keys use UUID.
All timestamps use `timestamptz`.
Reservation conflict prevention is enforced at DB level.

---

## Extensions

```sql
create extension if not exists btree_gist;
```

---

## partners

```sql
create table partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  lat float8,
  lng float8,
  created_at timestamptz default now()
);
```

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

`reserved_end_time` is the actual blocked end time.
For `SHOP_SERVICE`, it is computed by rounding package duration up to 30-minute units.

```sql
create table reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  partner_id uuid not null references partners(id) on delete cascade,
  bay_id uuid references bays(id) on delete cascade,
  reservation_type text not null check (
    reservation_type in ('SELF_SERVICE', 'SHOP_SERVICE')
  ),
  package_id uuid references service_packages(id) on delete set null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  reserved_end_time timestamptz not null,
  status text not null check (
    status in ('CONFIRMED', 'CHECKED_IN', 'IN_USE', 'COMPLETED', 'CANCELLED')
  ),
  total_price numeric not null,
  professional_takeover boolean not null default false,
  created_at timestamptz default now(),
  check (
    (reservation_type = 'SELF_SERVICE' and bay_id is not null and package_id is null)
    or
    (reservation_type = 'SHOP_SERVICE' and package_id is not null)
  )
);

create index idx_reservations_partner on reservations(partner_id);
create index idx_reservations_bay on reservations(bay_id);
create index idx_reservations_user on reservations(user_id);
create index idx_reservations_time on reservations(start_time, reserved_end_time);
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
  tstzrange(start_time, reserved_end_time) with &&
)
where (status in ('CONFIRMED', 'CHECKED_IN', 'IN_USE'));
```

---

## checkins

Used for self-service flow.

```sql
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
  extra_fee numeric default 0,
  completed_at timestamptz default now()
);
```

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
```

---

## Business Rules to Preserve

- Self Service keeps `1 hour minimum` and `30 minute` extension units.
- Shop Service blocks time by package duration rounded up to `30 minute` units.
- Example: `40 minutes` package => `60 minutes` blocked.
- Partner-specific package price must be stored and published.
- If the shop decides the work cannot finish in reserved time and a mechanic takes over, full labor charge still applies.
