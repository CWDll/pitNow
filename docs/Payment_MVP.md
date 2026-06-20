# Payment MVP

## Goal

PitNow MVP payment flow must protect the reservation loop from three risks:

- A bay is confirmed without a successful payment.
- A user pays but the reservation cannot be confirmed because the slot was taken.
- Local development requires repeated real-card payments.

MVP default provider is Toss Payments. KakaoPay and NaverPay should be exposed through Toss-supported easy pay methods when possible, instead of separate direct integrations.

Reference:

- Toss Payments payment window/widget docs: https://docs.tosspayments.com/en/integration
- KakaoPay online payment docs: https://developers.kakaopay.com/docs/payment/online/common
- NaverPay developer center: https://developers.pay.naver.com/

---

## Decision

Use a payment-first confirmation flow:

1. User selects bay, time, vehicle, tasks/package.
2. Server creates a `payments` row with `READY`.
3. Server asks payment provider to prepare a payment.
4. User completes payment in provider UI.
5. Provider approval callback/return is verified server-side.
6. Server creates the reservation as `CONFIRMED` in the same finalization step.
7. Server marks payment as `APPROVED` and stores `reservation_id`.
8. User lands on `/reservation-complete?reservationId=...`.

The reservation row is not `CONFIRMED` before payment approval.

Reason:

- Existing DB overlap constraints only block active reservations.
- Creating `CONFIRMED` before payment can occupy inventory without revenue.
- Creating a temporary active reservation before payment creates abandoned holds and cleanup complexity.
- Payment-first keeps MVP simpler, then handles final-slot race by refund/cancel policy if the slot is no longer available at approval time.

---

## Slot Race Policy

Because the reservation is created after payment approval, the selected slot might become unavailable between payment start and payment approval.

If approval succeeds but reservation insert fails due to overlap:

1. Mark payment as `APPROVED`.
2. Attempt immediate provider cancel/refund.
3. If cancel succeeds, mark payment as `REFUNDED`.
4. If cancel fails or is pending, mark payment as `REFUND_PENDING`.
5. Return a clear user message: "결제는 승인되었지만 예약 시간이 방금 마감되어 환불 처리 중입니다."
6. Log metadata with provider transaction id, reservation payload, and overlap error.

MVP does not implement unpaid slot holds unless real usage shows frequent race failures.

---

## Status Model

Payment statuses:

- `READY`: payment intent row exists, provider payment has not been approved.
- `APPROVED`: provider payment approval has been verified.
- `RESERVATION_CONFIRMED`: payment is approved and reservation row was created.
- `SETTLEMENT_CONFIRMED`: payment is approved and checkout settlement was paid.
- `FAILED`: provider payment failed or was abandoned.
- `CANCELLED`: user cancelled before approval.
- `REFUND_PENDING`: payment was approved but needs refund/cancel handling.
- `REFUNDED`: payment was refunded/cancelled successfully.

Reservation statuses remain:

- `CONFIRMED`
- `CHECKED_IN`
- `IN_USE`
- `COMPLETED`
- `CANCELLED`

No new reservation status is added for MVP. Payment waiting state belongs to `payments`, not `reservations`.

---

## payments Table

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

## Checkout Settlement Payment

Checkout can create extra fees after the initial reservation payment.

Rules:

- Initial reservation payment uses `payment_purpose = RESERVATION`.
- Post-checkout settlement payment uses `payment_purpose = CHECKOUT_SETTLEMENT`.
- Settlement amount due is `checkouts.total_settlement - reservations.total_price`.
- `checkouts.total_settlement` is the full settlement amount, not the additional amount due.
- On success, `payments.status = SETTLEMENT_CONFIRMED`.
- MVP keeps `reservations.status = COMPLETED`, but user navigation sends pending settlement payment to `/settlement-payment` before `/complete`.
- `/complete` is reserved for no-due or `SETTLEMENT_CONFIRMED` completion.

`reservation_snapshot` stores the server-validated reservation request needed to finalize the reservation after approval:

- `reservationType`
- `bayId`
- `vehicleId`
- `packageId`
- `taskIds`
- `agreeOnlySelectedTasks`
- `consentMethod`
- `signatureImageUrl`
- `helperVerifyRequested`
- `startTime`
- `endTime`
- server-calculated `amount`

Do not trust the client amount during approval.

---

## API Design

### POST /api/payments/prepare

Creates a payment intent and returns provider checkout data.

Input:

```json
{
  "method": "CARD" | "KAKAO_PAY" | "NAVER_PAY" | "TOSS_PAY",
  "reservation": {
    "reservationType": "SELF_SERVICE" | "SHOP_SERVICE",
    "bayId": "uuid",
    "vehicleId": "uuid",
    "packageId": "uuid",
    "taskIds": ["uuid"],
    "agreeOnlySelectedTasks": true,
    "consentMethod": "CHECKBOX",
    "signatureImageUrl": null,
    "helperVerifyRequested": false,
    "startTime": "ISO",
    "endTime": "ISO"
  }
}
```

