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

## 2026-06-21

Decision:
`reservation-photos` Storage upload policy는 예약 소유자뿐 아니라 예약 상태도 확인한다.

Rules:

- `checkin/{reservation_id}/...` 업로드는 authenticated 예약 소유자이고 reservation status가 `CONFIRMED`일 때만 허용한다.
- `checkout/{reservation_id}/...` 업로드는 authenticated 예약 소유자이고 reservation status가 `CHECKED_IN` 또는 `IN_USE`일 때만 허용한다.
- anonymous insert는 계속 제거한다.
- MVP 동안 public read는 유지한다.

Reason:
DB API는 상태 전환을 검증하지만, Storage insert policy가 상태를 보지 않으면 취소/완료된 예약에도 orphan evidence file이 업로드될 수 있다. 업로드 단계에서부터 phase별 상태를 제한해 증적 파일과 예약 상태의 정합성을 높인다.

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
Auth/RLS hardening 기준은 "사용자 쓰기는 Supabase Auth 세션, 관리자 조회는 서버 service-role, 로컬 fallback은 개발 전용"으로 고정한다.

Rules:

- 사용자 소유 데이터 API는 Supabase `Authorization: Bearer <access_token>`을 기준으로 `auth.users.id`와 `reservations.user_id`를 매칭한다.
- 로컬 개발 fallback은 production에서 비활성화되며, 운영/검증 환경에서는 `PITNOW_DISABLE_DEV_AUTH_FALLBACK=true`로 끈다.
- `reservation-photos` storage는 MVP 동안 public read를 유지하지만, insert는 authenticated 사용자이고 경로의 reservation id 소유자일 때만 허용한다.
- 초기 storage migration의 anonymous insert policy는 `20260611_auth_rls_hardening.sql`에서 다시 제거해 부분 적용 환경도 보정한다.
- Admin console은 모바일 사용자 세션과 분리하고, RLS 이후 조회는 서버 전용 `SUPABASE_SERVICE_ROLE_KEY` client에서만 수행한다.

Reason:
결제 모듈을 붙이기 전 예약/사진/상태 전환의 소유권 경계를 먼저 잠가야 결제 승인, 환불, 관리자 조치가 같은 보안 모델 위에서 확장된다.

---

## 2026-06-11

Decision:
예약 상태 변경은 API별 직접 update가 아니라 `transitionReservationStatus` 공통 유틸을 경유한다.

Rules:

- 체크인, 이용 시작, 체크아웃은 `fromStatus -> toStatus`를 명시해서 상태를 변경한다.
- 상태 update 후 `reservation_status_logs` insert가 실패하면 상태를 이전 값으로 되돌린다.
- 로컬 개발에서는 과거 마이그레이션 미적용 환경을 위해 로그 테이블 누락만 임시 허용한다.
- production 또는 `PITNOW_REQUIRE_STATUS_LOGS=true`에서는 로그 테이블 누락도 상태 전환 실패로 처리한다.
- 예약 생성의 `null -> CONFIRMED` 로그도 같은 fatal 판단 기준을 사용한다.

Reason:
상태 전환 로직이 API마다 흩어져 있으면 취소, 노쇼, 관리자 강제 완료 같은 후속 상태를 추가할 때 로그 누락이나 rollback 정책 차이가 생길 수 있다. 결제 연동 전 상태 머신의 단일 진입점을 먼저 고정한다.

---

## 2026-06-11

Decision:
예약 시간 기준은 `end_time`과 `blocked_until`으로 분리하고, DB 겹침 방지는 active 예약의 `start_time ~ blocked_until` 범위로 고정한다.

Rules:

- `end_time`은 사용자 예약 종료 시각이며 체크아웃 초과요금 계산 기준이다.
- `reserved_end_time`은 기존 화면/API 호환을 위해 `end_time`과 같은 값으로 유지한다.
- `blocked_until`은 베이 점유 종료 시각이며 항상 `end_time + 1 hour`다.
- 스케줄 화면은 예약 조회 시 `blocked_until > dayStart`를 사용해 전날 예약의 버퍼가 당일로 넘어오는 경우도 막는다.
- DB exclusion constraint `no_overlap`은 active 상태(`CONFIRMED`, `CHECKED_IN`, `IN_USE`)에서 `tstzrange(start_time, blocked_until, '[)')` 겹침을 차단한다.

