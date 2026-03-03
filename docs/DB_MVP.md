개요

이 스키마는 다음을 기준으로 설계한다.
• Serverless 구조
• 단독 개발
• 예약 루프 검증
• 향후 Auth 확장 가능

모든 PK는 UUID.
모든 시간은 timestamptz.
예약 겹침 방지는 DB 레벨에서 강제한다.

⸻

Extensions

create extension if not exists btree_gist;

⸻

partners

create table partners (
id uuid primary key default gen_random_uuid(),
name text not null,
address text not null,
lat float8,
lng float8,
created_at timestamptz default now()
);

⸻

bays

create table bays (
id uuid primary key default gen_random_uuid(),
partner_id uuid references partners(id) on delete cascade,
name text not null,
is_active boolean default true,
created_at timestamptz default now()
);

create index idx_bays_partner on bays(partner_id);

⸻

reservations

create table reservations (
id uuid primary key default gen_random_uuid(),
user_id uuid not null,
bay_id uuid references bays(id) on delete cascade,
start_time timestamptz not null,
end_time timestamptz not null,
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

create index idx_reservations_bay on reservations(bay_id);
create index idx_reservations_user on reservations(user_id);
create index idx_reservations_time on reservations(start_time, end_time);

⸻

예약 겹침 방지 (중요)

alter table reservations
add constraint no_overlap
exclude using gist (
bay_id with =,
tstzrange(start_time, end_time) with &&
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

⸻

checkouts

create table checkouts (
id uuid primary key default gen_random_uuid(),
reservation_id uuid unique references reservations(id) on delete cascade,
extra_fee numeric default 0,
completed_at timestamptz default now()
);

⸻

MVP 제외 (향후 확장용)
• vehicles
• payments
• helper_requests
• reviews
• status_logs

지금은 최소 스키마만 유지한다.
