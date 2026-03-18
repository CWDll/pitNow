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

---

## Reservation Modes

### 1. Self Service

- Existing slot-based reservation model is retained.
- User selects date, start time, duration, and bay.
- Minimum duration is `1 hour`.
- Extension unit is `30 minutes`.
- Pricing remains time-based.

### 2. Shop Service

- Reservation is package-based, not freeform time-based from the user perspective.
- User selects a predefined package already designed in the Figma package set.
- Each partner publishes its own package price, similar to a food delivery menu.
- Price competition is intentionally left to partners.
- User does not choose duration directly; duration comes from the package definition.
- Reserved time is blocked by package duration rounded up to `30-minute` units.
- Example: a `40-minute` package blocks `60 minutes` of schedule.
- UI should position this as "professional use available in the same service", not as a bargain-only option.

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

- Select date
- Select 30-minute aligned start time
- Select duration
- Select bay
- Price auto calculation

#### Shop Service Reservation

- Select package
- Show package description, estimated duration, and partner-specific labor price
- System computes blocked time by rounding package duration up to 30-minute units
- Bay/resource assignment can be done by system or partner internally, but the slot must still be conflict-free

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

#### Shop Service

- Package progress handled by partner/shop
- No user-driven extension flow in MVP

### Completion

- Completion record stored for both modes
- Review available after completed reservation

---

## Operational Policy

- Reservation conflict must be DB enforced.
- All photo URLs must be stored for self-service check-in.
- All status changes must be logged.
- Shop must verify whether the selected work can be completed within the reserved package time.
- If the shop determines the work cannot finish within the booked time, a mechanic/professional takes over the work.
- When professional takeover happens, the full labor charge still applies regardless of progress made before takeover.

---

## Notes for Future Iteration

- Package catalog should reuse the package set from the existing Figma site.
- Shop-service capacity policy may later be expanded beyond simple bay blocking, but MVP should still block real schedule time reliably.