Reason:
예약 표시/정산/베이 점유가 서로 다른 종료 기준을 사용하면 전날 버퍼, 초과요금, 중복 예약 판단이 어긋날 수 있다. 결제 전 시간 기준을 분리해 고정한다.

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

---

## 2026-06-11

Decision:
파트너의 Self Service 시간요금 `partners.hourly_price`는 필수 양수 값으로 관리한다.

Rules:

- `hourly_price`가 null 또는 0 이하인 기존 파트너는 기본 15,000원으로 보정한다.
- 신규/수정 파트너는 `hourly_price > 0` 제약을 만족해야 한다.
- Self Service 예약 생성 API는 파트너 시간요금이 없으면 예약 생성을 거부한다.
- 시간 선택 화면은 시간요금이 없는 파트너를 결제 단계로 보내지 않는다.

Reason:
Self Service 총액은 `파트너 시간요금 × 예약시간 + 검수비`로 계산된다. 시간요금이 비어 있으면 프론트에서는 검수비만 보이고 서버에서는 예약이 거부되어 사용자 흐름이 깨지므로 DB 제약으로 원천 차단한다.

---

## 2026-06-11

Decision:
사용자 예약 시간 선택은 KST wall-clock 기준으로 해석하고, DB에는 UTC `timestamptz`로 저장한다.

Rules:

- 사용자가 화면에서 `6/11 09:00`을 선택하면 한국시간 `2026-06-11 09:00 Asia/Seoul`로 해석한다.
- DB 저장 값은 동일 시각의 UTC ISO, 예: `2026-06-11T00:00:00.000Z`로 전송한다.
- 예약 내역과 Admin 시간 표시는 `Asia/Seoul` 기준으로 formatter를 고정한다.
- 서버 타이머/초과요금 계산은 UTC instant 기반 ISO 문자열로 계산한다.

Reason:
Supabase `timestamptz`는 UTC instant로 저장된다. 프론트에서 사용자가 고른 한국 영업시간을 UTC wall-clock으로 전송하면 실제 예약 시간이 9시간 밀려 체크인 가능 시간, 타이머, 초과요금이 모두 어긋난다.

---

## 2026-06-11

Decision:
예약 완료/상세 화면은 `reservationId` 기준 DB 상세 API로 hydrate한다.

Rules:

- `GET /api/reservations/:id`는 로그인 사용자 소유 예약만 반환한다.
- 응답은 지점, 베이, 차량, 작업/패키지, KST 날짜 라벨, 금액을 화면용으로 조립한다.
- 예약 완료 화면은 URL query 값을 초기 fallback으로 사용하되, `reservationId`가 있으면 API 결과로 덮어쓴다.
- 체크인/진행 화면으로 넘기는 query도 hydrate된 DB 상세 값을 우선 사용한다.

Reason:
예약 생성 이후 화면 데이터가 URL query에만 의존하면 새로고침, 예약 내역 재진입, 공유된 딥링크에서 정보가 누락되거나 오래된 값이 남을 수 있다. 예약 ID를 기준으로 DB 원천을 다시 읽어야 상태 전환과 증적 흐름이 안정적이다.

---

## 2026-06-11

Decision:
체크인 화면도 `reservationId` 기준 DB 상세 API로 hydrate한다.

Rules:

- `/checkin`은 `reservationId`가 있으면 `GET /api/reservations/:id`를 호출한다.
- 체크인 화면의 지점, 베이, 차량, 작업, 시간, 금액, 상태는 DB 상세값을 우선 사용한다.
- 체크인 완료 후 `/in-use`로 넘기는 query도 hydrate된 상세값을 사용한다.
- `CONFIRMED`가 아닌 예약은 체크인 버튼을 비활성화하고 상태 안내를 표시한다.

Reason:
체크인은 사진 증적과 상태 전환의 시작점이므로 URL query만 믿으면 안 된다. 예약 내역이나 딥링크에서 바로 진입해도 DB의 현재 예약 상태와 상세 정보를 기준으로 진행해야 한다.

---

## 2026-06-11

Decision:
이용 중 화면도 `reservationId` 기준 DB 상세 API로 hydrate한다.

Rules:

- `/in-use`는 `reservationId`가 있으면 `GET /api/reservations/:id`를 호출해 지점, 베이, 차량, 작업, 상태, 금액을 복원한다.
- `/api/reservations/:id/start` 응답은 서버 기준 `serverNow`, `startTime`, `endTime`, `totalPrice` 보정에 사용한다.
- `/checkout`과 완료 직행 query는 hydrate된 상세값을 우선 사용한다.
- 상세 hydrate 실패 시 화면은 URL fallback으로 유지하되 오류 메시지를 표시한다.

Reason:
이용 중 화면은 타이머와 초과요금 계산의 중심이므로, URL query와 로컬 시계만으로 유지하면 새로고침/딥링크/예약 내역 진입에서 정보가 흔들린다. DB 상세와 start API를 결합해야 서버 시간 기반 타이머와 화면 정보가 같은 예약 row를 기준으로 맞춰진다.

---

## 2026-06-11

Decision:
체크아웃 화면도 `reservationId` 기준 DB 상세 API로 hydrate한다.

Rules:

- `/checkout`은 `reservationId`가 있으면 `GET /api/reservations/:id`를 호출해 예약 상세를 복원한다.
- 체크아웃 화면의 지점, 베이, 차량, 작업, 시간, 상태, 금액은 DB 상세값을 우선 사용한다.
- 체크아웃 실행 가능 상태는 `CHECKED_IN` 또는 `IN_USE`로 제한한다.
- 완료 화면으로 넘기는 query는 hydrate된 상세값과 `/api/checkout`이 확정한 서버 정산 금액을 사용한다.

Reason:
체크아웃은 사진 증적, 상태 전환, 초과요금, 검수비가 한 번에 확정되는 단계다. URL query만 믿으면 새로고침이나 딥링크에서 잘못된 예약 정보로 정산 화면이 열릴 수 있으므로, 예약 상세는 DB 원천을 사용하고 최종 금액은 체크아웃 API 응답을 사용한다.

---

## 2026-06-11

Decision:
완료 화면은 `reservationId` 기준 예약 상세와 체크아웃 정산 정보를 hydrate한다.

Rules:

- `GET /api/checkouts?reservationId=...`는 로그인 사용자 소유 예약의 체크아웃 row만 반환한다.
- `/complete`는 예약 상세 API로 지점, 차량, 작업, 시간, 상태를 복원한다.
- `/complete`의 결제 요약은 체크아웃 상세 API의 `basePrice`, `extraFee`, `helperVerifyFee`, `totalSettlement`를 우선 사용한다.
- API hydrate 실패 시 URL fallback 값을 유지하되 오류 안내를 표시한다.

Reason:
완료 화면은 리뷰 작성과 영수증/정산 확인의 기준점이다. query 값만 사용하면 체크아웃 이후 새로고침하거나 예약 내역에서 재진입할 때 정산 결과가 사라질 수 있으므로, 예약 row와 체크아웃 row를 DB 원천으로 다시 읽는다.

---

## 2026-06-11

Decision:
예약 내역 목록의 지점/베이/패키지/작업명은 mock이 아니라 DB row에서 조립한다.

Rules:

- `/reservation`은 예약 목록 조회 후 파트너, 베이, 패키지, 예약 작업, 작업 카탈로그를 ID map으로 추가 조회한다.
- Self Service 작업명은 `reservation_tasks -> self_maintenance_tasks` 기준으로 표시한다.
- Shop Service 작업명은 `service_packages` 기준으로 표시한다.
- 예약 카드 링크는 기존 query fallback을 유지하되, 상세 화면들은 `reservationId`로 DB hydrate한다.

Reason:
예약 내역이 mock garage/package 데이터를 참조하면 실제 Supabase seed나 운영 데이터와 이름이 어긋날 수 있다. 목록부터 DB 원천을 사용해야 예약 상세, 체크인, 체크아웃, 완료 화면의 hydrate 전략과 일관된다.

---

## 2026-06-11

Decision:
사용자 영수증과 Admin 예약 drill-down은 예약/체크아웃 DB row를 원천으로 표시한다.

Rules:

- 사용자 영수증은 `/receipt?reservationId=...`에서 예약 상세 API와 체크아웃 상세 API를 함께 hydrate한다.
- 완료 화면의 영수증 버튼은 `/receipt`로 연결한다.
- Admin 예약 목록과 정산 목록은 `/admin/reservations/:id` 상세로 진입할 수 있어야 한다.
- Admin 상세는 예약 기본 정보, 체크인 사진 4장, 체크아웃 체크리스트, 체크아웃 사진 2장, 정산 breakdown, 상태 전환 로그를 한 화면에 표시한다.
- Admin 상세는 기존 Admin token 보호를 그대로 따른다.

Reason:
MVP 운영에서 분쟁/누락 확인은 “예약 상태, 증적 사진, 체크리스트, 정산 금액, 상태 로그”를 한 번에 보는 능력이 중요하다. 사용자에게는 완료 후 확인 가능한 영수증을 제공하고, 운영자에게는 동일한 DB row 기반의 증적 drill-down을 제공한다.

---

## 2026-06-11

Decision:
Admin 예약 취소 1차 액션은 `CONFIRMED -> CANCELLED`만 허용한다.

Rules:

- Admin 취소 API는 `POST /api/admin/reservations/:id/cancel`로 제공한다.
- Admin token cookie가 없으면 401을 반환한다.
- `SUPABASE_SERVICE_ROLE_KEY`가 없으면 503을 반환한다.
- `CONFIRMED` 상태 예약만 취소할 수 있다.
- 취소 시 `transitionReservationStatus()`를 사용해 상태 변경과 `reservation_status_logs` 기록을 함께 처리한다.
- 취소 사유는 상태 로그 metadata에 저장한다.

Reason:
MVP 운영에서 가장 위험이 낮고 필요한 수동 개입은 확정 예약 취소다. 체크인/이용중/완료 예약 취소는 환불, 점유, 정산 영향이 있어 별도 정책 확정 전에는 막는다.

---

## 2026-06-11

Decision:
Admin 예약 상세는 증적 누락 사유와 고객 리뷰를 함께 보여준다.

Rules:

- Admin 상세는 체크인/체크아웃 row와 사진/체크리스트를 기준으로 증적 누락 사유 배열을 계산한다.
- 누락 사유가 없으면 `Complete`, 하나라도 있으면 `Review` 상태로 표시한다.
- 고객 리뷰가 있으면 별점, 코멘트, 작성 시각을 Admin 상세에 표시한다.
- 리뷰가 없으면 “아직 작성된 리뷰가 없습니다.”로 명확히 표시한다.

Reason:
운영자는 예약 상세에서 분쟁 가능성, 증적 누락, 고객 불만을 한 번에 판단해야 한다. 증적과 리뷰를 분리된 화면으로 흩어두면 누락 대응이 늦어지므로 예약 상세 drill-down에 함께 모은다.

---

## 2026-06-11

Decision:
사용자 예약 취소 1차 액션은 본인 `CONFIRMED` 예약만 허용한다.

Rules:

- 사용자 취소 API는 `POST /api/reservations/:id/cancel`로 제공한다.
- 로그인 사용자는 본인 소유 예약만 취소할 수 있다.
- `CONFIRMED` 상태에서만 `CANCELLED`로 전환할 수 있다.
- 취소 시 `transitionReservationStatus()`를 사용해 상태 변경과 `reservation_status_logs` 기록을 함께 처리한다.
- 취소 사유는 상태 로그 metadata에 저장한다.
- `/reservation` 목록의 `CONFIRMED` 카드에서만 취소 form을 노출한다.

Reason:
결제 연동 전 MVP에서는 사용자가 확정 예약을 취소하는 흐름이 필요하지만, 체크인 이후나 완료 이후 취소는 점유/정산/환불 영향이 크다. 결제 정책 확정 전까지는 본인 `CONFIRMED` 예약 취소로 범위를 제한한다.

---

## 2026-06-11

Decision:
결제 MVP는 Toss Payments를 1차 provider로 두고, 예약 확정은 결제 승인 검증 이후에만 생성하는 payment-first flow로 고정한다.

Rules:

- 결제 대기/승인/실패 상태는 `payments` 테이블에 저장한다.
- `reservations`에는 결제 대기 상태를 추가하지 않는다.
- `/api/payments/prepare`는 예약 검증/가격 계산 후 `payments.status = READY` row만 생성한다.
- `/api/payments/confirm`은 provider 승인 검증 후 `reservations.status = CONFIRMED` row를 생성하고 `payments.status = RESERVATION_CONFIRMED`로 전환한다.
- 결제 승인 후 예약 insert가 DB overlap으로 실패하면 즉시 취소/환불을 시도하고 `REFUNDED` 또는 `REFUND_PENDING`으로 기록한다.
- Local/E2E는 `PITNOW_PAYMENT_PROVIDER=FAKE`로 실제 결제 없이 prepare/confirm 흐름을 검증한다.
- Vercel Preview/출시 전 Production은 Toss test mode를 사용하고, live key는 출시 직전 별도 전환한다.

Reason:
예약을 결제 전에 `CONFIRMED`로 만들면 미결제 예약이 베이를 점유하고, 별도 hold 상태를 만들면 abandoned hold cleanup과 overlap 정책이 복잡해진다. MVP에서는 결제 승인 후 예약 확정으로 단순화하고, rare race는 자동 환불/운영 로그로 처리하는 편이 구현과 운영 리스크가 낮다.

Options considered:

1. 결제 전 임시 예약 hold 생성

- 장점: 사용자가 결제 중인 슬롯을 잠시 보호할 수 있다.
- 단점: hold 만료 배치, abandoned payment 정리, hold 상태의 overlap 포함 여부, UI 복구가 추가된다.

2. 결제 승인 후 예약 확정 (선택)

- 장점: 미결제 점유가 없고 MVP 구현이 단순하다. 테스트도 fake provider로 반복 가능하다.
- 단점: 결제 승인 직후 slot race가 발생하면 자동 환불/운영 처리가 필요하다.

---

## 2026-06-20

Decision:
체크아웃 후 추가요금은 예약 선결제와 분리된 사후정산 결제로 처리한다.

Rules:

- 예약 생성 전 결제는 `payment_purpose = RESERVATION`으로 유지한다.
- 체크아웃 후 추가 결제는 `payment_purpose = CHECKOUT_SETTLEMENT`로 별도 payment row를 생성한다.
- 사후정산 결제 금액은 `checkouts.total_settlement - reservations.total_price`로 계산한다.
- `checkouts.total_settlement`는 전체 정산액이며, 사용자가 추가로 내야 할 금액이 아니다.
- 체크아웃 초과요금은 예약 선결제 총액이 아니라 카 마스터 검수비를 제외한 정비 기본요금을 시간당 기준으로 계산한다.
- 사후정산 결제 성공 시 `payments.status = SETTLEMENT_CONFIRMED`로 기록한다.
- 체크아웃 제출 후 추가 결제 금액이 있으면 `/complete`로 보내지 않고 `/settlement-payment`로 보낸다.
- `/complete`는 추가 정산 결제가 없거나 `SETTLEMENT_CONFIRMED`까지 끝난 뒤의 진짜 이용 완료 화면으로 사용한다.
- DB 상태는 MVP에서 `COMPLETED`를 유지하되, 사용자 플로우는 사후정산 결제 완료 전 `/complete` 진입을 막는다.

Reason:
체크아웃 API는 이미 초과요금과 검수비를 서버 기준으로 계산해 `checkouts`에 저장하지만, 기존 결제 모델은 예약 확정용 선결제만 표현했다. 이 상태에서는 사용자가 큰 추가요금을 확인해도 실제 결제하거나 운영자가 결제 완료 여부를 추적할 수 없다. 또한 결제 전 `/complete`가 뜨면 “이용 완료” 의미가 흐려진다. 결제 목적을 분리하고 체크아웃 화면에서 사후정산을 완료하게 하면 예약 선결제, 추가 정산, 향후 환불/부분취소가 같은 payments ledger 안에서 구분된다.

---

## 2026-06-24

Decision:
홈의 위치 기반 정비소 지도는 Kakao Maps JavaScript SDK를 1차 지도 provider로 사용한다.

Rules:

- 홈 화면 검색 영역 아래, 필터 버튼 위에 모바일 미니맵을 배치한다.
- `partners.lat`, `partners.lng` 좌표가 있는 제휴 정비소는 지도 marker로 표시한다.
- 사용자가 위치 권한을 허용하면 browser Geolocation API로 현재 위치 marker를 표시하고 지도를 해당 위치로 이동한다.
- Kakao Maps 기본 zoom control을 사용해 사용자가 확대/축소할 수 있게 한다.
- 지도 키는 `NEXT_PUBLIC_KAKAO_MAP_APP_KEY`로 주입한다.
- 키가 없거나 SDK 로드에 실패해도 홈 화면은 깨지지 않고 fallback 미니맵을 표시한다.
- Kakao Developers에서 JavaScript 키의 Web 플랫폼 도메인에 `http://localhost:3000`, Vercel Preview/Production 도메인을 등록해야 한다.

Reason:
PitNow는 한국 정비소 위치 탐색이 핵심인 모바일 서비스이고, 사용자가 기대하는 지도 UX가 카카오맵에 가깝다. Kakao Maps는 국내 POI/지도 표현과 사용자 친숙도가 높으며, JS SDK로 marker, zoom, geolocation 연동을 MVP 범위 안에서 구현할 수 있다.

Options considered:

1. Kakao Maps JavaScript SDK (선택)

- 장점: 한국 사용자에게 익숙하고 국내 지도/POI 맥락이 좋다. 카카오맵 화면과 유사한 경험을 만들기 쉽다.
- 단점: JavaScript 키와 도메인 등록이 필요하다.

2. Google Maps JavaScript API

- 장점: 문서와 글로벌 지원이 강하고 Geolocation 예제가 많다.
- 단점: 국내 지도/POI 체감이 카카오/네이버보다 약하고 과금/키 관리 부담이 있다.

3. Static/fallback 자체 미니맵

- 장점: 외부 키 없이 항상 표시된다.
- 단점: 실제 지도 조작, 경로/거리/주변성 판단이 불가능하다.

---

## 2026-06-24

Decision:
정비소 사장/직원용 store-admin은 MVP에 포함하고 내부 운영자 admin과 분리된 `/partner-admin` 영역으로 설계한다.

Rules:

- 내부 PitNow 운영자 콘솔은 `/admin`에 유지한다.
- 정비소 운영자 콘솔은 `/partner-admin`에 둔다.
- store-admin 권한은 `partner_admins(user_id, partner_id, role, is_active)`로 부여한다.
- store-admin은 active membership이 있는 `partner_id` 범위만 조회/수정할 수 있다.
- store-admin은 본인 정비소 예약, 체크인 사진, 체크아웃 사진/체크리스트, 상태 로그를 조회할 수 있다.
- store-admin은 본인 정비소 `bays.is_active`와 `partner_availability_blocks`만 수정할 수 있다.
- 시간대 관리는 `partner_availability_blocks`로 표현한다.
- `partner_availability_blocks.bay_id = null`은 업장 전체 차단, `bay_id`가 있으면 해당 bay 차단이다.
- 예약 준비 API는 active availability block과 겹치는 요청을 거부해야 한다.
- 결제 provider key, 환불 operation metadata, 다른 정비소 데이터는 store-admin에 노출하지 않는다.

Reason:
정비소 사장은 본인 업장의 베이/시간대/체크인 증적을 관리해야 하지만, 내부 운영자와 동일한 권한을 주면 다른 정비소 예약과 결제 데이터까지 노출된다. 따라서 권한의 기본 단위를 `partner_id` membership으로 두고, 화면과 API를 내부 admin과 분리한다.

Options considered:

1. 기존 `/admin`에 partner filter만 추가

- 장점: 화면을 재사용하기 쉽다.
- 단점: 내부 운영자 데이터와 store-admin 데이터가 섞이고 권한 실수 시 전체 예약/결제 노출 위험이 크다.

2. 별도 `/partner-admin` + `partner_admins` membership (선택)

- 장점: 역할 경계가 명확하고 RLS/API scope를 `partner_id`로 강제하기 쉽다.
- 단점: 별도 화면과 API 구현이 필요하다.

3. store-admin을 Phase 2로 연기

- 장점: 현재 사용자 예약 루프에 더 집중할 수 있다.
- 단점: 실제 정비소 운영 검증에 필요한 베이/체크인 관리 흐름이 빠져 MVP 운영성이 낮다.

---

## 2026-06-29

Decision:
자동 릴리즈 검증의 UI E2E는 기존 개발 서버를 재사용하지 않고 전용 FAKE production 서버에서 실행한다.

