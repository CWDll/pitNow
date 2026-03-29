select
  p.id as partner_id,
  p.name as partner_name,
  count(b.id) filter (where b.is_active = true) as active_bay_count,
  min(ppp.labor_price) filter (where ppp.is_active = true) as min_package_price,
  count(ppp.package_id) filter (where ppp.is_active = true) as active_package_count
from partners p
left join bays b on b.partner_id = p.id
left join partner_package_prices ppp on ppp.partner_id = p.id
group by p.id, p.name
order by p.name;

select
  p.name as partner_name,
  sp.code as package_code,
  sp.name as package_name,
  sp.duration_minutes,
  ppp.labor_price,
  ppp.is_active
from partner_package_prices ppp
join partners p on p.id = ppp.partner_id
join service_packages sp on sp.id = ppp.package_id
order by p.name, ppp.labor_price;

select
  r.id as reservation_id,
  r.status,
  r.reservation_type,
  r.partner_id,
  r.bay_id,
  r.start_time,
  r.end_time,
  r.blocked_until,
  extract(epoch from (r.end_time - r.start_time)) / 60 as duration_minutes_calc,
  extract(epoch from (r.blocked_until - r.end_time)) / 60 as buffer_minutes_calc,
  r.total_price,
  r.helper_verify_requested,
  r.helper_verify_fee,
  r.selected_task_count,
  r.created_at
from reservations r
order by r.created_at desc
limit 30;

select
  r.id as reservation_id,
  r.status,
  count(rt.task_id) as task_count,
  max(case when sta.reservation_id is not null then 1 else 0 end) as has_agreement
from reservations r
left join reservation_tasks rt on rt.reservation_id = r.id
left join self_task_agreements sta on sta.reservation_id = r.id
where r.reservation_type in ('SELF_SERVICE', 'SELF', 'SELF_MAINTENANCE', 'TIME')
group by r.id, r.status
order by r.id;

select
  r.id as reservation_id,
  r.status,
  c.checked_in_at,
  case
    when c.front_img is not null
     and c.rear_img is not null
     and c.left_img is not null
     and c.right_img is not null then true
    else false
  end as has_all_checkin_photos
from reservations r
left join checkins c on c.reservation_id = r.id
where r.status in ('CHECKED_IN', 'IN_USE', 'COMPLETED')
order by r.created_at desc;

select
  r.id as reservation_id,
  r.status,
  r.total_price as base_price,
  coalesce(co.extra_fee, 0) as extra_fee,
  r.total_price + coalesce(co.extra_fee, 0) as final_settlement,
  co.completed_at
from reservations r
left join checkouts co on co.reservation_id = r.id
where r.status = 'COMPLETED'
order by co.completed_at desc nulls last;

select
  r.id as reservation_id,
  r.status,
  rv.id as review_id,
  rv.rating,
  rv.comment,
  rv.created_at
from reservations r
left join reviews rv on rv.reservation_id = r.id
where r.status = 'COMPLETED'
order by r.created_at desc;

select
  conflict_a.id as reservation_a,
  conflict_b.id as reservation_b,
  conflict_a.bay_id,
  conflict_a.status as status_a,
  conflict_b.status as status_b,
  conflict_a.start_time as start_a,
  conflict_a.blocked_until as blocked_until_a,
  conflict_b.start_time as start_b,
  conflict_b.blocked_until as blocked_until_b
from reservations conflict_a
join reservations conflict_b
  on conflict_a.id < conflict_b.id
 and conflict_a.bay_id = conflict_b.bay_id
 and tstzrange(conflict_a.start_time, conflict_a.blocked_until)
     && tstzrange(conflict_b.start_time, conflict_b.blocked_until)
where conflict_a.status in ('CONFIRMED', 'CHECKED_IN', 'IN_USE')
  and conflict_b.status in ('CONFIRMED', 'CHECKED_IN', 'IN_USE');

with latest as (
  select r.*
  from reservations r
  order by r.created_at desc
  limit 1
)
select
  l.id as reservation_id,
  l.status,
  l.reservation_type,
  p.name as partner_name,
  b.name as bay_name,
  l.start_time,
  l.end_time,
  l.blocked_until,
  l.total_price,
  l.helper_verify_requested,
  l.helper_verify_fee,
  c.checked_in_at,
  co.completed_at,
  co.extra_fee,
  rv.rating,
  rv.comment
from latest l
left join partners p on p.id = l.partner_id
left join bays b on b.id = l.bay_id
left join checkins c on c.reservation_id = l.id
left join checkouts co on co.reservation_id = l.id
left join reviews rv on rv.reservation_id = l.id;
