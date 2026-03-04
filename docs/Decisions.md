# Decision Log

## YYYY-MM-DD

Decision:
Reason:
Options considered:

## 2026-03-04

Decision:
MVP 범위에 `reviews`를 추가하고, `POST /api/reviews`로 이용 완료(COMPLETED) 예약 기준 후기 저장을 지원한다.

Reason:
완료 화면의 별점/후기 UI를 실제 데이터로 연결하기 위해 DB/API 레벨의 최소 후기 기능이 필요하다.

Options considered:
1) reviews를 계속 MVP 제외로 유지
- 장점: 구현 범위 최소화
- 단점: 완료 페이지 후기 UI가 영구적으로 더미 상태

2) reviews를 MVP에 최소 스펙으로 포함 (선택)
- 장점: 별점/코멘트 실제 저장 가능, 매장 단위 후기 집계 기반 확보
- 단점: 스키마/검증/API가 추가되어 범위가 소폭 증가