Rules:

- `npm run e2e:ui`는 `PITNOW_E2E_BASE_URL=http://localhost:3011`을 사용한다.
- UI E2E 전용 서버는 `PITNOW_PAYMENT_PROVIDER=FAKE`로 실행한다.
- UI E2E는 `next build && next start` 기반으로 실행해 Vercel 배포에 가까운 조건을 검증한다.
- Playwright는 `PITNOW_E2E_REUSE_SERVER=0`일 때 기존 서버를 재사용하지 않는다.
- Admin E2E는 쿠키를 직접 주입하기보다 `/admin-login` 실제 로그인 흐름을 사용한다.
- `/admin/logout`은 GET route이므로 `Link` prefetch를 비활성화해야 한다.
- Admin cookie의 `secure` 속성은 Vercel 배포 환경에서만 켠다.

Reason:
로컬 개발 중 3000번 서버가 Toss test mode로 떠 있으면 `PITNOW_PAYMENT_PROVIDER=FAKE playwright test`만으로는 서버 provider가 바뀌지 않아 booking-flow E2E가 Toss 외부 결제창으로 빠졌다. 또한 production `next start` 검증 중 `/admin/logout` 링크 prefetch가 쿠키를 삭제하는 실제 운영성 버그가 드러났다. 릴리즈 검증은 독립 포트와 FAKE provider를 강제하고, Admin 인증은 실제 로그인 흐름으로 검증해야 재현성과 배포 유사성이 모두 확보된다.

---

## 2026-06-29

Decision:
Partner-admin 운영 액션은 별도 `partner_admin_audit_logs` ledger에 best-effort로 기록한다.

Rules:

- 예약 상태 전환은 계속 `reservation_status_logs`에 기록한다.
- 정비소 운영자가 수행하는 베이 상태 변경, availability block 변경, 현장 메모 생성/해결/재오픈은 `partner_admin_audit_logs`에 기록한다.
- audit row에는 actor, partner, action, target, before/after state, metadata를 저장한다.
- audit insert 실패는 서버 로그에 남기되 primary business mutation을 롤백하지 않는다.
- store-admin은 본인 partner의 audit row만 조회할 수 있다.

Reason:
베이 활성/비활성, 예약 차단 시간, 현장 이슈 처리는 예약 상태 자체를 바꾸지 않는 운영 액션이다. 이를 `reservation_status_logs`에 억지로 넣으면 예약 상태 전환과 운영 변경 이력이 섞인다. 별도 audit ledger를 두면 운영 책임 추적과 향후 admin 감사 화면을 만들기 쉽고, audit 테이블 장애가 예약 운영 자체를 막지 않도록 best-effort로 유지할 수 있다.

---

## 2026-06-30

Decision:
사용자 예약 흐름에서 bay 총 개수와 예약 가능한 active bay 개수를 분리해 표시하고, 예약 선택 단계에는 active bay만 노출한다.

Rules:

- 정비소 목록과 상세 화면은 총 bay 개수를 기준으로 `베이 N개`를 표시한다.
- inactive bay가 있으면 `베이 N개 중 M개 사용 가능`처럼 총 개수와 active 개수를 함께 표시한다.
- 예약 시간/베이 선택 화면은 active bay만 버튼으로 노출한다.
- 예약 생성 공통 검증은 inactive bay 요청을 `BAY_INACTIVE`로 거부한다.
- store-admin이 active bay를 비활성화할 때 해당 bay에 `CONFIRMED`, `CHECKED_IN`, `IN_USE` 예약이 있으면 `BAY_HAS_ACTIVE_RESERVATION`으로 거부한다.
- `COMPLETED`, `CANCELLED` 예약은 과거 이력으로 보고 bay 비활성화를 막지 않는다.

Reason:
store-admin의 bay 활성 상태가 사용자 목록/상세/예약 단계에서 다르게 보이면 사용자가 예약 불가능한 bay를 선택할 수 있다. 최종 예약 API는 이미 inactive bay를 거부하지만, 사용자는 결제 직전에야 실패를 알게 된다. 따라서 표시와 선택 가능성을 active 상태에 맞추고, 동시에 운영자가 진행 중인 예약이 있는 bay를 꺼서 예약과 운영 상태가 충돌하는 상황을 API에서 막는다.
