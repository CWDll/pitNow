# PitNow 재개 현황 정리

작성일: 2026-06-06

## 1. 한 줄 요약

PitNow는 현재 `Next.js App Router + Supabase` 기반으로 모바일 사용자 예약 루프의 화면과 주요 API가 한 바퀴 연결된 상태다. 다만 실제 결제, 실제 사진 업로드, 서버 기준 타이머 상태 전환, 관리자 콘솔, Auth/RLS, 상태 전환 로그는 아직 MVP 완성 전의 큰 빈칸으로 남아 있다.

현재 코드는 “동작 가능한 프로토타입 후반부”에 가깝고, “운영 가능한 MVP”로 가려면 DB/API 정합성 정리와 실서비스 필수 연동을 우선해야 한다.

## 2. 기준 문서상 제품 목표

Source of Truth 기준 MVP 목표는 다음 예약 루프다.

`reserve -> pay -> check-in(QR + 4 photos) -> in-use(timer) -> checkout(photo + settlement) -> review`

최신 의사결정 기준으로는 다음이 중요하다.

- `Helper mode`는 폐기되고 `Shop Service`로 대체되었다.
- `Self Service`는 법적 허용 작업 선택과 “선택 작업만 수행” 동의가 필수다.
- 예약 시간은 최소 1시간, 1시간 단위다.
- 예약 충돌은 DB 레벨에서 막아야 한다.
- 점유 충돌 기준은 `start_time ~ blocked_until(end_time + 1 hour)`이다.
- 체크인은 QR 확인과 차량 4방향 사진이 있어야 한다.
- 타이머와 초과요금은 프론트가 아니라 서버 기준이어야 한다.
- 모든 상태 전환은 명시적이어야 하고 로그가 남아야 한다.

주의할 점: `docs/Decisions.md`의 2026-03-18 항목에는 Self 추가 단위가 30분이라고 남아 있으나, 2026-03-29 결정과 `docs/Policies_MVP.md`, `docs/UI_MVP.md`, 실제 마이그레이션/코드는 1시간 단위를 따른다. 앞으로는 2026-03-29 결정을 최신 기준으로 보는 것이 맞다.

## 3. 문서화 현황

문서화는 MVP를 재개하기에 충분한 수준까지 되어 있다.

- `docs/PRD_MVP.md`: MVP 기능 범위, Self/Shop 서비스 방향, 운영 정책이 정리되어 있다.
- `docs/UserFlow_MVP.md`: Self Service 예약 플로우가 mermaid로 정리되어 있다.
- `docs/DB_MVP.md`: 핵심 테이블과 제약 조건 설계가 정리되어 있다.
- `docs/API_MVP.md`: 예약/체크인/체크아웃/리뷰 API 스펙이 정리되어 있다.
- `docs/Policies_MVP.md`: 시간, 버퍼, 노쇼, 초과요금, 체크인/체크아웃 정책이 정리되어 있다.
- `docs/Risks_MVP.md`: 법적/안전/운영 리스크와 통제 방법이 정리되어 있다.
- `docs/UI_MVP.md`: 모바일 사용자 UI와 데스크톱 관리자 UI 분리 원칙이 정리되어 있다.
- `docs/Decisions.md`: 주요 결정 로그가 append-only 형태로 남아 있다.
- `docs/2026-03-18_2way-reservation-alignment-report.md`: 2-way 예약 모델 정렬 보고서가 별도로 있다.

부족한 문서:

- 실제 구현 상태와 남은 일을 연결한 로드맵 문서가 없었다. 이 문서가 그 역할을 한다.
- PWA 요구사항은 문서에 있으나 구현 체크리스트가 없다.
- Toss 결제 연동 스펙과 결제 상태 모델이 아직 별도 문서로 없다.
- Supabase Storage, Auth/RLS, 관리자 콘솔 범위 문서가 아직 구체적이지 않다.

## 4. 실제 구현 현황

### 4.1 기술/프로젝트 상태

- Next.js `16.1.6`, React `19.2.3`, TypeScript, Tailwind CSS v4, Supabase 클라이언트가 설치되어 있다.
- `app/`, `src/lib/`, `src/domain/`, `db/`, `supabase/`, `docs/` 구조가 있다.
- `npm run lint` 통과.
- `npm run build` 통과.
- Git working tree는 이 문서 작성 전 기준으로 깨끗했다.

### 4.2 구현된 사용자 화면

모바일 사용자 플로우 화면은 대부분 존재한다.

- `/`: 홈, 파트너 목록, 평점/리뷰 집계 표시.
- `/partner/[id]`: 파트너 상세.
- `/partner/[id]/work`: Self Service 또는 Shop Service 선택, 작업/패키지 선택.
- `/partner/[id]/schedule`: 날짜/시간/베이 선택, 버퍼 포함 예약 가능 블록 표시.
- `/safety`: Self Service 안전 동의.
- `/payment`: 결제 화면 UI와 예약 API 호출.
- `/reservation-complete`: 예약 완료 후 Self는 체크인, Shop은 이용중 화면으로 이동.
- `/checkin`: QR 스캔 UI, 차량 4방향 사진 선택, 체크인 API 호출.
- `/in-use`: Self 타이머 화면, Shop 진행중 화면.
- `/checkout`: 체크리스트와 체크아웃 사진 선택, 체크아웃 API 호출.
- `/complete`: 완료 요약과 리뷰 작성/수정.
- `/reservation`: 내 예약 목록 성격의 화면.
- `/my-car`, `/mypage`, `/guide`, `/safety`: 주변 보조 화면.

### 4.3 구현된 API

- `POST /api/reservations`
  - 예약 생성.
  - 최소 1시간, 1시간 단위 검증.
  - Self 작업 선택/동의 검증.
  - `blocked_until = end_time + 1 hour` 계산.
  - DB exclusion constraint 충돌 에러 처리.
  - Self 작업/동의 테이블 저장.

- `POST /api/checkin`
  - 예약 존재 여부 확인.
  - `CONFIRMED` 상태만 체크인 허용.
  - 4방향 사진 문자열 필수.
  - `checkins` insert 후 예약 상태를 `CHECKED_IN`으로 변경.

- `POST /api/checkout`
  - `CHECKED_IN` 또는 `IN_USE` 상태만 체크아웃 허용.
  - 서버 현재 시간 기준으로 초과요금 계산.
  - `checkouts` insert 후 예약 상태를 `COMPLETED`로 변경.
  - Shop Service는 초과요금 0 처리.

- `GET/POST/PATCH /api/reviews`
  - 완료된 예약의 리뷰 조회/작성/수정.
  - 중복 리뷰 방지.
  - 파트너별 리뷰 집계 기반 마련.

- `GET /api/partners/[id]`
  - 파트너 상세 정보 조회.

- `GET /api/partner-packages`
  - 파트너별 Shop Service 패키지 조회.

### 4.4 DB/마이그레이션 현황

마이그레이션은 `db/migrations`와 `supabase/migrations`에 분산되어 있다.

구현된 핵심 테이블/개념:

