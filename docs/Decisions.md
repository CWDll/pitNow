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
