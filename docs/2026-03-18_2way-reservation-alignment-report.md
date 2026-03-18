# PitNow 2-Way 예약 구조 정렬 보고서

작성일: 2026-03-18

## 1. 목적

이번 작업의 목적은 기존 1-way 예약 구조를 다음 2-way 구조로 확장하고, 프론트/UI, API, DB 데이터 구조, 실제 예약 동작이 서로 어긋나지 않도록 맞추는 것이었다.

- `SELF_SERVICE`
  - 사용자가 시간과 베이를 직접 예약
  - 기본 1시간, 이후 30분 단위 연장
- `SHOP_SERVICE`
  - 패키지 선택 후 전문가에게 맡김
  - 패키지 소요시간을 30분 단위로 올림하여 예약 시간을 block

---

## 2. 이번에 실제 반영한 범위

이번 작업은 아래 4개 레이어를 함께 건드렸다.

1. 문서
2. 사용자 UI / 플로우
3. API / 서버 로직
4. 실제 Supabase 데이터 정합성

---

## 3. 문서 반영 내용

기존 MVP 문서들에 2-way 예약 구조를 반영했다.

- `docs/PRD_MVP.md`
- `docs/UI_MVP.md`
- `docs/UserFlow_MVP.md`
- `docs/Risks_MVP.md`
- `docs/DB_MVP.md`
- `docs/API_MVP.md`
- `docs/Decisions.md`

문서에 반영한 핵심 정책은 다음과 같다.

- `SELF_SERVICE`는 시간대 예약형
- `SHOP_SERVICE`는 패키지 선택형
- 패키지 가격은 업장별 공개
- 패키지 시간은 30분 단위 올림 block
- 예약 지연 시 정비사 인계 정책 명시

---

## 4. UI / 플로우 변경 사항

### 4-1. 예약 방식 선택

`SELF_SERVICE`와 `SHOP_SERVICE`를 분리했다.

- 파일:
  - `app/(user)/partner/[id]/page.tsx`
  - `app/(user)/partner/[id]/work/page.tsx`

변경 의도:

- 셀프 정비와 전문가 맡기기를 같은 예약으로 보지 않고, 처음부터 분기된 사용자 선택으로 인지시키기 위함

### 4-2. 셀프 정비 플로우 수정

기존:

- 셀프 -> 작업 선택 -> 시간 선택

변경 후:

- 셀프 -> 같은 화면에서 바로 날짜/베이/시간 선택

세부 동작:

- 첫 클릭 시 기본 1시간 선택
- 인접한 시간대를 누르면 30분씩 연장
- 선택한 `N번 베이`가 실제 DB의 `bay_id`에 매핑됨

파일:

- `app/(user)/partner/[id]/work/page.tsx`

### 4-3. 전문가 맡기기 플로우 유지

전문가 맡기기는 아래 순서를 유지했다.

- 전문가 맡기기 -> 패키지 선택 -> 시간 선택 -> 결제

파일:

- `app/(user)/partner/[id]/schedule/page.tsx`
- `app/(user)/payment/page.tsx`

### 4-4. 후기 조회 기준 변경

기존 리뷰 조회는 특정 `bay_id` 하나에 묶여 있었는데, 멀티베이 구조에서는 이 방식이 맞지 않는다.

변경 후:

- 리뷰는 `partner_id` 기준으로 조회

파일:

- `app/(user)/partner/[id]/page.tsx`
- `app/(user)/partner/[id]/reviews/page.tsx`

---

## 5. API / 서버 로직 변경 사항

### 5-1. 예약 생성 API

파일:

- `app/api/reservations/route.ts`

변경 내용:

- `SELF_SERVICE`와 `SHOP_SERVICE` 모두 처리
- `SELF_SERVICE`
  - 사용자가 고른 실제 `bay_id`를 그대로 사용
  - 정비소/베이 조합 검증 추가
- `SHOP_SERVICE`
  - 해당 파트너의 실제 베이 목록 중 비어 있는 베이를 서버가 자동 선택
  - 같은 시간에 동일 업장으로 여러 건 들어오면 베이를 순차적으로 분산 배정

### 5-2. 체크인 / 체크아웃 / 리뷰

파일:

- `app/api/checkin/route.ts`
- `app/api/checkout/route.ts`
- `app/api/reviews/route.ts`

정리된 점:

- env 미설정 시 명확한 오류 반환
- 에러 응답 형식을 프론트가 안전하게 처리하도록 정리
- 실제 DB 상태 기준으로 체크인 / 체크아웃 / 리뷰 저장 동작 확인 완료

### 5-3. 2-way 컬럼 직접 사용

SQL migration 적용 이후에는 `reservations`가 아래 컬럼을 직접 source of truth로 가진다.

- `partner_id`
- `reservation_type`
- `package_id`
- `reserved_end_time`
- `duration_minutes`

현재 서버 로직은 더 이상 타입을 추론하지 않고, 위 컬럼을 직접 읽고 쓴다.

파일:

- `app/api/reservations/route.ts`
- `app/api/checkout/route.ts`

---

## 6. 실제 DB 데이터 반영 내용

