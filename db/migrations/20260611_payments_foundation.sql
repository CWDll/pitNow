create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  reservation_id uuid references reservations(id) on delete set null,
  provider text not null check (provider in ('TOSS', 'FAKE')),
  provider_payment_key text,
  provider_order_id text not null unique,
  method text not null check (
    method in ('CARD', 'KAKAO_PAY', 'NAVER_PAY', 'TOSS_PAY')
  ),
  status text not null check (
    status in (
      'READY',
      'APPROVED',
      'RESERVATION_CONFIRMED',
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

create index if not exists idx_payments_user_created
  on payments(user_id, created_at desc);

create index if not exists idx_payments_reservation
  on payments(reservation_id);

create index if not exists idx_payments_status
  on payments(status);

alter table payments enable row level security;

drop policy if exists "payments_select_own" on payments;
create policy "payments_select_own"
  on payments
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "payments_no_client_insert" on payments;
create policy "payments_no_client_insert"
  on payments
  for insert
  to authenticated
  with check (false);

drop policy if exists "payments_no_client_update" on payments;
create policy "payments_no_client_update"
  on payments
  for update
  to authenticated
  using (false)
  with check (false);

drop policy if exists "payments_no_client_delete" on payments;
create policy "payments_no_client_delete"
  on payments
  for delete
  to authenticated
  using (false);

