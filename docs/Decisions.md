# Decision Log

## 2026-03-04

Decision:
Add `reviews` to MVP scope and support `POST /api/reviews` for completed reservations.

Reason:
Review UI needs real persistence and partner review aggregation.

Options considered:

1. Keep reviews out of MVP
2. Include minimum review schema/API in MVP

Selected:
Option 2

---

## 2026-03-18

Decision:
Change reservation model from single-mode slot booking to dual-mode booking:

- `SELF_SERVICE`: existing time-slot reservation
- `SHOP_SERVICE`: package-based professional execution

`Helper mode` is deprecated and replaced by `SHOP_SERVICE`.

Reason:

- Service positioning should support both self-maintenance and professional use in one product.
- Shop-service package pricing should be visible per partner so market pricing is handled by partners.
- Package work still needs real schedule blocking to avoid operational conflict.

Key rules:

- Self Service keeps `1 hour minimum` and `30 minute` additional units.
- Shop Service uses package duration from the package catalog.
- Package duration is rounded up to `30-minute` blocks for schedule reservation.
- Example: `40 minutes` of package duration blocks `60 minutes`.
- If the shop decides the work cannot finish within the reserved time, a mechanic takes over and full labor charge still applies regardless of prior progress.

Options considered:

1. reviews를 계속 MVP 제외로 유지

- 장점: 구현 범위 최소화
- 단점: 완료 페이지 후기 UI가 영구적으로 더미 상태

2. reviews를 MVP에 최소 스펙으로 포함 (선택)

- 장점: 별점/코멘트 실제 저장 가능, 매장 단위 후기 집계 기반 확보
- 단점: 스키마/검증/API가 추가되어 범위가 소폭 증가

## 2026-03-29

Decision:
Self 정비 플로우를 법적 허용 작업 선택 + 선택 작업 한정 동의(체크박스/서명) 기반으로 변경하고,
시간 정책을 1시간 단위 예약/연장 + 종료 후 1시간 버퍼 블로킹으로 확정한다.
또한 체크아웃 단계에서 선택 가능한 헬퍼 작업 확인 요청(기본 5,000 + 작업별 가산)을 도입한다.

Reason:
안전사고/법적 리스크를 줄이기 위해 사용자 작업 범위를 사전에 명시하고 증적을 남겨야 하며,
운영상 작업 전환 여유시간을 확보하기 위해 버퍼 블로킹이 필요하다.

Options considered:

1. 기존 구조 유지 (30분 단위 + 헬퍼 모드 제외 유지)

- 장점: 변경량 최소
- 단점: 법적 허용 작업 통제/작업 한정 동의/버퍼 운영 정책을 반영하지 못함

2. Self 정비만 정책 변경, 패키지는 현행 유지 (선택)

- 장점: 요구사항 반영 + 범위 통제 가능, 기존 패키지 UX 영향 최소
- 단점: DB/API에 self 정비 전용 필드/테이블 추가 필요

---

## 2026-06-09

Decision:
예약 타입의 공식 명칭을 DB/API/domain 모두에서 `SELF_SERVICE`와 `SHOP_SERVICE`로 고정한다.
`SELF`와 `PACKAGE`는 사용자 화면의 탭/쿼리 표현으로만 사용하고, API 경계에서는 `reservationType`으로 변환한다.

Also:

- 예약 생성 API는 과거 reservation_type 후보값(`SELF`, `SELF_MAINTENANCE`, `TIME`, `PACKAGE`, `PACKAGE_SERVICE`, `PKG`)을 더 이상 시도하지 않는다.
- 예약 생성 API는 최신 reservations 스키마(`partner_id`, `reservation_type`, `package_id`, `duration_minutes`, `reserved_end_time`, `blocked_until`)를 기준으로 insert한다.
- Self Service 가격은 하드코딩 기본값이 아니라 파트너 `hourly_price`를 기준으로 계산한다.
- Self Service helper verification fee는 클라이언트 입력값을 신뢰하지 않고 `self_maintenance_tasks.helper_verify_unit_fee` 기준으로 서버에서 계산한다.
- Shop Service 예약은 `packageId`를 필수로 받고, `partner_package_prices`와 `service_packages.duration_minutes`로 가격/소요시간을 검증한다.
- 결제 제공자(Toss/Naver Pay/Kakao Pay) 연동은 후순위로 두고, 현재 단계에서는 예약 생성 정합성만 고정한다.

