# Policies

## Reservation

- Minimum 1 hour
- Extension unit: 1 hour
- Bay blocking window: work time + 1 hour buffer
- Self-maintenance tasks must be selected from legal allowlist only
- User must agree "only selected tasks" via checkbox or signature before payment
- Prepaid only

## No-show

- 10 min late → auto cancel (Phase2)

## Extra Fee

- Overtime calculated per 1 hour
- Rounded up

## Helper Verification (Optional)

- User can request helper verification at final step
- Fee = 5,000 base + per-selected-task additional fee
- Additional fee scales by selected task count/type

## Check-in

- 4 vehicle photos required
- Without photo, timer cannot start

## Checkout

- Cleaning required
- Tool check required
- Extra fee auto calculated

## Store Admin

- Store-admin is a partner-side role, not the internal PitNow admin role.
- Store-admin routes must be separated under `/partner-admin`.
- Store-admin access is granted only through active `partner_admins` membership.
- Store-admin may access only rows scoped to their `partner_id`.
- Store-admin may read:
  - own partner membership
  - own partner reservations
  - own partner check-in evidence
  - own partner checkout evidence/checklist
  - own partner reservation status logs
  - own partner availability blocks
- Store-admin may update:
  - own partner `bays.is_active`
  - own partner `partner_availability_blocks`
- Store-admin must not access:
  - other partners' reservations/evidence
  - internal admin pages
  - provider payment keys or refund operation metadata
  - user-owned vehicle management outside reservation display fields
- Internal PitNow admin keeps using server-only service role access for cross-partner operations.

## Partner Availability Blocks

- `bay_id = null` blocks the whole partner location.
- `bay_id` set blocks only that bay.
- Reservation prepare must reject requested windows overlapping:
  - active whole-partner block for the partner
  - active bay-specific block for the selected bay
- Store-admin block creation and update must be logged in app-level audit/status metadata when write APIs are implemented.
