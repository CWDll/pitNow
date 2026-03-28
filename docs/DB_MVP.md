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
blocked_until timestamptz not null,
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
add constraint chk_helper_verify_fee
check (
	(helper_verify_requested = false and helper_verify_fee = 0)
	or (helper_verify_requested = true and helper_verify_fee >= 5000)
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
tstzrange(start_time, blocked_until) with &&
);

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

⸻

checkouts

create table checkouts (
id uuid primary key default gen_random_uuid(),
reservation_id uuid unique references reservations(id) on delete cascade,
extra_fee numeric default 0,
completed_at timestamptz default now()
);

⸻

reviews

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

MVP 제외 (향후 확장용)
• vehicles
• payments
• status_logs

지금은 최소 스키마만 유지한다.