Reason:
예약 생성 API에 과거 스키마 호환 분기와 UI 용어가 섞여 있어 결제, Storage, 관리자 콘솔을 붙이기 전에 기준 타입과 DB 쓰기 경로를 고정해야 한다.

Options considered:

1. 기존 `bookingMode: SELF | PACKAGE` API를 유지

- 장점: 프론트 변경량이 적음
- 단점: DB/domain의 `SELF_SERVICE | SHOP_SERVICE`와 계속 어긋나 이후 결제/관리자 연동에서 혼란 증가

2. API 경계에서 `reservationType: SELF_SERVICE | SHOP_SERVICE`로 고정 (선택)

- 장점: DB/API/domain 명칭 일치, 예약 생성 로직 단순화, 서버 검증 기준 명확
- 단점: 기존 호출부 payload 수정 필요

---

## 2026-06-09

Decision:
예약 상태 전환을 서버 API에서 명시적으로 처리하고 `reservation_status_logs`에 기록한다.

Rules:

- 예약 생성 시 `null -> CONFIRMED` 로그를 남긴다.
- 체크인 완료 시 `CONFIRMED -> CHECKED_IN` 로그를 남긴다.
- 이용 시작 API `POST /api/reservations/:id/start`를 추가한다.
- Self Service는 `CHECKED_IN -> IN_USE`만 허용한다.
- Shop Service는 체크인 사진 플로우가 없으므로 `CONFIRMED -> IN_USE`를 허용한다.
- 체크아웃 완료 시 기존 상태에서 `COMPLETED`로 로그를 남긴다.
- 프론트 타이머는 start API가 반환한 `serverNow`, `startTime`, `endTime` 기준으로 계산한다.

Reason:
체크인 후 프론트가 이용중 상태를 암묵적으로 가정하고 있었고, PRD의 “모든 상태 전환 기록” 원칙을 만족하지 못했다.

Operational note:
원격 Supabase에는 `reservation_status_logs` 테이블 마이그레이션을 적용해야 실제 로그가 저장된다.
개발 중 테이블이 아직 없으면 API는 경고 후 진행하지만, 운영 전에는 `db/migrations/20260609_reservation_status_logs.sql` 적용이 필수다.

---

## 2026-06-09

Decision:
체크인/체크아웃 사진 증적은 Supabase Storage `reservation-photos` bucket에 업로드하고, DB에는 업로드 결과 URL을 저장한다.

Rules:

- 체크인 4방향 사진은 Storage 업로드가 모두 성공해야 `/api/checkin`을 호출한다.
- 체크아웃 사진 2장은 Storage 업로드가 모두 성공해야 `/api/checkout`을 호출한다.
- Self Service 체크아웃은 공구/청소/폐기물 체크리스트와 사진 2장을 API에서 필수 검증한다.
- 체크아웃 증적은 `checkouts` 테이블에 저장한다.
- MVP 개발 단계에서는 Auth/RLS가 아직 없으므로 public bucket + anon insert policy를 사용한다.

Reason:
기존 `mock://...` 문자열은 실제 사진 증적을 보존하지 못해 MVP 핵심 조건인 체크인 4장 사진/체크아웃 사진 저장을 만족하지 못한다.

Production note:
운영 전에는 private bucket, signed upload URL, Auth/RLS 또는 server-only service role 구조로 전환해야 한다.

---

## 2026-06-09

Decision:
체크아웃 시점의 정산 breakdown을 서버에서 확정하고 `checkouts`에 저장한다.

Rules:

- `base_price`: 예약 기본가. 예약 시 helper 검수비가 포함되어 있으면 이를 제외한 금액.
- `extra_fee`: 서버 현재 시각 기준 초과요금.
- `helper_verify_fee`: 예약 시 또는 체크아웃 시 요청된 카 마스터 검수비.
- `total_settlement`: `base_price + extra_fee + helper_verify_fee`.
- 체크아웃 시 helper verification을 추가 요청할 수 있다.
- 이미 예약 시 helper verification을 요청했다면 중복 청구하지 않고 기존 fee를 사용한다.
- 완료 화면은 체크아웃 API 응답의 서버 확정 정산값을 표시한다.

