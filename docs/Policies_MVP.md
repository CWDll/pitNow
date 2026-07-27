# Policies

## Reservation

- Minimum 1 hour
- Reservation extension is not supported in MVP
- Bay blocking window: work time + 1 hour buffer
- Self-maintenance tasks must be selected from legal allowlist only
- User must agree "only selected tasks" via checkbox or signature before payment
- Prepaid only

## No-show

- 10 min late → auto cancel (Phase2)

## Extra Fee

- Overtime calculated per 1 hour
- Rounded up
- Billable overtime is capped at 60 minutes (one hourly charge)
- An active reservation must be checked out even after the billing cap is reached

## Car Master Verification (Optional)

- User can request verification only during reservation
- Fee = 5,000 base + per-selected-task additional fee
- Additional fee scales by selected task count/type
- The selected fee is prepaid with the reservation and cannot be added again at checkout

## Check-in

- Self Service requires 4 vehicle photos after Partner arrival verification.
- Shop Service does not require user check-in photos.
- Without Self Service photos, the timer cannot start.
- HEIC/HEIF uploads are converted to JPEG in the browser before storage so evidence remains previewable in web consoles.
- Check-in and usage start open 15 minutes before the reserved start time
- Check-in is rejected before the opening time and after the reserved end time

## Checkout

- Cleaning required
- Tool check required
- Waste disposal check required
- 2 checkout photos required
- Partner-admin shows evidence inline and converts legacy HEIC/HEIF objects locally for preview without forcing a download.
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
  - own partner `bays.allowed_vehicle_types`, `bays.max_vehicle_weight_kg`
  - own partner `partner_availability_blocks`
  - own partner `partner_reservation_notes.is_resolved`
- Store-admin may insert:
  - own partner reservation field notes/issues
  - own partner package price-change and new-package creation requests
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
- Start and end times use exact one-hour boundaries; minute-level blocks are not accepted.
- Reservation prepare must reject requested windows overlapping:
  - active whole-partner block for the partner
  - active bay-specific block for the selected bay
- Store-admin write actions must be logged in `partner_admin_audit_logs` as best-effort operational audit.
- Audit-covered MVP actions: bay active changes, availability block create/update/deactivate/reactivate, reservation note create/resolve/reopen.
- Audit insert failure must be logged server-side, but must not roll back the primary business mutation.

## Bay Vehicle Compatibility

- Partner onboarding collects allowed vehicle types and maximum curb weight for each existing bay.
- An empty allowed vehicle type list means all supported vehicle types are allowed.
- A null maximum vehicle weight means no weight restriction.
- A configured maximum weight must be a positive integer in kg.
- Vehicle weight means curb weight. Missing weight is allowed in the vehicle registry.
- A vehicle with missing weight may use an unrestricted bay, but cannot use a weight-restricted bay.
- The schedule UI keeps incompatible active bays visible but disabled and explains the reason.
- Payment prepare and final reservation confirmation must reload and validate both bay and vehicle conditions.
- Partner-admin may correct onboarding values for bays within their active partner membership, and changes are audit logged.
- Lift type, dimensions, wheelbase, payload, loaded state, and manual approval remain out of MVP scope.

## Public Profiles and Media

- Reviews identify authors by a user-selected nickname, never by real name,
  email, phone number, or vehicle plate.
- Real name and phone are private account/operations data readable by the
  account owner and authorized server-side operations only.
- Existing and newly-created users receive a non-identifying default nickname
  until they change it.
- Partner images are public service content. An authorized Partner-admin may
  upload up to 8 images and select one home cover image.
- Review images are public user-generated content. A completed reservation
  owner may attach up to 4 images to that reservation's review.
- Partner/review images use separate public buckets. Check-in/checkout evidence
  remains in the private reservation evidence flow.
- HEIC/HEIF selected on iPhone is converted to JPEG before public upload.
- User-generated image moderation/reporting is a production-launch policy gate;
  the MVP upload feature does not imply unrestricted content acceptance.
## Partner Arrival Check-in

- Self Service와 Shop Service 모두 사용자가 현장의 정비소 고정 QR을 스캔하거나
  수동 코드를 입력해 도착을 인증한다.
- QR과 수동 코드는 베이별이 아니라 Partner별로 발급하며 모든 예약에 재사용한다.
- 인증정보는 사용자에게 조회 API로 제공하지 않고 입력값만 서버에서 대조한다.
- 인증정보 재발급 시 기존 QR과 수동 코드는 즉시 무효화한다.
- Self Service는 도착 인증 후 차량 4면 사진 제출이 필요하다.
- Shop Service는 도착 인증으로 `CHECKED_IN`이 되며 사용자는 작업 상태를
  조회만 한다.
- Shop Service의 `CHECKED_IN → IN_USE → COMPLETED` 전환은 해당 정비소의
  Partner-admin만 수행한다.