- `partners`
- `bays`
- `service_packages`
- `partner_package_prices`
- `reservations`
- `self_maintenance_tasks`
- `reservation_tasks`
- `self_task_agreements`
- `checkins`
- `checkouts`
- `reviews`

중요 제약:

- `btree_gist` extension 사용.
- `reservations`에 `blocked_until`, `selected_task_count`, `helper_verify_requested`, `helper_verify_fee` 추가.
- `chk_reservation_hour_unit`: 1시간 이상, 1시간 단위.
- `chk_blocked_until_buffer`: `blocked_until = end_time + interval '1 hour'`.
- `chk_helper_verify_fee`: 헬퍼 검수 수수료 조건.
- `no_overlap`: 같은 `bay_id`에서 `tstzrange(start_time, blocked_until)` 겹침 방지. 활성 상태는 `CONFIRMED`, `CHECKED_IN`, `IN_USE`.

주의할 점:

- 문서의 `DB_MVP.md`에는 `idx_reservations_time`에서 `reserved_end_time`을 참조하지만 기본 reservations 정의에는 `reserved_end_time`이 늦게 추가되는 등 문서와 마이그레이션 간 표현 차이가 있다.
- 실제 예약 API는 오래된 DB 스키마와 최신 스키마를 동시에 맞추기 위한 fallback/compatibility 코드가 있다. 재개 후 정리 대상이다.

## 5. 완료된 것으로 볼 수 있는 범위

- MVP 핵심 사용자 여정 화면 골격은 구현되어 있다.
- Self/Shop 예약 모드 선택이 구현되어 있다.
- Self Service 법적 허용 작업 선택 UI가 있다.
- Self Service 동의 UI가 있다.
- 베이/시간 선택에서 이미 예약된 시간과 종료 후 1시간 버퍼를 고려한다.
- 예약 생성 API가 DB 충돌 방지와 연결되어 있다.
- 체크인 API가 4방향 사진 필수 조건을 검증한다.
- 타이머 화면과 서버 체크아웃 초과요금 계산이 있다.
- 완료 후 리뷰 작성/수정이 가능하다.
- 파트너/패키지/리뷰 데이터는 Supabase 기반으로 조회하려는 구조가 잡혀 있다.
- 빌드와 린트가 통과한다.

## 6. 아직 부족하거나 미완성인 범위

### 6.1 MVP 필수에 가까운 미완성

- Toss 실제 결제 연동이 없다. 현재 `/payment`는 결제 UI 후 바로 예약 API를 호출한다.
- 결제 상태 테이블/결제 승인/실패/환불 처리가 없다.
- 2026-06-09 코드/마이그레이션 추가: 체크인/체크아웃 사진을 Supabase Storage `reservation-photos` bucket에 업로드하도록 연결했다. 원격 Supabase에는 `db/migrations/20260609_reservation_photos_storage.sql` 적용이 필요하다.
- Auth가 없다. API는 `MOCK_USER_ID`를 사용한다.
- RLS 정책이 없다.
- 2026-06-09 코드/마이그레이션 추가: `reservation_status_logs` 테이블과 상태 전환 로그 유틸을 추가했다. 원격 Supabase에는 `db/migrations/20260609_reservation_status_logs.sql` 적용이 필요하다.
- 2026-06-09 해결: `POST /api/reservations/:id/start`를 추가해 `IN_USE` 상태 전환을 서버에서 명시적으로 처리한다.
- 2026-06-09 해결: `/in-use` 타이머는 start API의 `serverNow`, `startTime`, `endTime` 기준으로 계산한다.
- 2026-06-09 코드/마이그레이션 추가: 체크아웃 사진 URL과 청소/공구/폐기물 체크 결과를 `checkouts`에 저장하도록 연결했다. 원격 Supabase에는 `db/migrations/20260609_reservation_photos_storage.sql` 적용이 필요하다.
- 2026-06-09 코드/마이그레이션 추가: 체크아웃 시점 helper verification 추가 요청/정산과 settlement breakdown 저장을 구현했다. 원격 Supabase에는 `db/migrations/20260609_checkout_settlement_breakdown.sql` 적용이 필요하다.

### 6.2 UX/운영 측면 미완성

- PWA manifest/service worker/installable 설정이 없다.
- 2026-06-09 1차 해결: 관리자 콘솔 `/admin`, `/admin/reservations`, `/admin/settlement`, `/admin/packages`를 추가했다. 아직 편집/권한/운영 액션은 없다.
- 예약 연장 API와 실제 상태/요금 반영이 없다.
- SOS 버튼과 매장 연락 버튼은 UI만 있다.
- QR 스캔은 실제 카메라/QR 검증이 아니라 버튼 토글이다.
- 차량 정보는 localStorage mock 데이터다.
- 예약 목록은 실데이터 연동 수준을 더 확인/보강해야 한다.
- 지도 기능은 실제 지도 SDK 연동이 없다.
- 모바일 전용 전략은 CSS max-width wrapper로 어느 정도 구현되어 있지만, PWA 모바일 UX 검증은 아직 필요하다.

### 6.3 코드 품질/정합성 정리 대상

- 2026-06-09 해결: `ReservationType` / 예약 생성 payload / DB `reservation_type`을 `SELF_SERVICE | SHOP_SERVICE` 기준으로 정리했다.
- 2026-06-09 해결: 예약 API의 과거 `reservation_type` 후보 시도와 하드코딩 작업 allowlist를 제거했다.
- 2026-06-09 해결: 예약 API의 하드코딩 시간요금을 제거하고 파트너 `hourly_price` 기준으로 계산한다.
- 2026-06-09 해결: Shop Service 예약은 `packageId`, 패키지 소요시간, 파트너별 가격을 서버에서 검증한다.
- 스케줄 화면의 시간 계산은 `Date.UTC`를 사용한다. 한국 현지 영업시간 기준 예약이라면 timezone 정책을 명시하고 검증해야 한다.
- API 응답 에러 형태가 `{ error: string }`와 `{ success:false, error:{code,message} }`로 섞여 있다.
- DB 마이그레이션 위치가 `db/migrations`와 `supabase/migrations`에 나뉘어 있다. 운영 적용 기준을 하나로 정해야 한다.

## 7. 추천 작업 순서

### 1단계: 기준 정리와 DB/API 정합성 고정

가장 먼저 할 일은 스키마와 타입 이름을 하나로 고정하는 것이다.

- `SELF_SERVICE`, `SHOP_SERVICE`를 DB/API/domain 공통 표준으로 확정.
- `bookingMode: SELF | PACKAGE`는 UI 내부 용어로만 둘지, API에서도 표준 타입을 쓸지 결정.
- `reservations` 최신 스키마를 기준으로 API fallback 코드 제거.
- `partner_id`, `reservation_type`, `package_id`, `duration_minutes`, `reserved_end_time`, `blocked_until` 의미를 문서와 코드에서 일치.
- 2026-06-09 해결: 파트너별 `hourly_price`로 Self 가격 계산.
- 2026-06-09 해결: Shop Service 예약 생성 API에 package id/duration/price 검증 추가.

