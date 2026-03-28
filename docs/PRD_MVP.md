# PitNow MVP PRD

## Objective

Validate market by enabling real garage lift reservation loop.

MVP scope:

1. Search partner
2. Reserve bay
3. Pay (prepaid)
4. QR check-in
5. 4 photo upload
6. Timer-based usage
7. Checkout with auto settlement
8. Review

Package mode 유지, Self 정비 플로우만 변경.

---

## Core Features

### Home

- Map + list
- Fastest available slot
- Distance / price filter

### Partner Detail

- Photos
- Bay count
- Price per hour
- Review summary
- Reserve CTA

### Reservation

- Select legal self-maintenance tasks only
- Confirm declaration: "Only selected tasks will be performed"
- Capture consent via checkbox/signature
- Select start time + work duration (1 hour unit)
- System blocks bay for work duration + additional 1 hour buffer
- Select bay
- Price auto calculation (time + optional helper verification)
- Payment required before confirmation

### Check-in

- QR verification
- 4-direction vehicle photo required
- Timer starts only after photos uploaded

### In-Use

- Remaining time display
- Extend time
- SOS button (simple contact)
- 15-minute warning
- Extension unit is 1 hour

### Checkout

- Cleaning check
- Tool check
- Waste check
- Checkout photo
- Auto extra fee calculation
- Optional helper verification request (default +5,000 + per-task additional fee)

---

## Non-Functional

- Reservation conflict must be DB enforced.
- All photo URLs must be stored.
- All status changes logged.
- Self-maintenance task selection must be restricted to legal allowlist.
- User declaration/consent evidence must be stored.
- Buffer blocking (work end +1h) must be reflected in conflict checks.
