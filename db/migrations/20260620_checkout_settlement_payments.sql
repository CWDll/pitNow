alter table payments
  add column if not exists checkout_id uuid references checkouts(id) on delete set null,
  add column if not exists payment_purpose text not null default 'RESERVATION';

do $$
begin
  if exists (
    select 1
      from information_schema.table_constraints
     where table_schema = 'public'
       and table_name = 'payments'
       and constraint_name = 'payments_payment_purpose_check'
  ) then
    alter table payments drop constraint payments_payment_purpose_check;
  end if;
end $$;

alter table payments
  add constraint payments_payment_purpose_check
  check (payment_purpose in ('RESERVATION', 'CHECKOUT_SETTLEMENT'));

do $$
begin
  if exists (
    select 1
      from information_schema.table_constraints
     where table_schema = 'public'
       and table_name = 'payments'
       and constraint_name = 'payments_status_check'
  ) then
    alter table payments drop constraint payments_status_check;
  end if;
end $$;

alter table payments
  add constraint payments_status_check
  check (
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
  );

create index if not exists idx_payments_checkout on payments(checkout_id);
create index if not exists idx_payments_purpose on payments(payment_purpose);