### 2단계: 상태 전환을 서버 중심으로 완성

- 2026-06-09 코드/마이그레이션 추가: `reservation_status_logs` 테이블 추가.
- 2026-06-09 부분 해결: 예약 생성, 체크인, 이용 시작, 체크아웃 상태 전환 로그 연결. 취소 전환은 아직 취소 API와 함께 필요.
- 2026-06-09 해결: `POST /api/reservations/[id]/start`에서 `IN_USE` 전환 처리.
- 2026-06-09 해결: 프론트 타이머는 서버에서 내려준 `serverNow`, `end_time` 기준으로 표시.
- 허용되지 않는 상태 전환을 API 단에서 일관되게 차단.

### 3단계: 사진/Storage 실연동

- 2026-06-09 코드/마이그레이션 추가: Supabase Storage bucket 설계.
- 2026-06-09 코드 추가: 체크인 4방향 사진 업로드 후 URL 저장.
- 2026-06-09 코드/마이그레이션 추가: 체크아웃 사진 업로드 후 URL 저장.
- 업로드 실패 시 상태 전환이 일어나지 않도록 처리.
- 2026-06-09 코드/마이그레이션 추가: 파일 타입/크기 제한 정책 추가.

### 4단계: 결제 MVP 연동

- Toss 결제 플로우 설계 문서 추가.
- 결제 대기/승인/실패 상태 모델 추가.
- 결제 승인 성공 후에만 예약 `CONFIRMED`.
- 예약 충돌과 결제 사이 race condition 처리 정책 결정.

### 5단계: 관리자와 운영 화면

- `/admin` layout 분리.
- 예약 현황/체크인 사진/체크아웃/정산 모니터링.
- 파트너 패키지 가격 관리.
- Desktop only UI로 구현.
- 2026-06-09 1차 구현: Desktop only admin layout과 예약/정산/패키지 조회 테이블 추가.

### 6단계: PWA/모바일 마감

- `manifest.json`, app icons, installability.
- 모바일 viewport QA.
- 홈 지도/검색/필터 고도화.
- 실제 QR 스캔.
- 예약 연장/SOS/매장 연락 기능.

## 8. 다음 개발 시작 제안

바로 개발을 재개한다면 첫 작업은 다음 중 하나가 좋다.

1. 스키마/API 정합성 정리
   - 장점: 뒤 작업 전체가 안정된다.
   - 단점: 사용자 눈에 보이는 변화는 적다.

2. Storage 기반 사진 업로드 구현
   - 장점: 체크인/체크아웃 핵심 MVP 체감 완성도가 오른다.
   - 단점: Auth/RLS 전이면 보안 정책을 임시로 설계해야 한다.

추천은 1번이다. 현재 코드가 빌드되는 좋은 상태라서, 먼저 타입/DB/API 이름과 fallback을 정리하면 이후 결제, Storage, 관리자 작업이 덜 흔들린다.

## 9. 검증 기록

2026-06-06 기준 로컬에서 확인한 결과:

```bash
npm run lint
```

성공.

```bash
npm run build
```

성공. Next.js가 20개 app route/page를 정상 빌드했다.

## 10. 2026-06-09 업데이트

스키마/API 정합성 1차 정리를 진행했다.

- API/DB/domain의 공식 예약 타입을 `SELF_SERVICE` / `SHOP_SERVICE`로 고정했다.
- `/api/reservations`는 더 이상 과거 reservation_type 후보값을 시도하지 않는다.
- 예약 생성 payload는 `bookingMode` 대신 `reservationType`을 사용한다.
- `bookingMode: SELF | PACKAGE`는 사용자 화면 탭/쿼리 표현으로만 남겼다.
- Self Service 가격은 API에서 파트너 `hourly_price` 기준으로 계산한다.
- Self Service helper verification fee는 API에서 `self_maintenance_tasks.helper_verify_unit_fee` 기준으로 계산한다.
- Shop Service는 `packageId` 필수이며 파트너 패키지 가격/소요시간을 서버에서 검증한다.
- 체크아웃 API의 과거 예약 타입 fallback도 제거했다.

검증:

- `npm run lint` 성공.
- `npm run build` 성공.
- 실제 `/api/reservations` 호출로 잘못된 `reservationType: SELF`가 `INVALID_INPUT`으로 거부되는 것을 확인.
- 실제 Self Service 예약 생성, 중복 예약 거부(`RESERVATION_OVERLAP`), 테스트 데이터 cleanup 확인.
- 실제 Shop Service 예약 생성과 테스트 데이터 cleanup 확인.

## 11. 2026-06-09 상태 전환 업데이트

상태 전환 서버 중심화 1차 정리를 진행했다.

- `db/migrations/20260609_reservation_status_logs.sql` 추가.
- `src/lib/reservation-status.ts` 추가.
- 예약 생성, 체크인, 이용 시작, 체크아웃 상태 전환 로그 연결.
- `POST /api/reservations/[id]/start` 추가.
- Self Service는 `CHECKED_IN -> IN_USE`, Shop Service는 `CONFIRMED -> IN_USE`로 명시 전환.
- `/in-use` 화면은 start API 응답의 `serverNow` 기준으로 타이머를 계산.

검증:

- `npm run lint` 성공.
- `npm run build` 성공.
- 실제 Self Service API smoke test로 `CONFIRMED -> CHECKED_IN -> IN_USE -> COMPLETED` 확인 후 cleanup.
- 실제 Shop Service API smoke test로 `CONFIRMED -> IN_USE -> COMPLETED` 확인 후 cleanup.

주의:

- 원격 Supabase에 `reservation_status_logs` 테이블을 적용했고, 현재 anon-key 기반 개발 단계에 맞춰 RLS는 꺼둔 상태다.
- 운영 전 Auth/RLS 전환 시에는 `reservation_status_logs`에도 RLS policy 또는 server-only service role 경로를 설계해야 한다.

## 12. 2026-06-09 Storage 업데이트

사진 증적 Storage 연동 1차 구현을 진행했다.

- `db/migrations/20260609_reservation_photos_storage.sql` 추가.
- Supabase Storage bucket `reservation-photos` 설계.
- 체크인 4방향 사진을 Storage에 업로드한 뒤 `/api/checkin` 호출.
- 체크아웃 사진 2장을 Storage에 업로드한 뒤 `/api/checkout` 호출.
- `checkouts`에 `tool_check_completed`, `cleaning_completed`, `waste_disposal_completed`, `checkout_photo_1`, `checkout_photo_2` 컬럼 추가.
- Self Service 체크아웃 API는 체크리스트 3개와 사진 2장을 필수 검증.

주의:

- 원격 Supabase에는 `db/migrations/20260609_reservation_photos_storage.sql` 적용이 필요하다.
- 현재 MVP 개발 단계는 public bucket + anon upload policy를 사용한다.
- 운영 전에는 private bucket/signed URL/Auth/RLS/server-only service role 중 하나로 전환해야 한다.

검증:

- 실제 Storage 업로드 6장(체크인 4장, 체크아웃 2장) 성공.
- `checkins`에 Storage public URL 4개 저장 확인.
- `checkouts`에 체크리스트 3개와 체크아웃 사진 URL 2개 저장 확인.
- 상태 로그 `CONFIRMED -> CHECKED_IN -> IN_USE -> COMPLETED` 유지 확인.
- 테스트 Storage object 6개와 테스트 DB row cleanup 확인.

## 13. 2026-06-09 정산 업데이트

체크아웃 정산 breakdown 1차 구현을 진행했다.

- `db/migrations/20260609_checkout_settlement_breakdown.sql` 추가.
- `checkouts`에 `base_price`, `helper_verify_requested`, `helper_verify_fee`, `total_settlement` 컬럼 추가.
- `/api/checkout`이 `basePrice`, `extraFee`, `helperVerifyFee`, `totalSettlement`를 서버에서 확정해 응답.
- 체크아웃 시점 helper verification 추가 요청 지원.
- 예약 시 이미 helper verification을 선택한 경우 중복 청구하지 않도록 기본가와 helper fee를 분리.
- 완료 화면은 체크아웃 API 응답에서 전달된 정산 breakdown을 표시.

주의:

- 원격 Supabase에는 `db/migrations/20260609_checkout_settlement_breakdown.sql` 적용이 필요하다.

검증:

- 정상 체크아웃: `basePrice 15000 + extraFee 0 + helperVerifyFee 0 = totalSettlement 15000` 확인.
- 체크아웃 시 helper verification 추가 요청: `15000 + 0 + 7000 = 22000` 확인.
- 예약 시 helper verification 선선택 후 체크아웃 재요청: 중복 청구 없이 `15000 + 0 + 7000 = 22000` 확인.
- API 응답과 `checkouts` DB 저장값 일치 확인.
- 테스트 Storage object 18개와 테스트 DB row cleanup 확인.

## 14. 2026-06-09 PWA 업데이트

PWA 1차 적용을 진행했다.

- `app/manifest.ts` 추가.
- PitNow 앱 메타데이터, 모바일 viewport, theme color, Apple Web App 설정 추가.
- `public/icons/`에 SVG 원본과 192/512/180 PNG 아이콘 세트 추가.
- `public/sw.js` 서비스워커 추가.
- `app/pwa-register.tsx`에서 서비스워커 등록.
- 오프라인 navigation fallback용 `public/offline.html` 추가.

범위:

- MVP에서는 설치 가능성과 오프라인 안내까지만 지원한다.
- 예약/결제/체크인/체크아웃 데이터 변경은 오프라인 처리하지 않는다.
- 실제 iOS/Android 설치 UX는 실기기 또는 브라우저 Lighthouse로 추가 확인이 필요하다.

검증:

- `npm run lint` 성공.
- `npm run build` 성공.
- `GET /manifest.webmanifest` 응답 `200`, content-type `application/manifest+json` 확인.
- Manifest 필수 필드 `name`, `short_name`, `start_url`, `display`, `icons` 누락 없음 확인.
- Manifest `display=standalone`, `start_url=/` 확인.
- Manifest icon set에 `192x192`, `512x512`, `maskable 192x192`, `maskable 512x512` 포함 확인.
- `GET /sw.js` 응답 `200`, content-type `application/javascript` 확인.
- `GET /offline.html` 응답 `200`, content-type `text/html` 확인.
- `GET /icons/icon-192.png`, `GET /icons/maskable-512.png` 응답 `200`, content-type `image/png` 확인.
- `file public/icons/*.png`로 PNG 치수 확인: apple 180, icon 192/512, maskable 192/512.

## 15. 2026-06-09 상태 전환 / 서버 타이머 검증

예약 상태 전환을 서버 API 기준으로 검증했다.

- 예약 생성 시 `CONFIRMED` 저장 및 `reservation_status_logs` 기록 확인.
- Self Service는 `CONFIRMED` 상태에서 바로 `/api/reservations/[id]/start` 호출 시 `400 INVALID_RESERVATION_STATUS`로 거부되는 것 확인.
- 체크인 API 호출 후 `CONFIRMED -> CHECKED_IN` 전환 및 로그 기록 확인.
- `/api/reservations/[id]/start` 호출 후 `CHECKED_IN -> IN_USE` 전환, `serverNow`, `startTime`, `endTime`, `totalPrice` 응답 확인.
- 이미 `IN_USE`인 예약에 start API를 다시 호출하면 상태를 중복 변경하지 않고 현재 서버 기준 시간만 다시 내려주는 idempotent 동작 확인.
- 체크아웃 API 호출 후 `IN_USE -> COMPLETED` 전환, 정산 응답, 로그 기록 확인.
- 프론트 `in-use` 화면은 start API 응답의 `serverNow`를 기준으로 로컬 clock offset을 계산하고, `calculateRemainingTimeAt` / `calculateOverduePreviewAt`로 표시한다.

검증한 로그 순서:

```text
null -> CONFIRMED
CONFIRMED -> CHECKED_IN
CHECKED_IN -> IN_USE
IN_USE -> COMPLETED
```

테스트 DB row cleanup:

- `reservation_status_logs`
- `reservation_tasks`
- `self_task_agreements`
- `checkins`
- `checkouts`
- `reservations`

남은 테스트 예약이 `[]`인 것까지 확인했다.

## 16. 2026-06-09 Admin Console 1차 구현

관리자 콘솔의 MVP 기반을 추가했다.

- `/admin`: 운영 지표 overview.
- `/admin/reservations`: 최근 100개 예약의 상태, 타입, 파트너, 베이, 예약 시간, 버퍼 종료, 금액 확인.
- `/admin/settlement`: 최근 100개 체크아웃의 base/extra/helper/total settlement와 체크리스트 증적 상태 확인.
- `/admin/packages`: 파트너별 Shop Service 패키지 가격과 활성 상태 확인.
- 사용자 모바일 layout과 공유하지 않는 별도 `app/admin/layout.tsx` 추가.
- Admin layout은 `min-w-[1024px]` 기준의 desktop only UI로 구성.
- 데이터 조회 helper는 `app/admin/_lib/admin-data.ts`에 분리.

검증:

- `npm run lint` 성공.
- `npm run build` 성공.
- 빌드 라우트에 `/admin`, `/admin/packages`, `/admin/reservations`, `/admin/settlement` 포함 확인.
- 실제 HTTP 요청으로 `GET /admin`, `GET /admin/reservations`, `GET /admin/settlement`, `GET /admin/packages` 모두 `200 text/html` 응답 확인.

남은 일:

- Admin 인증/권한 분리.
- 예약 취소/강제 완료/노쇼 처리 같은 운영 액션.

## 17. 2026-06-11 Auth/RLS 1차 구현

Auth/RLS 기반 작업을 시작했다.

