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

Helper mode excluded.

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

- Select date
- Select 30min slot
- Select bay
- Price auto calculation
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

### Checkout

- Cleaning check
- Tool check
- Waste check
- Checkout photo
- Auto extra fee calculation

---

## Non-Functional

- Reservation conflict must be DB enforced.
- All photo URLs must be stored.
- All status changes logged.
