alter table public.reservations
  add column if not exists partner_id uuid references public.partners(id),
  add column if not exists reservation_type text check (reservation_type in ('SELF_SERVICE', 'SHOP_SERVICE')),
  add column if not exists package_id text,
  add column if not exists reserved_end_time timestamptz,
  add column if not exists duration_minutes integer;

update public.reservations r
set partner_id = b.partner_id
from public.bays b
where r.bay_id = b.id
  and r.partner_id is null;

update public.reservations
set reservation_type = case
  when exists (
    select 1
    from public.checkins c
    where c.reservation_id = reservations.id
  ) then 'SELF_SERVICE'
  else 'SHOP_SERVICE'
end
where reservation_type is null;

update public.reservations
set reserved_end_time = coalesce(reserved_end_time, end_time)
where reserved_end_time is null;

update public.reservations
set duration_minutes = greatest(
  30,
  round(extract(epoch from (end_time - start_time)) / 60.0)::integer
)
where duration_minutes is null;

alter table public.reservations
  alter column partner_id set not null,
  alter column reservation_type set not null,
  alter column reserved_end_time set not null,
  alter column duration_minutes set not null;

create index if not exists reservations_partner_id_idx
  on public.reservations (partner_id);

create index if not exists reservations_type_idx
  on public.reservations (reservation_type);

create index if not exists reservations_package_id_idx
  on public.reservations (package_id)
  where package_id is not null;