- `src/lib/auth.ts` 추가: API 요청에서 Supabase Bearer token을 검증하고 `auth.users.id`를 사용자 기준으로 사용.
- 로컬 개발에서는 `PITNOW_DEV_USER_ID` fallback을 허용. production에서는 인증 없는 mutation 거부.
- `src/lib/auth-fetch.ts` 추가: 클라이언트 API 호출 시 로그인 세션 access token을 자동 첨부.
- 예약 생성/체크인/이용 시작/체크아웃/리뷰 API를 사용자 소유 예약 기준으로 전환.
- `/admin-login` 추가 및 `/admin` layout 접근을 `PITNOW_ADMIN_ACCESS_TOKEN` 쿠키 로그인으로 보호.
- Admin 조회 helper는 RLS 이후를 대비해 `SUPABASE_SERVICE_ROLE_KEY` 기반 서버 전용 client를 사용.
- `db/migrations/20260611_auth_rls_foundation.sql` 추가.

주의:

- 원격 Supabase에는 `db/migrations/20260611_auth_rls_foundation.sql` 적용이 필요하다.
- RLS 적용 후 Admin 콘솔 데이터를 보려면 `SUPABASE_SERVICE_ROLE_KEY` 환경변수가 필요하다.
- Storage bucket은 아직 public read를 유지한다. 운영 전 private bucket + signed read URL 전환을 권장한다.

## 18. 2026-06-11 사용자 Auth UI 1차 구현

Supabase Auth 로그인/세션 UI를 연결했다.

- `/login` 추가: email/password 로그인과 회원가입 지원.
- `/mypage`에서 로그인 상태, 사용자 이메일, 로그아웃 버튼 표시.
- 예약 생성, 체크인, 이용 시작, 체크아웃, 리뷰 저장 전 클라이언트 세션 확인.
- 세션이 없으면 `/login?next=현재경로`로 이동.
- `/reservation` 예약 내역을 브라우저 Supabase 세션 기준 조회로 전환.

주의:

- Supabase Auth 이메일 확인 설정이 켜져 있으면 회원가입 후 메일 인증이 필요할 수 있다.
- 추후 UX 개선 단계에서 비밀번호 재설정, 소셜 로그인, 휴대폰 OTP를 추가할 수 있다.
- 패키지 가격 편집.
- 정산 상세 drill-down.

## 19. 2026-06-11 사용자별 차량 데이터 전환

`/my-car`와 예약 전 차량 선택을 Supabase Auth 사용자 기준으로 전환했다.

- `vehicles` 테이블과 사용자 소유 RLS migration 추가.
- `/my-car`는 로그인한 사용자의 차량만 조회/추가/삭제/대표 설정한다.
- 사용자는 같은 차량 번호를 중복 등록할 수 없다.
- 사용자당 대표 차량은 1대만 허용한다.
- 대표 차량 변경은 `set_active_vehicle(uuid)` DB 함수로 원자적으로 처리한다.
- `/partner/[id]/work`는 localStorage mock 차량 대신 로그인 사용자의 `vehicles`를 읽는다.
- 차량이 없으면 예약 진행을 막고 `/my-car` 등록으로 안내한다.

## 20. 2026-06-11 Auth/RLS hardening 정리

스키마/API 정합성 이후 보안 경계를 재점검하고 Auth/RLS 기준을 고정했다.

- 사용자 소유 API는 Supabase Bearer token을 우선 검증하고 `auth.users.id`를 예약/차량 소유권 기준으로 사용한다.
- 운영에서는 인증 없는 사용자 API fallback이 차단되며, 검증 환경은 `PITNOW_DISABLE_DEV_AUTH_FALLBACK=true` 사용을 권장한다.
- `/admin`은 모바일 사용자 Auth와 분리된 cookie guard를 사용하고, RLS 적용 후 조회는 service-role client로 제한한다.
- `reservation-photos` storage의 anonymous insert policy를 hardening migration에서 다시 제거한다.
- 사진 bucket은 MVP 표시 호환성을 위해 public read를 유지하지만, check-in/checkout 사진 업로드는 authenticated reservation owner만 가능하게 고정한다.

검증해야 할 항목:

- `npm run lint`
- `npm run build`
- 잘못된 Bearer token으로 사용자 API가 `401 INVALID_AUTH_TOKEN`을 반환하는지 HTTP smoke test
- admin cookie 없이 `/admin` 접근이 `/admin-login`으로 redirect 되는지 HTTP smoke test

## 21. 2026-06-11 상태 전환 공통 유틸 정리

예약 상태 머신 진입점을 `src/lib/reservation-status.ts`로 모았다.

- `transitionReservationStatus` 추가.
- 체크인 `CONFIRMED -> CHECKED_IN`, 이용 시작 `CHECKED_IN/CONFIRMED -> IN_USE`, 체크아웃 `CHECKED_IN/IN_USE -> COMPLETED`가 공통 유틸을 경유한다.
- 상태 변경 로그 저장 실패 시 예약 상태를 이전 상태로 rollback한다.
- production 또는 `PITNOW_REQUIRE_STATUS_LOGS=true`에서는 `reservation_status_logs` 누락도 상태 전환 실패로 처리한다.
- 예약 생성의 `null -> CONFIRMED` 로그도 같은 fatal 판단 기준을 사용한다.

검증:

- `npm run lint`
- `npm run build`
- invalid Bearer token 사용자 API smoke test
- `/admin` no-cookie redirect smoke test

## 22. 2026-06-11 예약 시간창/중복 방지 hardening

예약 시간 기준을 `end_time`과 `blocked_until`으로 분리해 정리했다.

- `db/migrations/20260611_reservation_time_window_hardening.sql` 추가.
- `reserved_end_time`은 호환 컬럼으로 유지하되 `end_time`과 같도록 constraint를 둔다.
- `blocked_until`은 `end_time + 1 hour`이며 DB exclusion constraint의 겹침 판단 기준으로 고정한다.
- 스케줄 화면 예약 조회는 `blocked_until > dayStart`를 사용해 전날 예약 버퍼가 당일 슬롯을 침범하는 경우도 비활성화한다.
- 체크아웃 초과요금은 `blocked_until`이 아니라 사용자 예약 종료 시각인 `end_time` 기준으로 계산한다.

검증:

- `npm run lint`
- `npm run build`
- 스케줄 페이지 HTTP smoke test
- invalid Bearer token 사용자 API smoke test

주의:

- 원격 Supabase에는 `db/migrations/20260611_user_vehicles.sql` 적용이 필요하다.
- 기존 localStorage mock 차량은 더 이상 사용자 예약 플로우에 사용하지 않는다.

## 20. 2026-06-11 예약-차량 FK 연결

예약 생성 시 선택 차량을 `reservations.vehicle_id`에 저장하도록 연결했다.

- `db/migrations/20260611_reservation_vehicle_link.sql` 추가.
- `POST /api/reservations`는 `vehicleId`를 필수로 받고 사용자 소유 차량인지 검증한다.
- 결제 화면은 선택된 `carId`를 예약 생성 payload의 `vehicleId`로 전송한다.
- `/reservation` 예약 내역은 저장된 vehicle relation으로 차량명을 표시한다.
- `/admin/reservations`에도 차량명을 표시한다.

주의:

- 원격 Supabase에는 `db/migrations/20260611_reservation_vehicle_link.sql` 적용이 필요하다.
- 기존 예약 row는 `vehicle_id`가 null일 수 있으므로 화면에서는 `등록 차량` 또는 `-` fallback을 유지한다.