Reason:
기존 체크아웃은 `extra_fee` 중심이라 최종 정산 상세를 DB에 충분히 남기지 못했고, 완료 화면도 쿼리스트링의 프론트 계산값에 많이 의존했다.

---

## 2026-06-09

Decision:
MVP의 PWA 1차 범위는 installable manifest, app icon, service worker registration, offline fallback 안내 페이지까지로 고정한다.

Rules:

- Manifest는 `app/manifest.ts`에서 관리하고 `/manifest.webmanifest`로 제공한다.
- 앱 이름은 `PitNow`, 표시 모드는 `standalone`, 시작 URL은 `/`로 둔다.
- 홈 화면 아이콘은 `public/icons/`의 PNG icon 세트를 사용한다.
- 서비스워커는 navigation request가 오프라인 실패할 때 `/offline.html`을 반환한다.
- 예약/결제/체크인/체크아웃의 실제 데이터 변경은 오프라인에서 처리하지 않는다.

Reason:
PitNow 핵심 플로우는 서버 상태, 사진 업로드, 결제, 정산에 의존하므로 MVP에서 오프라인 쓰기 큐를 만들면 데이터 정합성 위험이 커진다. 먼저 설치 가능성과 안전한 오프라인 안내만 제공하고, 오프라인 제출/재시도는 운영 요구가 명확해진 뒤 별도 설계한다.

---

## 2026-06-09

Decision:
Self Service 이용 시작은 체크인 완료 후 서버 API에서만 `IN_USE`로 전환한다.
프론트 타이머는 `/api/reservations/[id]/start` 응답의 `serverNow`, `startTime`, `endTime`을 기준으로 표시한다.

Rules:

- 예약 생성은 `null -> CONFIRMED` 로그를 남긴다.
- 체크인은 사진 4장 저장 후 `CONFIRMED -> CHECKED_IN` 로그를 남긴다.
- Self Service는 `CHECKED_IN` 상태에서만 `/api/reservations/[id]/start`가 `IN_USE`로 전환할 수 있다.
- Shop Service는 `CONFIRMED` 상태에서 start API가 `IN_USE`로 전환할 수 있다.
- 이미 `IN_USE`인 예약에 start API를 다시 호출하면 중복 로그 없이 현재 `serverNow`와 예약 시간 정보를 반환한다.
- 체크아웃은 `CHECKED_IN` 또는 `IN_USE`에서만 `COMPLETED`로 전환하고 로그를 남긴다.
- 상태 로그 저장 실패가 실제 DB 오류이면 상태 변경과 증적 insert를 rollback한다. 단, 로그 테이블 미적용 환경은 개발 편의를 위해 skip 허용한다.

Reason:
타이머 시작을 프론트 화면 진입으로만 판단하면 체크인 증적 없이 이용이 시작되거나, 로컬 시계 조작에 따라 정산이 흔들릴 수 있다. 서버 상태 전환과 서버 시간 응답을 기준으로 고정해야 MVP 핵심 원칙인 “사진 4장 후 타이머 시작”, “서버 기준 타이머”, “명시적 상태 전환 로그”를 만족한다.

---

## 2026-06-09

Decision:
Admin console 1차 범위는 desktop only 조회 콘솔로 제한한다.

Routes:

- `/admin`
- `/admin/reservations`
- `/admin/settlement`
- `/admin/packages`

Rules:

- User mobile layout과 admin layout은 공유하지 않는다.
- Admin layout은 `app/admin/layout.tsx`에서 분리한다.
- 1차 admin은 예약/정산/패키지 조회만 제공한다.
- 예약 취소, 강제 완료, 패키지 가격 수정, 정산 확정 같은 쓰기 액션은 Auth/RLS/권한 모델 확정 후 추가한다.

Reason:
MVP 운영자는 예약 루프의 상태와 정산/패키지 데이터를 빠르게 확인해야 하지만, 인증/권한 없이 쓰기 기능을 먼저 넣으면 운영 리스크가 커진다. 결제 연동 전 단계에서는 read-only 모니터링 콘솔로 범위를 제한한다.

---

## 2026-06-11

