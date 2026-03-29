# UI Structure (Based on Team Wireframe)

## UI Strategy

### User App

- Mobile-only layout
- Bottom navigation (5 tabs)
- Full-width components
- Touch-first interaction
- PWA installable
- No desktop layout support

Viewport target: `max-width 430px`

### Admin Console

- Desktop only
- Separate route: `/admin`
- Table-based monitoring view
- Focus on reservation, package pricing, and settlement monitoring

### Layout Separation

User App:

- `/`
- `/partner/[id]`
- `/reservation`
- `/checkin`
- `/in-use`
- `/checkout`

Admin:

- `/admin`
- `/admin/reservations`
- `/admin/settlement`
- `/admin/packages`

User and Admin must not share layout wrappers.

---

## Pages

1. Home
2. Partner Detail
3. Reservation
4. Check-in
5. In-use
6. Checkout

---

## Component Rules

### Home

- Partner card shows both `Self Service` and `Shop Service` availability when supported
- Show fastest available option
- Allow sorting/filtering by price

### Partner Detail

- Separate sections for:
  - Self-service hourly reservation
  - Shop-service package reservation
- Package list must show:
  - Package name
  - Included work
  - Estimated duration
  - Partner-specific price

### Reservation

- First step must be reservation mode selection:
  - `Self Service`
  - `Shop Service`

#### Self Service

- Date picker
- Start time picker + duration selector (1 hour unit)
- Bay selection required
- Legal self-maintenance task checklist
- Required consent UI (checkbox or signature)
- Show total price
- Show helper verification surcharge rule

### Check-in

#### Self Service

- QR input
- 4 photo upload mandatory

#### Shop Service

- No 4-photo mandatory flow in MVP unless separately required by operations

### In-use

#### Self Service

- Timer visible
- Extend button
- Warning at -15min
- Extend in 1-hour unit only

### Checkout

- Optional checkbox: helper verification request
- Price preview: 5,000 base + per-selected-task additional fee

---

## Differences from original PRD

- [x] Reservation slot model changed: 30min slot -> 1h duration unit
- [x] Added legal task selection + required consent UI for self-maintenance