### 6-1. env 연결

실제 `.env.local`을 사용해 Supabase 연결을 확인했다.

현재 사용 중인 env는 다음 역할을 가진다.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

주의:

- 비밀 값 자체는 이 문서에 기록하지 않음

### 6-2. 실제 DB 확인 결과

2026-03-18 기준 확인한 테이블 row 수:

- `partners`: 2
- `bays`: 10
- `reservations`: 19
- `checkins`: 10
- `checkouts`: 9
- `reviews`: 4

### 6-3. 베이 데이터 정렬

기존 DB는 업장당 베이 row가 부족해서, UI의 `6개/4개 베이`와 실제 DB가 맞지 않았다.

이번에 service role로 실제 `bays` 데이터를 upsert 해 다음 구조로 맞췄다.

- 파트너 1: 6개 베이
- 파트너 2: 4개 베이

결과:

- 이제 셀프 예약의 베이 선택은 실제 DB row와 연결됨
- shop 예약도 실제 베이 row에 자동 배정 가능

---

## 7. mock 데이터와 실제 DB 식별자 정렬

기존 문제:

- 프론트 mock 파트너 id는 문자열 slug
- DB 파트너 id는 UUID

이 상태에서는 프론트와 DB가 서로 다른 파트너를 보고 있었음

변경 후:

- `app/(user)/_data/mock-garages.ts`의 `garage.id`를 실제 `partners.id` UUID 기준으로 정렬
- `garage.bayIds`를 실제 `bays.id` 목록과 매핑

추가된 helper:

- `getGarageBayIdByNumber`
- `getGaragePrimaryBayId`

---

## 8. 실제 검증 결과

다음 시나리오를 실제 로컬 서버 + 실제 Supabase DB로 검증했다.

### 8-1. 공통 빌드 검증

- `npx tsc -p tsconfig.json --noEmit`
- `npm run build`

결과:

- 둘 다 통과

### 8-2. 셀프 예약 검증

검증 항목:

- 선택한 베이 번호가 실제 `bay_id`로 저장되는지
- 90분 예약 시 금액 계산이 맞는지

결과:

- 성공
- 실제 응답에서 선택한 베이 id가 반영됨

### 8-3. 전문가 맡기기 검증

검증 항목:

- 같은 업장/같은 시간에 여러 건 예약 시 베이가 자동 분산되는지

결과:

- 성공
- 실제 `bay_id`가 `A-1 -> A-2 -> A-3` 식으로 자동 배정됨

### 8-4. 체크인 / 체크아웃 / 리뷰

검증 항목:

- `SELF_SERVICE 예약 -> 체크인 -> 체크아웃 -> 리뷰`
- `SHOP_SERVICE 예약 -> 체크아웃`

결과:

- 모두 성공

---

## 9. 이번에 생성/수정된 핵심 파일

### 데이터/모델

- `app/(user)/_data/mock-garages.ts`

### 사용자 화면

- `app/(user)/partner/[id]/page.tsx`
- `app/(user)/partner/[id]/reviews/page.tsx`
- `app/(user)/partner/[id]/work/page.tsx`
- `app/(user)/partner/[id]/schedule/page.tsx`

### API

- `app/api/reservations/route.ts`
- `app/api/checkout/route.ts`
- `app/api/checkin/route.ts`
- `app/api/reviews/route.ts`

### DB migration 파일

- `supabase/migrations/20260318_align_reservations_2way.sql`

---

## 10. 아직 남아 있는 작업

현재 기준 남은 필수 작업은 없다.

완료 상태:

- 데이터 정렬: 완료
- UI/플로우 정렬: 완료
- API 동작 정렬: 완료
- 실제 예약/체크인/체크아웃/리뷰 검증: 완료
- `reservations` 스키마 공식 2-way화: 완료

참고:

- `supabase/migrations/20260318_align_reservations_2way.sql`은 실제로 SQL Editor에서 실행되었고
- 이후 `reservations` 컬럼 반영과 API source of truth 전환까지 다시 확인했다

---

## 11. 추천 다음 순서

1. 관리자/정산/예약 이력 화면에서 `reservation_type`, `package_id`, `duration_minutes`를 직접 활용하도록 확장
2. 파트너별 실제 영업시간/비가동 베이/휴무일을 mock이 아닌 DB 기준으로 관리하도록 확장
3. 인증이 붙으면 `MOCK_USER_ID`를 실제 로그인 사용자 id로 교체
4. 필요 시 `package_id`를 별도 패키지 테이블과 연결해 서버 기반 패키지 관리 구조로 확장

---

## 12. 결론

현재 상태는 다음으로 요약할 수 있다.

- 사용자 입장에서 2-way 예약은 실제로 동작한다.
- UI에서 보이는 베이/예약 구조와 실제 DB row 연결도 맞췄다.
- 전문가 맡기기 예약도 실제 베이에 자동 분산 저장된다.
- DB 스키마도 이제 2-way 구조를 직접 source of truth로 가진다.

즉, 현재 상태는 "동작 완료 + DB source of truth 정렬 완료" 상태다.
