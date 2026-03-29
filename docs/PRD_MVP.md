# PitNow MVP PRD

## Objective

Validate demand for a dual-mode garage reservation service that supports both:

1. `Self Service`: user books time by slot and works directly in the bay.
2. `Shop Service`: user selects a package and leaves the work to the shop/professional.

The product message is not "cheap labor only". The point is that the same service can be used for both self-maintenance and professional execution.

`Helper mode` is replaced by `Shop Service`.

---

## MVP Scope

1. Search partner
2. View partner detail
3. Choose reservation mode
4. Reserve and pay
5. QR check-in for self service
6. Usage timer for self service
7. Auto settlement / completion
8. Review

Package mode 유지, Self 정비 플로우만 변경.

---

## Core Features

### Home

- Map + list
- Fastest available option
- Distance / price filter
- Mode-aware partner card messaging

### Partner Detail

- Photos
- Bay count
- Self-service hourly price
- Shop-service package list
- Package duration + price by partner
- Review summary
- Reservation CTA per mode

### Reservation

- User chooses `Self Service` or `Shop Service`
- Payment required before confirmation

#### Self Service Reservation

- Select legal self-maintenance tasks only
- Confirm declaration: "Only selected tasks will be performed"
- Capture consent via checkbox/signature
- Select start time + work duration (1 hour unit)
- System blocks bay for work duration + additional 1 hour buffer
- Select bay
- Price auto calculation (time + optional helper verification)
- Payment required before confirmation

### Check-in

#### Self Service

- QR verification
- 4-direction vehicle photo required
- Timer starts only after photos uploaded

#### Shop Service

- No self-work timer flow required
- Reservation enters shop execution flow after confirmation/check-in policy defined by partner

### In Use / Execution

#### Self Service

- Remaining time display
- Extend time
- SOS button
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

## Operational Policy

- Reservation conflict must be DB enforced.
- All photo URLs must be stored.
- All status changes logged.
- Self-maintenance task selection must be restricted to legal allowlist.
- User declaration/consent evidence must be stored.
- Buffer blocking (work end +1h) must be reflected in conflict checks.
