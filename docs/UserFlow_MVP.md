# User Flow (MVP)

## Self Service Flow

```mermaid
flowchart TD
A[Home] --> B[Partner Detail]
B --> C[Select Legal Self Tasks]
C --> D[Agree Only Selected Tasks / Signature]
D --> E[Select Date/Time and Duration 1h unit]
E --> F[System holds Duration + 1h buffer]
F --> G[Select Bay]
G --> H[Payment]
H --> I[Reservation Confirmed]
I --> J[QR Check-in]
J --> K[Upload 4 Photos]
K --> L[Timer Start]
L --> M[In Use]
M --> N[Checkout]
N --> O[Optional Helper Verify Request]
O --> P[Settlement]
P --> Q[Review]
```

## Notes

- Package flow is unchanged in MVP.
- Self-maintenance flow requires legal task allowlist selection.
- User must explicitly agree to perform only selected tasks.
- Work time is booked in 1-hour units.
- Bay conflict blocking window = start_time ~ (end_time + 1 hour buffer).
- Helper verification is optional at checkout.
- Helper verification fee = 5,000 base + (selected_task_count × per-task fee).