Decision:
Auth/RLS 1차 기준은 Supabase Auth user id를 예약 소유권의 기준으로 삼고, 로컬 개발에만 `PITNOW_DEV_USER_ID` fallback을 허용한다.

Rules:

- 사용자 mutation API는 `Authorization: Bearer <access_token>`을 우선 사용한다.
- 로그인 토큰이 없고 production이 아니면 `PITNOW_DEV_USER_ID` 또는 기본 dev user id로 개발 테스트를 허용한다.
- production에서는 인증 없는 사용자 mutation을 거부한다.
- `/admin`은 사용자 모바일 Auth와 분리하고 `PITNOW_ADMIN_ACCESS_TOKEN` 쿠키 로그인으로 잠근다.
- RLS 적용 후 admin 조회는 `SUPABASE_SERVICE_ROLE_KEY` 서버 전용 client를 사용한다.
- Storage `reservation-photos` anonymous insert policy는 제거하고 authenticated owner insert policy로 전환한다.
- MVP에서는 사진 URL 표시 호환성을 위해 bucket public read는 유지한다.

Reason:
결제 연동 전에 예약/사진/상태/정산 데이터의 소유권 기준을 먼저 고정해야 이후 결제 승인, 환불, 관리자 액션이 같은 사용자 모델 위에서 안전하게 확장된다.

---

## 2026-06-11

Decision:
사용자 Auth 1차 UI는 Supabase email/password 로그인과 회원가입으로 제공한다.

Rules:

- `/login`에서 로그인/회원가입을 제공한다.
- 예약 생성, 체크인, 이용 시작, 체크아웃, 리뷰 저장 전에는 클라이언트 세션을 확인한다.
- 세션이 없으면 현재 경로를 `next`로 보존하고 `/login`으로 이동한다.
- `/mypage`는 현재 로그인 이메일과 로그아웃 버튼을 표시한다.
- `/reservation`은 브라우저 Supabase 세션 기준으로 자기 예약만 조회한다.

Reason:
RLS 적용 후 사진 업로드와 사용자 mutation은 authenticated session에 의존한다. 결제 연동 전 사용자 계정과 예약 소유권을 화면 흐름에서 먼저 안정화해야 한다.

---

## 2026-06-11

Decision:
`/my-car` 차량 정보는 localStorage mock이 아니라 Supabase `vehicles` 테이블에 사용자별로 저장한다.

Rules:

- `vehicles.user_id`는 `auth.users.id`를 참조한다.
- RLS는 `user_id = auth.uid()`인 row만 select/insert/update/delete할 수 있게 제한한다.
- 사용자별 동일 차량 번호는 중복 등록할 수 없다.
- 사용자당 대표 차량은 최대 1대만 허용한다.
- 대표 차량 변경은 `set_active_vehicle(uuid)` DB 함수로 처리해 기존 대표 해제와 새 대표 지정이 같은 transaction에서 실행되게 한다.
- 정비소 예약 전 차량 선택 화면은 `vehicles`를 읽고, 등록 차량이 없으면 예약 진행을 막고 `/my-car` 등록으로 안내한다.

Reason:
로그인/세션 UI가 붙은 뒤에도 차량 데이터가 전체 공용 localStorage mock에 남아 있으면 사용자별 예약 소유권과 증적 데이터가 분리되지 않는다. 결제 전이라도 예약에 연결되는 차량 선택은 Auth/RLS 소유권 모델 위에 올려야 한다.

---

## 2026-06-11

Decision:
예약 생성 시 선택 차량을 `reservations.vehicle_id`로 저장한다.

Rules:

- `POST /api/reservations`는 `vehicleId`를 필수로 받는다.
- 서버는 `vehicleId`가 로그인 사용자의 `vehicles` row인지 검증한다.
- 사용자 예약 내역은 저장된 vehicle relation으로 차량명을 표시한다.
- Admin 예약 모니터에도 차량명을 함께 노출한다.
- 기존 예약 row 호환성을 위해 DB column은 nullable로 추가하되, 신규 API 요청에서는 필수로 검증한다.

Reason:
차량 선택을 URL query에만 유지하면 예약 생성 이후에는 데이터 원천이 사라진다. 체크인 사진, 정산, 고객 문의, 관리자 모니터링까지 같은 차량을 추적하려면 예약 row에 차량 FK를 저장해야 한다.
