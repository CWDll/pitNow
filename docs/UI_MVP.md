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
- 30-minute aligned start slot
- Duration selector
- Bay selection required
- Show total time-based price

#### Shop Service

- Package selection required
- Show package duration and displayed labor price
- User does not manually build duration
- Reservation summary must show the actual blocked time after 30-minute round-up
- Bay selection is not exposed to the user if system assignment is used

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
- Warning at `-15 min`

#### Shop Service

- Show reservation status only
- No active self-use timer UI

---

## Key UX Notes

- Shop Service should not read like a fallback or discount mode.
- The copy should emphasize "choose self or leave it to a professional in the same app".
- If a package duration is `40 min`, the confirmation UI must clearly show that `1 hour` is reserved.
