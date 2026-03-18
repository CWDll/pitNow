# API MVP

## Principles

- Next.js App Router
- Route Handler based API
- Supabase DB
- Mock `user_id` allowed in MVP
- All responses are JSON
- All status transitions must be explicit
- Reservation conflicts must be rejected by the DB layer

---

## 1. POST /api/reservations

Create reservation for either `SELF_SERVICE` or `SHOP_SERVICE`.

### Request

```json
{
  "reservationType": "SELF_SERVICE",
  "partnerId": "uuid",
  "bayId": "uuid",
  "startTime": "2026-03-18T10:00:00Z",
  "durationMinutes": 90
}
```

```json
{
  "reservationType": "SHOP_SERVICE",
  "partnerId": "uuid",
  "packageId": "uuid",
  "startTime": "2026-03-18T10:00:00Z"
}
```

### Rules

#### SELF_SERVICE

- `bayId` required
- `durationMinutes` required
- minimum `60 minutes`
- must be aligned to `30-minute` units
- `endTime = startTime + durationMinutes`
- `reservedEndTime = endTime`
- time-based price calculation

#### SHOP_SERVICE

- `packageId` required
- package price comes from partner-published package pricing
- package duration comes from package catalog
- `reservedEndTime` is computed by rounding package duration up to 30-minute units
- example: package duration `40` => reserved block `60`
- bay/resource can be auto-assigned internally before final insert

### Response

```json
{
  "id": "reservation_uuid",
  "status": "CONFIRMED",
  "reservationType": "SHOP_SERVICE",
  "blockedMinutes": 60,
  "totalPrice": 50000
}
```

---

## 2. POST /api/checkin

Self-service check-in and timer start.

### Request

```json
{
  "reservationId": "uuid",
  "frontImg": "url",
  "rearImg": "url",
  "leftImg": "url",
  "rightImg": "url"
}
```

### Validation

- Reservation exists
- Reservation type must be `SELF_SERVICE`
- Reservation status must be `CONFIRMED`
- Four images required
- Duplicate check-in forbidden

### Response

```json
{
  "status": "CHECKED_IN"
}
```

---

## 3. POST /api/checkout

Complete reservation and calculate extra fee where applicable.

### Request

```json
{
  "reservationId": "uuid"
}
```

### Logic

- Load reservation
- Compare server time with `reserved_end_time`
- For self-service late finish, calculate extra fee by `30-minute` ceiling unit
- Insert checkout record
- Update reservation status to `COMPLETED`

### Extra Fee

```text
diff = now - reserved_end_time
if diff <= 0 => 0
else => ceil(diff / 30min) * (hourly_price / 2)
```

### Response

```json
{
  "status": "COMPLETED",
  "extraFee": 0
}
```

---

## 4. POST /api/reservations/:id/takeover

Record professional takeover for work that the shop determines cannot finish within reserved time.

### Request

```json
{
  "reason": "cannot_finish_within_reserved_time"
}
```

### Rules

- Only valid for `SHOP_SERVICE`
- Reservation must be active
- Sets `professionalTakeover = true`
- Full labor charge remains unchanged regardless of prior progress

### Response

```json
{
  "success": true,
  "professionalTakeover": true
}
```

---

## 5. POST /api/reviews

Create review after completed reservation.

### Request

```json
{
  "reservationId": "uuid",
  "partnerId": "uuid",
  "rating": 5,
  "comment": "Fast and clear"
}
```

### Validation

- Reservation exists
- Reservation status is `COMPLETED`
- Reservation belongs to the partner
- One review per reservation
- Rating must be `1..5`

### Response

```json
{
  "success": true,
  "reviewId": "uuid"
}
```

---

## Status Transitions

### SELF_SERVICE

`CONFIRMED -> CHECKED_IN -> IN_USE -> COMPLETED`

### SHOP_SERVICE

`CONFIRMED -> IN_USE -> COMPLETED`

### Common

`CONFIRMED -> CANCELLED`

Invalid transitions return `400`.

---

## Excluded from MVP

- External payment gateway integration detail
- Automatic reassignment optimization
- Multi-resource workshop scheduling beyond bay-based blocking
- Separate helper mode
- Full admin API surface
