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
  - own partner reservation field notes/issues
- Store-admin may update:
  - own partner `bays.is_active`
  - own partner `partner_availability_blocks`
  - own partner `partner_reservation_notes.is_resolved`
- Store-admin may insert:
  - own partner reservation field notes/issues
- Store-admin must not access:
  - other partners' reservations/evidence
  - internal admin pages
  - provider payment keys or refund operation metadata
  - user-owned vehicle management outside reservation display fields
- Store-admin field notes are internal partner-side records and must not be shown in the user app.
- Internal PitNow admin keeps using server-only service role access for cross-partner operations.

## Partner Availability Blocks

- `bay_id = null` blocks the whole partner location.
- `bay_id` set blocks only that bay.
- Reservation prepare must reject requested windows overlapping:
  - active whole-partner block for the partner
  - active bay-specific block for the selected bay
- Store-admin write actions must be logged in `partner_admin_audit_logs` as best-effort operational audit.
- Audit-covered MVP actions: bay active changes, availability block create/update/deactivate/reactivate, reservation note create/resolve/reopen.
- Audit insert failure must be logged server-side, but must not roll back the primary business mutation.