Server rules:

- Require authenticated user.
- Reuse the same reservation validation and server price calculation as `POST /api/reservations`.
- Do not create a reservation row.
- Create `payments` row with `READY`.
- In production, return Toss checkout parameters.
- In local/test mode, return fake checkout parameters if `PITNOW_PAYMENT_PROVIDER=FAKE`.

Response:

```json
{
  "paymentId": "uuid",
  "provider": "FAKE",
  "providerOrderId": "pitnow_...",
  "amount": 30000,
  "currency": "KRW",
  "checkout": {
    "mode": "FAKE",
    "type": "FAKE"
  }
}
```

Toss test/live adapter replaces the `checkout` payload with Toss checkout parameters:

```json
{
  "paymentId": "uuid",
  "provider": "TOSS",
  "providerOrderId": "pitnow_...",
  "amount": 30000,
  "currency": "KRW",
  "checkout": {
    "mode": "TOSS_TEST",
    "type": "TOSS_PAYMENT_WINDOW",
    "clientKey": "test_ck_...",
    "customerKey": "auth-user-id",
    "orderId": "pitnow_...",
    "orderName": "PitNow 예약",
    "successUrl": "http://localhost:3000/payment/success?paymentId=...",
    "failUrl": "http://localhost:3000/payment/fail?paymentId=..."
  }
}
```

### POST /api/payments/confirm

Verifies provider approval and creates the reservation.

Input:

```json
{
  "paymentId": "uuid",
  "providerPaymentKey": "provider-key",
  "providerOrderId": "pitnow_...",
  "amount": 30000
}
```

Server rules:

- Require authenticated user.
- Load `payments` row where `user_id = auth user id`.
- Confirm amount equals server-stored amount.
- Verify provider approval server-side.
- Mark payment `APPROVED`.
- Create reservation using `reservation_snapshot`.
- If reservation insert succeeds, set payment `RESERVATION_CONFIRMED` and `reservation_id`.
- If reservation insert fails due overlap, attempt refund and mark `REFUNDED` or `REFUND_PENDING`.

Response:

```json
{
  "paymentStatus": "RESERVATION_CONFIRMED",
  "reservationId": "uuid"
}
```

### POST /api/payments/fail

Records provider failure or user cancellation.

Input:

```json
{
  "paymentId": "uuid",
  "code": "PROVIDER_ERROR",
  "message": "..."
}
```

Server rules:

- Require authenticated user.
- Only `READY` payments can become `FAILED` or `CANCELLED`.

---

## Local/Test Strategy

Real payment should not be required for normal development.

Use three modes:

- `PITNOW_PAYMENT_PROVIDER=FAKE`: local and automated E2E. No external network, no real payment. `/api/payments/confirm` simulates provider approval.
- `PITNOW_PAYMENT_PROVIDER=TOSS_TEST`: manual sandbox integration with Toss test keys and test cards. No real settlement.
- `PITNOW_PAYMENT_PROVIDER=TOSS_LIVE`: production only.

Toss env vars:

- `NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY`: browser SDK client key.
- `TOSS_PAYMENTS_SECRET_KEY`: server-only secret key for `/v1/payments/confirm`.
- `TOSS_PAYMENTS_API_BASE_URL`: optional override. Defaults to `https://api.tosspayments.com`.

After changing `.env.local`, restart `npm run dev`. A running Next dev server does not pick up shell-only env overrides for already-started route handlers.

Recommended environments:

- Local `.env.local`: `FAKE`
- Vercel Preview: `TOSS_TEST`
- Vercel Production before launch: `TOSS_TEST`
- Vercel Production after launch: `TOSS_LIVE`

Automated E2E scripts must use `FAKE` so reservation/payment/check-in/checkout can be tested repeatedly without real-card input.

Manual payment QA should be limited to:

- One Toss test card success case.
- One Toss test failure/cancel case.
- One overlap-after-approval refund simulation using fake provider.

---

## Implementation Order

1. Add `payments` migration and TypeScript payment domain types. Done in code. Apply `db/migrations/20260611_payments_foundation.sql` to Supabase before runtime E2E.
2. Extract reservation validation/price calculation so reservations and payments share one server path. Done.
3. Add `PITNOW_PAYMENT_PROVIDER=FAKE` prepare/confirm APIs. Done.
4. Change `/payment` page to call prepare/confirm instead of direct reservation creation. Done.
5. Update checkout E2E to include fake payment before reservation confirmation. Done, but requires the remote `payments` table.
6. Add Toss test provider adapter. Done in code. Requires Toss test keys for manual browser QA.
7. Add Toss live env only after sandbox flow is stable.

---

## Current Runtime Blocker

If `npm run e2e:checkout` fails with `MISSING_PAYMENTS_TABLE`, run this migration in Supabase SQL Editor first:

```text
db/migrations/20260611_payments_foundation.sql
```

After applying it, run:

```bash
PITNOW_PAYMENT_PROVIDER=FAKE npm run e2e:checkout
```
