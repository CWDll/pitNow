# Release Checklist

PitNow Preview/Production 전환 전에 확인할 항목입니다.

## 1. Git / Deploy

- `main`이 `origin/main`과 일치하는지 확인한다.
- Vercel 최신 deployment가 성공했는지 확인한다.
- Production 배포 전에는 Vercel Preview URL에서 먼저 사용자/관리자/partner-admin 주요 경로를 확인한다.

```bash
git status --short --branch
git log --oneline --decorate --graph -5
```

## 2. Required Environment Variables

### Local / Preview / Production 공통

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_KAKAO_MAP_APP_KEY`
- `PITNOW_ADMIN_ACCESS_TOKEN`
- `PITNOW_PAYMENT_PROVIDER`

### Toss 사용 환경

- `NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY`
- `TOSS_PAYMENTS_SECRET_KEY`

### Local / E2E 권장

- `PITNOW_PAYMENT_PROVIDER=FAKE`
- `PITNOW_E2E_BASE_URL=http://localhost:3000`

### 운영 전 권장

- `PITNOW_DISABLE_DEV_AUTH_FALLBACK=true`
- `PITNOW_REQUIRE_STATUS_LOGS=true`

## 3. External Console Settings

### Kakao Developers

- Kakao Maps JavaScript SDK key는 `NEXT_PUBLIC_KAKAO_MAP_APP_KEY`에 설정한다.
- `플랫폼 키 > JavaScript 키 > JavaScript SDK 도메인`에 아래 도메인을 등록한다.
  - `http://localhost:3000`
  - `https://pit-now.vercel.app`
  - 필요한 Preview 도메인
- `제품 링크 관리 > 웹 도메인`은 Kakao Maps SDK 도메인 설정이 아니므로 지도 검증 기준으로 보지 않는다.

### Toss

- Sandbox QA는 `TOSS_TEST` provider 설정으로 진행한다.
- Production 전환 전에는 실제 승인/취소/환불 권한과 provider dashboard 접근 권한을 확인한다.

## 4. Supabase SQL Migration Checklist

아래 migration이 대상 Supabase 프로젝트에 적용되어 있어야 한다.

- `db/migrations/20260329_seed_db_first_catalog.sql`
- `db/migrations/20260329_self_maintenance_flow.sql`
- `db/migrations/20260609_reservation_status_logs.sql`
- `db/migrations/20260609_reservation_photos_storage.sql`
- `db/migrations/20260609_checkout_settlement_breakdown.sql`
- `db/migrations/20260611_auth_rls_foundation.sql`
- `db/migrations/20260611_auth_rls_hardening.sql`
- `db/migrations/20260611_user_vehicles.sql`
- `db/migrations/20260611_reservation_vehicle_link.sql`
- `db/migrations/20260611_partner_hourly_price_guard.sql`
- `db/migrations/20260611_reservation_time_window_hardening.sql`
- `db/migrations/20260611_payments_foundation.sql`
- `db/migrations/20260620_checkout_settlement_payments.sql`
- `db/migrations/20260621_storage_photo_status_hardening.sql`
- `db/migrations/20260624_partner_admin_foundation.sql`
- `db/migrations/20260626_partner_reservation_notes.sql`

특히 partner-admin 검증 전에는 아래 2개가 필수다.

- `20260624_partner_admin_foundation.sql`
- `20260626_partner_reservation_notes.sql`

현재 Supabase 적용 상태는 아래 명령으로 읽기 전용 점검한다.

```bash
npm run check:supabase
```

2026-06-28 점검 결과: 위 schema/bucket checks 통과.

## 5. Automated Verification

로컬 서버가 이미 떠 있으면 Playwright가 기존 서버를 재사용한다. 기존 서버가 Toss 모드로 떠 있으면 fake 결제 기반 테스트가 실패할 수 있으므로, 릴리즈 검증 전에는 서버 환경을 맞춘다.

권장 순서:

```bash
npm run verify:static
npm run check:supabase
npm run e2e:storage-hardening
npm run e2e:partner-admin
PITNOW_PAYMENT_PROVIDER=FAKE npm run e2e:ui
```

한 번에 실행:

```bash
npm run verify:release
```

Admin만 확인:

```bash
npm run verify:admin
```

## 6. User Manual QA

### Home / Map

- Kakao 지도 타일이 fallback 미니맵이 아니라 실제 지도로 표시된다.
- 정비소 핀에 이름 라벨이 보인다.
- `내 위치` 허용 시 빨간 점이 표시되고, 지도는 현재 위치 중심으로 가까운 줌 레벨을 유지한다.
- `내 위치` 거부 시 화면이 깨지지 않고 기본 지도/카드가 유지된다.
- 가격/평점/거리 필터가 카드 순서를 바꾼다.

### Reservation Loop

- 로그인 전 예약 진입 시 로그인으로 이동한다.
- 차량 선택, Self task 선택, 안전 동의, 시간/베이 선택이 이어진다.
- 결제 준비 후 fake 또는 Toss 승인 성공 시 예약 완료 화면으로 이동한다.
- 체크인 4장 사진 없이는 체크인이 진행되지 않는다.
- 체크인 후 start API를 통해 `IN_USE`로 전환된다.
- 체크아웃 사진/체크리스트 누락 시 완료되지 않는다.
- 초과 정산이 있으면 `/settlement-payment`로 이동한다.
- 완료 후 리뷰/영수증으로 이어진다.

## 7. Admin Manual QA

- `/admin-login`에서 admin token으로 로그인된다.
- `/admin/reservations`에서 최근 예약, 결제 상태, partner issue `Open N` badge가 보인다.
- `/admin/reservations/:id`에서 check-in evidence, checkout evidence, status timeline, Partner Field Notes가 보인다.
- `/admin/payments`에서 READY/FAILED/CANCELLED/REFUND_PENDING/REFUNDED 필터가 동작한다.
- 예약 취소는 사유, 체크박스, 확인 문구가 없으면 실행되지 않는다.
- 환불 완료/대기 상태는 provider dashboard와 대조한다.

## 8. Partner-admin Manual QA

- `/partner-admin`은 active `partner_admins` membership이 있는 사용자만 본인 정비소에 접근한다.
- 오늘/예정 예약 목록이 본인 정비소 기준으로 보인다.
- 예약 상세에서 체크인/체크아웃 증적을 확인할 수 있다.
- 베이 활성/비활성 변경 후 사용자 예약 준비 단계에서 반영된다.
- availability block 생성/수정/해제 후 겹치는 예약 준비가 `PARTNER_AVAILABILITY_BLOCKED`로 거부된다.
- 현장 메모/이슈/지연/노쇼를 생성하고 해결/다시 열기할 수 있다.
- partner field notes는 사용자 앱에는 보이지 않고 internal admin에는 보인다.

## 9. Production Cutover Notes

- Production에서는 fake provider를 사용하지 않는다.
- 운영 전에는 dev auth fallback을 꺼야 한다.
- Storage bucket은 MVP 동안 public read를 유지하되, insert는 authenticated owner/status policy가 적용되어야 한다.
- status log table 미적용을 허용하는 개발 편의 옵션은 운영에서 꺼야 한다.
- 결제/환불 수동 QA 결과와 provider dashboard 캡처 또는 기록을 남긴 뒤 production으로 전환한다.