## 21. 2026-06-11 예약 상세 DB hydrate

예약 완료/상세 화면을 `reservationId` 기준 DB 원천으로 복원하도록 보강했다.

- `GET /api/reservations/:id` 추가.
- 로그인 사용자 소유 예약만 상세 조회 가능하다.
- API는 지점, 베이, 차량, 작업/패키지, KST 날짜 라벨, 금액을 화면용으로 조립한다.
- `/reservation-complete`는 URL query를 초기 fallback으로 쓰되, 상세 API 결과로 화면과 다음 단계 query를 덮어쓴다.

검증:

- `GET /api/reservations/05d446b2-9e8b-4bab-aa7f-50116d2f14c8` 응답 확인.
- `npm run lint` 성공.
- `npm run build` 성공.

## 22. 2026-06-11 체크인 화면 DB hydrate

체크인 화면을 `reservationId` 기준 DB 원천으로 복원하도록 보강했다.

- `/checkin`은 `reservationId`가 있으면 `GET /api/reservations/:id`를 호출한다.
- 지점, 베이, 차량, 작업, KST 시간, 상태를 체크인 화면에 표시한다.
- 체크인 완료 후 `/in-use`로 넘기는 query는 hydrate된 상세값을 사용한다.
- `CONFIRMED`가 아닌 예약은 체크인 버튼을 비활성화하고 상태 안내를 표시한다.

검증:

- `GET /checkin?reservationId=05d446b2-9e8b-4bab-aa7f-50116d2f14c8` 200 응답 확인.
- `GET /checkin` 200 응답 확인.
- `npm run lint` 성공.
- `npm run build` 성공.

## 23. 2026-06-11 이용 중 화면 DB hydrate

`/in-use` 화면을 `reservationId` 기준 DB 상세와 start API 기준으로 복원하도록 보강했다.

- `/in-use`는 `GET /api/reservations/:id`로 지점, 베이, 차량, 작업, 상태, 금액을 hydrate한다.
- `/api/reservations/:id/start`는 서버 기준 `serverNow`, `startTime`, `endTime`, `totalPrice` 보정에 사용한다.
- `/checkout` 이동 query와 Shop Service 완료 직행 query는 hydrate된 상세값을 우선 사용한다.
- 상세 hydrate 실패 시 URL fallback 화면을 유지하되 오류 메시지를 표시한다.

검증:

- `GET /in-use?reservationId=05d446b2-9e8b-4bab-aa7f-50116d2f14c8` 200 응답 확인.
- `npm run lint` 성공.
- `npm run build` 성공.

## 24. 2026-06-11 체크아웃 화면 DB hydrate

`/checkout` 화면을 `reservationId` 기준 DB 상세와 checkout API 확정 금액 기준으로 복원하도록 보강했다.

- `/checkout`은 `GET /api/reservations/:id`로 지점, 베이, 차량, 작업, KST 시간, 상태, 금액을 hydrate한다.
- 체크아웃 버튼은 `CHECKED_IN` 또는 `IN_USE` 상태에서만 활성화된다.
- 완료 화면으로 넘기는 예약 정보는 hydrate된 상세값을 사용한다.
- `basePrice`, `extraFee`, `helperVerifyFee`, `totalSettlement`는 `/api/checkout` 응답값을 우선 사용한다.

검증:

- `GET /checkout?reservationId=05d446b2-9e8b-4bab-aa7f-50116d2f14c8` 200 응답 확인.
- `npm run lint` 성공.
- `npm run build` 성공.

## 25. 2026-06-11 완료 화면 DB hydrate

`/complete` 화면을 `reservationId` 기준 예약 상세와 체크아웃 정산 row 기준으로 복원하도록 보강했다.

- `GET /api/checkouts?reservationId=...` 추가.
- API는 로그인 사용자 소유 예약의 `checkouts` row만 반환한다.
- `/complete`는 예약 상세 API로 지점, 차량, 작업, 시간, 상태를 hydrate한다.
- 결제 요약은 체크아웃 상세 API의 `basePrice`, `extraFee`, `helperVerifyFee`, `totalSettlement`를 우선 사용한다.
- API hydrate 실패 시 URL fallback을 유지하되 오류 메시지를 표시한다.

검증:

- `GET /api/checkouts?reservationId=05d446b2-9e8b-4bab-aa7f-50116d2f14c8` 성공 응답 확인.
- `GET /complete?reservationId=05d446b2-9e8b-4bab-aa7f-50116d2f14c8` 200 응답 확인.
- `npm run lint` 성공.
- `npm run build` 성공.

## 26. 2026-06-11 예약 내역 목록 DB 표시 정합성

`/reservation` 목록의 지점/베이/패키지/작업명을 mock 데이터가 아니라 Supabase DB 기준으로 조립하도록 보강했다.

- 예약 목록 조회 후 파트너, 베이, 패키지, 예약 작업, 작업 카탈로그를 ID map으로 추가 조회한다.
- Self Service 목록 작업명은 `reservation_tasks -> self_maintenance_tasks` 기준으로 표시한다.
- Shop Service 목록 작업명은 `service_packages` 기준으로 표시한다.
- 예약 카드 링크는 query fallback을 유지하되, 이후 화면들은 `reservationId` 기준 DB hydrate를 우선 사용한다.

검증:

- `GET /reservation` 200 응답 확인.
- `npm run lint` 성공.
- `npm run build` 성공.

## 27. 2026-06-11 사용자 영수증 / Admin 증적 drill-down

사용자 영수증 화면과 Admin 예약 상세 drill-down을 추가했다.

- `/receipt?reservationId=...` 추가.
- 완료 화면의 `영수증` 버튼을 `/receipt`로 연결.
- 영수증 화면은 예약 상세 API와 체크아웃 상세 API를 함께 hydrate해 이용 정보와 정산 breakdown을 표시한다.
- `getAdminReservationDetail()` 추가.
- `/admin/reservations/:id` 추가.
- Admin 예약 목록의 Reservation ID를 상세 링크로 전환.
- Admin 정산 목록의 Evidence badge를 상세 링크로 전환.
- Admin 상세에서 예약 정보, 체크인 사진 4장, 체크아웃 체크리스트, 체크아웃 사진 2장, 정산, 상태 전환 로그를 확인할 수 있다.

검증:

- `GET /receipt?reservationId=05d446b2-9e8b-4bab-aa7f-50116d2f14c8` 200 응답 확인.
- Admin token 쿠키 포함 `GET /admin/reservations/05d446b2-9e8b-4bab-aa7f-50116d2f14c8` 200 응답 확인.
- Admin token 없이 동일 URL 요청 시 `/admin-login` 307 리다이렉트 확인.
- `npm run lint` 성공.
- `npm run build` 성공.

## 28. 2026-06-11 Admin 예약 취소 1차 액션

Admin에서 `CONFIRMED` 예약을 `CANCELLED`로 변경하는 1차 운영 액션을 추가했다.

