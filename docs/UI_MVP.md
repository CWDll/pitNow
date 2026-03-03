# UI Structure (Based on Team Wireframe)

UI Strategy

User App
• Mobile only layout
• Bottom navigation (5-tab structure)
• Full-width components
• Designed for touch interaction
• PWA installable
• No desktop layout support

Viewport target: max-width 430px

⸻

Admin Console
• Desktop only
• Separate route: /admin
• Table-based data view
• Focus on reservation + settlement monitoring
• No mobile support required

⸻

Layout Separation

User App:
• / (home)
• /partner/[id]
• /reservation
• /checkin
• /in-use
• /checkout

Admin:
• /admin
• /admin/reservations
• /admin/settlement

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

### Reservation

- Date picker
- 30min slots
- Bay selection required
- Show total price

### Check-in

- QR input
- 4 photo upload mandatory

### In-use

- Timer visible
- Extend button
- Warning at -15min

---

## Differences from original PRD

- [ ] Any change?
- [ ] Slot UX different?
