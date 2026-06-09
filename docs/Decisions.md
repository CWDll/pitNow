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