- `POST /api/admin/reservations/:id/cancel` 추가.
- Admin token cookie 검증 후 service role client로 상태를 변경한다.
- `CONFIRMED` 상태에서만 취소 가능하다.
- 취소는 `transitionReservationStatus()`를 사용해 상태 업데이트와 로그 저장을 함께 처리한다.
- 취소 사유는 `reservation_status_logs.metadata.reason`에 저장한다.
- `/admin/reservations/:id`에 예약 취소 form을 추가했다.

검증:

- Admin token 없이 취소 API 호출 시 `ADMIN_AUTH_REQUIRED` 응답 확인.
- 완료된 seed 예약 취소 시도 시 `INVALID_RESERVATION_STATUS` 응답 확인.
- Admin token 쿠키 포함 `/admin/reservations/:id` 200 응답 확인.
- `npm run lint` 성공.
- `npm run build` 성공.

주의:

- 실제 `CONFIRMED` 예약 취소 성공 케이스는 원격 DB 상태를 변경하므로 자동 검증에서 실행하지 않았다.
- `CHECKED_IN`, `IN_USE`, `COMPLETED` 취소/환불은 결제 정책 확정 후 별도 액션으로 추가한다.

## 29. 2026-06-11 Admin 증적 누락 사유 / 리뷰 표시

Admin 예약 상세에서 증적 누락 사유와 고객 리뷰를 함께 확인할 수 있도록 보강했다.

- `getAdminReservationDetail()`이 리뷰 row를 함께 조회한다.
- 체크인 row, 체크인 사진 4장, 체크아웃 row, 체크아웃 체크리스트, 체크아웃 사진 2장을 기준으로 `evidenceIssues`를 계산한다.
- Admin 상세 상단에 `Evidence status` 요약 카드 추가.
- 누락 사유가 있으면 `Review`와 누락 항목 chip을 표시한다.
- 고객 리뷰가 있으면 별점, 코멘트, 작성 시각을 표시한다.
- 리뷰가 없으면 별도 empty state를 표시한다.

검증:

- Admin token 쿠키 포함 `/admin/reservations/:id` 200 응답 확인.
- Admin token 없이 동일 URL 요청 시 `/admin-login` 307 리다이렉트 확인.
- `npm run lint` 성공.
- `npm run build` 성공.

## 30. 2026-06-11 사용자 예약 취소 1차 액션

사용자가 본인 `CONFIRMED` 예약을 취소할 수 있는 1차 액션을 추가했다.

- `POST /api/reservations/:id/cancel` 추가.
- 로그인 사용자 본인 소유 예약만 취소 가능하다.
- `CONFIRMED` 상태에서만 `CANCELLED`로 전환 가능하다.
- 취소는 `transitionReservationStatus()`를 사용해 상태 업데이트와 로그 저장을 함께 처리한다.
- 취소 사유는 `reservation_status_logs.metadata.reason`에 저장한다.
- `/reservation` 목록의 `CONFIRMED` 예약 카드에 취소 form을 추가했다.
- 취소 성공 시 목록에서 해당 예약을 지난 이용의 `CANCELLED` 상태로 즉시 이동한다.

검증:

- 완료된 seed 예약 취소 시도 시 `INVALID_RESERVATION_STATUS` 응답 확인.
- `GET /reservation` 200 응답 확인.
- `npm run lint` 성공.
- `npm run build` 성공.

주의:

- 실제 `CONFIRMED` 예약 취소 성공 케이스는 원격 DB 상태를 변경하므로 자동 검증에서 실행하지 않았다.
- 체크인 이후 취소/환불은 결제 정책 확정 후 별도 액션으로 추가한다.

## 31. 2026-06-11 체크아웃 E2E 검증 스크립트

결제 연동 전 예약 루프 회귀 검증을 위한 체크아웃 E2E 스크립트와 문서를 추가했다.

- `scripts/e2e-checkout-loop.mjs` 추가.
- `npm run e2e:checkout` script 추가.
- `docs/Checkout_E2E.md` 추가.
- 스크립트는 Supabase Auth 테스트 유저를 생성/재사용하고 실제 Bearer token으로 API를 호출한다.
- 테스트 차량, active bay, legal self task를 준비한다.
- API 순서: 예약 생성 → 체크인 → 이용 시작 → 체크아웃.
- DB 검증: `reservations`, `checkins`, `checkouts`, `reservation_status_logs`.

검증:

- `npm run e2e:checkout` 성공.
- 생성된 검증 예약 ID: `19846a7e-0ad2-4d9d-a346-64820b5dc212`.
- 최종 상태 `COMPLETED` 확인.
- 체크인 사진 4개, 체크아웃 체크리스트 3개, 체크아웃 사진 2개 DB 저장 확인.
- 상태 로그 `NULL -> CONFIRMED -> CHECKED_IN -> IN_USE -> COMPLETED` 확인.
- `npm run lint` 성공.
- `npm run build` 성공.

주의:

- E2E 스크립트는 실제 Supabase DB에 테스트 유저/차량/완료 예약 row를 남긴다.
- 사진 업로드 자체는 수행하지 않고 증적 URL 문자열을 API에 전달한다.

## 32. 2026-06-11 결제 MVP 상태 모델 설계

결제 연동 전 `payments` 테이블/API 상태 모델과 예약 확정 순서를 문서화했다.

- `docs/Payment_MVP.md` 추가.
- `docs/DB_MVP.md`에 `payments` 스키마/RLS 기준 추가.
- `docs/API_MVP.md`에 `/api/payments/prepare`, `/api/payments/confirm`, `/api/payments/fail` 추가.
- 예약 `CONFIRMED` row는 결제 승인 검증 이후에만 생성하는 payment-first flow로 고정했다.
- 결제 전 임시 예약 hold는 MVP에서 제외하고, 결제 승인 후 slot race가 생기면 자동 취소/환불 또는 `REFUND_PENDING`으로 기록한다.
- Local/E2E는 `PITNOW_PAYMENT_PROVIDER=FAKE`로 실제 결제 없이 prepare/confirm 흐름을 검증한다.
- Toss test/live provider는 fake provider 이후 붙이는 순서로 정리했다.

검증:

- 문서 간 `payments`, 결제 상태, MVP 제외 항목 충돌 검색.
- `npm run lint` 성공.

## 33. 2026-06-11 FAKE 결제 기반 구현

결제 설계에 맞춰 실제 코드 경로를 fake provider 기준으로 1차 구현했다.

