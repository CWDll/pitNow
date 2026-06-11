# Checkout E2E Validation

결제 연동 전에 예약 루프가 DB 원천 기준으로 끝까지 이어지는지 확인하는 검증 절차입니다.

검증 대상:

- 예약 생성: `POST /api/reservations`
- 체크인: `POST /api/checkin`
- 이용 시작: `POST /api/reservations/:id/start`
- 체크아웃: `POST /api/checkout`
- DB 검증: `reservations`, `checkins`, `checkouts`, `reservation_status_logs`

## 실행 전 조건

- 로컬 앱이 실행 중이어야 합니다.
- `.env.local`에 아래 환경변수가 있어야 합니다.
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

기본 실행:

```bash
npm run dev
```

다른 터미널에서:

```bash
npm run e2e:checkout
```

앱 주소를 바꾸려면:

```bash
PITNOW_E2E_BASE_URL=http://localhost:3000 npm run e2e:checkout
```

테스트 유저를 바꾸려면:

```bash
PITNOW_E2E_EMAIL=pitnow-e2e@example.com PITNOW_E2E_PASSWORD='...' npm run e2e:checkout
```

## 스크립트 동작

`scripts/e2e-checkout-loop.mjs`는 다음 순서로 동작합니다.

1. Supabase service role로 테스트 유저를 생성하거나 재사용합니다.
2. 테스트 유저로 Supabase Auth 로그인하여 Bearer token을 발급받습니다.
3. 테스트 차량을 생성하거나 재사용합니다.
4. 시간당 요금이 있는 active bay와 legal self task를 선택합니다.
5. 미래 시간대에 Self Service 예약을 생성합니다.
6. 체크인 사진 URL 4개로 체크인을 호출합니다.
7. 이용 시작 API를 호출합니다.
8. 체크아웃 체크리스트 3개와 체크아웃 사진 URL 2개로 체크아웃을 호출합니다.
9. DB에서 아래 결과를 검증합니다.

DB 검증 조건:

- `reservations.status = COMPLETED`
- `checkins` row 존재
- 체크인 사진 4개 존재
- `checkouts` row 존재
- 체크아웃 체크리스트 3개가 모두 true
- 체크아웃 사진 2개 존재
- 상태 로그에 아래 전환이 모두 존재
- `NULL -> CONFIRMED`
- `CONFIRMED -> CHECKED_IN`
- `CHECKED_IN -> IN_USE`
- `IN_USE -> COMPLETED`

## 주의사항

- 이 스크립트는 실제 Supabase DB에 테스트 유저, 차량, 완료 예약 row를 남깁니다.
- 예약 시간은 미래 시간대를 사용하고, 겹침이 있으면 다음 시간대로 재시도합니다.
- 사진 업로드 자체는 수행하지 않고, API에 증적 URL 문자열을 전달합니다.
- Storage 업로드 검증은 사용자 화면 업로드 플로우에서 별도로 확인합니다.
- 결제 연동 전까지는 이 스크립트가 예약 루프 회귀 검증의 기준입니다.