- `db/migrations/20260611_payments_foundation.sql` 추가.
- `src/domain/types.ts`에 결제 provider/method/status/payload 타입 추가.
- `src/lib/reservation-create.ts` 추가: 예약 payload parse, 소유 차량 검증, bay/partner 가격 검증, self task/package 검증, 가격 계산, 예약 확정 insert를 공통화했다.
- 기존 `POST /api/reservations`는 공통 예약 생성 유틸을 사용하는 얇은 wrapper로 정리했다.
- `POST /api/payments/prepare` 추가: 예약 검증/가격 계산 후 `payments.status = READY` row 생성.
- `POST /api/payments/confirm` 추가: fake 승인 후 `APPROVED -> RESERVATION_CONFIRMED`, 예약 `CONFIRMED` 생성.
- `POST /api/payments/fail` 추가: `READY -> FAILED/CANCELLED` 기록.
- `/payment` 화면은 직접 예약 생성 대신 `prepare -> confirm -> reservation-complete` 흐름을 사용한다.
- `POST /api/reservations` direct 예약 생성은 기본 비활성화하고, `PITNOW_ALLOW_DIRECT_RESERVATION_CREATE=true`일 때만 legacy/dev 용도로 허용한다.
- `scripts/e2e-checkout-loop.mjs`는 fake 결제 준비/승인 후 체크인/이용시작/체크아웃을 검증하도록 변경했다.
- `docs/Checkout_E2E.md`와 `docs/Payment_MVP.md`를 fake 결제 기준으로 갱신했다.

검증:

- `npm run lint` 성공.
- `npm run build` 성공.
- Supabase SQL Editor에 `db/migrations/20260611_payments_foundation.sql` 적용 완료 후 `payments` 테이블 조회 성공.
- `PITNOW_PAYMENT_PROVIDER=FAKE npm run e2e:checkout` 성공.
- 생성된 검증 payment ID: `a7f0a11e-5062-41a3-b1ed-e5486a7711c2`.
- 생성된 검증 reservation ID: `48c6dfe9-2852-49e4-ac20-d85031997fde`.
- 결제 상태 `RESERVATION_CONFIRMED`, 예약 최종 상태 `COMPLETED` 확인.
- paymentAmount/totalPrice/totalSettlement 모두 `30000` 확인.
- 상태 로그 `NULL -> CONFIRMED -> CHECKED_IN -> IN_USE -> COMPLETED` 확인.

다음 조치:

- Toss test adapter 구현.

## 34. 2026-06-12 Toss test adapter 1차 구현

FAKE 결제 루프를 유지한 상태에서 Toss test 결제창/승인 adapter를 추가했다.

- `PITNOW_PAYMENT_PROVIDER=TOSS_TEST` 또는 `TOSS_LIVE`이면 `payments.provider = TOSS`로 준비한다.
- `POST /api/payments/prepare`는 Toss 결제창용 checkout payload를 반환한다.
- `/payment` 화면은 Toss checkout payload를 받으면 `https://js.tosspayments.com/v2/standard` SDK를 로드하고 `payment.requestPayment()`를 호출한다.
- `/payment/success` 추가: Toss redirect query의 `paymentKey/orderId/amount`와 `paymentId`로 `/api/payments/confirm`을 호출한다.
- `/payment/fail` 추가: 실패/취소 query를 `/api/payments/fail`로 기록한다.
- `POST /api/payments/confirm`은 Toss mode에서 `TOSS_PAYMENTS_SECRET_KEY`로 Toss `/v1/payments/confirm`을 호출한 뒤 예약을 확정한다.
- Toss env vars: `NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY`, `TOSS_PAYMENTS_SECRET_KEY`, optional `TOSS_PAYMENTS_API_BASE_URL`.
- `.env.local` 변경 후에는 `npm run dev` 재시작이 필요하다.
- Toss v2 standard SDK의 `requestPayment()`에는 `sandbox` 파라미터를 넘기지 않는다. 해당 파라미터를 넘기면 "sandbox 파라미터의 타입이 올바르지 않습니다."로 즉시 취소된다.

검증:

- `npm run lint` 성공.
- `npm run build` 성공.
- `PITNOW_PAYMENT_PROVIDER=FAKE npm run e2e:checkout` 성공. Toss adapter 추가 후에도 fake 회귀 검증이 유지됨.
- 생성된 검증 payment ID: `00447226-934e-449b-88c9-4e922d179492`.
- 생성된 검증 reservation ID: `106899db-c69a-4fb4-92d5-8991e279d407`.
- adapter smoke test 중 생성된 미승인 payment 2건은 `CANCELLED`로 정리함.

남은 수동 검증:

- Toss test client/secret key를 `.env.local`과 Vercel Preview에 설정.
- dev server 재시작 후 실제 브라우저에서 test 결제창 success/fail 각 1회 확인.

## 35. 2026-06-12 Toss test env 적용 및 서버 경로 smoke

로컬 `.env.local`에 Toss test 키를 설정하고 개발서버를 재시작해 `TOSS_TEST` 모드가 실제 route handler에 반영되는지 확인했다.

- `PITNOW_PAYMENT_PROVIDER=TOSS_TEST` 확인.
- `NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY` prefix `test_ck_` 확인.
- `TOSS_PAYMENTS_SECRET_KEY` prefix `test_sk_` 확인.
- `POST /api/payments/prepare`가 `provider = TOSS`, `checkout.type = TOSS_PAYMENT_WINDOW`, `checkout.mode = TOSS_TEST`를 반환하는 것 확인.
- smoke용 READY payment는 실제 결제하지 않았으므로 `CANCELLED`로 정리했다.
- 가짜 `paymentKey`로 `/api/payments/confirm`을 호출해 Toss confirm 실패 경로를 검증했다.
- Toss 응답 `NOT_FOUND_PAYMENT_SESSION`을 수신했고, 해당 payment row가 `FAILED`로 정리되는 것 확인.

검증:

- Toss prepare smoke payment ID: `394a6874-8271-43b0-99ca-d74f41944831` → `CANCELLED`.
- Toss confirm failure smoke payment ID: `d655c94d-4355-4146-b936-51181b0f253c` → `FAILED`.

남은 수동 검증:

- 실제 브라우저 결제창에서 Toss test success 1회.
- 실제 브라우저 결제창에서 Toss test fail/cancel 1회.

## 36. 2026-06-20 Toss test KakaoPay 성공 검증

Toss test key 환경에서 실제 카카오페이 인증 플로우를 통해 성공 redirect와 예약 확정까지 확인했다.

- 결제창 진입: `https://js.tosspayments.com/v2/standard` SDK의 `requestPayment()`가 Toss 결제창을 정상 표시.
- 결제 수단: 카카오페이.
- 테스트 결제 특성: 실제 결제 UI와 카카오 알림톡 인증은 뜨지만 테스트 키이므로 실제 금액은 차감되지 않음.
- 성공 후 `/payment/success`로 복귀하고 `/api/payments/confirm`이 Toss confirm을 수행.
- `payments.status = RESERVATION_CONFIRMED`, `payments.provider = TOSS`, `payments.method = KAKAO_PAY` 확인.
- 연결된 `reservations.status = CONFIRMED` 확인.
- `reservation_status_logs`에 `to_status = CONFIRMED`, `reason = payment_confirmed` 기록 확인.

검증:

- payment ID: `de8fc5a4-f8af-4683-a8d3-4252881eb84d`.
- reservation ID: `a5b1edd3-177a-41c6-afa7-0dfebabd52e4`.
- reservation total price: `22000`.
- reservation time: `2026-06-20T00:00:00+00:00` - `2026-06-20T01:00:00+00:00` (KST 09:00 - 10:00).
