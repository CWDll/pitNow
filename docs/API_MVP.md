# API MVP

## Principles

- Next.js App Router
- Route Handler based API
- Supabase DB
- MVP API uses Supabase Auth user id when `Authorization: Bearer <access_token>` is provided.
- Local development may use `PITNOW_DEV_USER_ID` fallback unless `PITNOW_DISABLE_DEV_AUTH_FALLBACK=true`.
- All responses are JSON
- All status transitions must be explicit
- Reservation conflicts must be rejected by the DB layer

---

## 1. POST /api/reservations

⸻

기능:
예약 생성 legacy endpoint

상태:
• 결제 도입 이후 기본 비활성화
• `PITNOW_ALLOW_DIRECT_RESERVATION_CREATE=true`일 때만 개발/마이그레이션 검증용으로 허용
• 사용자 예약 확정은 `/api/payments/prepare` → `/api/payments/confirm` 흐름을 사용해야 함

입력:
{
reservationType: 'SELF_SERVICE' | 'SHOP_SERVICE',
bayId: string,
vehicleId: string,
packageId?: string,
taskIds: string[],
agreeOnlySelectedTasks: boolean,
consentMethod: 'CHECKBOX' | 'SIGNATURE',
signatureImageUrl?: string,
helperVerifyRequested: boolean,
startTime: string (ISO),
endTime: string (ISO)
}

로직:
• startTime < endTime 검증
• 작업 시간은 1시간 이상 + 1시간 단위 검증
• reservationType은 SELF_SERVICE / SHOP_SERVICE만 허용
• taskIds는 self_maintenance_tasks.is_legal=true 만 허용
• SELF_SERVICE는 taskIds 최소 1개 필수
• SELF_SERVICE는 agreeOnlySelectedTasks=true 필수
• SELF_SERVICE는 consentMethod 검증 (SIGNATURE면 signatureImageUrl 필수)
• SHOP_SERVICE는 packageId 필수
• SHOP_SERVICE는 partner_package_prices 기준으로 packageId/가격/소요시간 검증
• vehicleId는 로그인한 사용자 소유 vehicles row만 허용
• blockedUntil = endTime + 1시간
• SELF_SERVICE에서 helperVerifyRequested=true 이면 helperVerifyFee 계산
(기본 5,000 + 선택 작업별 단가 합산)
• helperVerifyFee는 클라이언트 입력을 신뢰하지 않고 서버에서 계산
• user_id는 Supabase Auth `auth.users.id` 사용
• 로컬 개발 fallback은 `PITNOW_DEV_USER_ID` 기준
• status = CONFIRMED
• SELF_SERVICE total_price = 파트너 시간요금 × 예약시간 + helperVerifyFee
• SHOP_SERVICE total_price = 파트너 패키지 가격
• SELF_SERVICE는 reservation_tasks / self_task_agreements 저장
• 겹침은 DB에서 자동 차단

에러:
• 시간 겹침
• 잘못된 시간 범위
• bay 없음
• 로그인 사용자 소유가 아닌 vehicleId
• 법적 허용 외 작업 선택
• 서약/동의 누락

성공 응답:
{
id: reservation_id,
status: “CONFIRMED”,
blockedUntil: string,
helperVerifyFee: number
}

⸻

2. GET /api/reservations/:id

⸻

기능:
로그인 사용자의 예약 상세 조회

검증:
• Authorization Bearer session 또는 local dev fallback 필요
• reservation.user_id = auth user id

응답:
{
reservation: {
id,
reservationType,
bookingMode,
partnerId,
garageName,
bayId,
bayLabel,
carId,
carLabel,
startTime,
endTime,
dateLabel,
status,
totalPrice,
workTitle,
taskIds,
taskLabels,
selectedTaskCount,
packageId,
packageTitle
}
}

용도:
• 예약 완료 화면 새로고침/재진입 시 URL query 대신 DB 원천으로 화면 복원
• 예약 내역에서 상세/체크인으로 진입할 때 예약 ID 기준 hydrate

⸻

3. POST /api/checkin

⸻

기능:
체크인 + 사용 시작

입력:
{
reservationId: string,
frontImg: string,
rearImg: string,
leftImg: string,
rightImg: string
}

검증:
• 이미지 4장 필수
• reservation 존재
• status = CONFIRMED
•이미 체크인된 경우 불가

로직:
• checkins insert
• reservations.status → CHECKED_IN

성공 응답:
{
status: “CHECKED_IN”
}

⸻

4. POST /api/reservations/:id/start

⸻

기능:
이용 시작 상태 전환 + 서버 기준 타이머 기준값 반환

검증:
• SELF_SERVICE는 CHECKED_IN 상태만 시작 가능
• SHOP_SERVICE는 CONFIRMED 상태만 시작 가능
• 이미 IN_USE이면 idempotent 성공 응답
• COMPLETED/CANCELLED 상태는 시작 불가

로직:
• reservations.status → IN_USE
• reservation_status_logs에 상태 전환 로그 저장
• 서버 현재 시각 serverNow 반환
• startTime/endTime/totalPrice 반환

성공 응답:
{
status: “IN_USE”,
serverNow: string,
startTime: string,
endTime: string,
totalPrice: number
}

⸻

5. POST /api/reservations/:id/cancel

⸻

기능:
사용자가 본인 예약을 취소

입력:
{
reason?: string
}

검증:
• Authorization Bearer session 또는 local dev fallback 필요
• reservation.user_id = auth user id
• status = CONFIRMED

로직:
• reservations.status → CANCELLED
• reservation_status_logs에 상태 전환 로그 저장
• 취소 사유는 metadata.reason에 저장

성공 응답:
{
status: “CANCELLED”
}

⸻

6. POST /api/checkout

⸻

기능:
사용 종료 + 초과요금 계산

입력:
{
reservationId: string,
helperVerifyRequested?: boolean,
toolCheckCompleted?: boolean,
cleaningCompleted?: boolean,
wasteDisposalCompleted?: boolean,
checkoutPhoto1?: string,
checkoutPhoto2?: string
}

로직:
• reservation 조회
• 현재 서버시간과 end_time 비교
• 초과 시간 계산
• 1시간 단위 올림
• extra_fee 계산
• SELF_SERVICE는 tool/cleaning/waste 체크와 체크아웃 사진 2장 필수
• helperVerifyRequested=true 이고 예약 시 미선택이면
helperVerifyFee 재계산 후 정산 반영
• basePrice / extraFee / helperVerifyFee / totalSettlement를 서버에서 확정
• checkouts insert
• reservations.status → COMPLETED
• reservation_status_logs에 상태 전환 로그 저장

초과요금 계산 방식:

diff = now - end_time
diff <= 0 → 0
else → ceil(diff / 1시간) \* (시간요금)

성공 응답:
{
status: “COMPLETED”,
basePrice: number,
extraFee: number,
helperVerifyRequested: boolean,
helperVerifyFee: number,
totalSettlement: number
}

⸻

7. GET /api/checkouts?reservationId=:id

⸻

기능:
로그인 사용자의 체크아웃/정산 상세 조회

검증:
• Authorization Bearer session 또는 local dev fallback 필요
• reservation.user_id = auth user id
• checkouts.reservation_id = reservation.id

응답:
{
checkout: {
id,
reservationId,
basePrice,
extraFee,
helperVerifyRequested,
helperVerifyFee,
totalSettlement,
toolCheckCompleted,
cleaningCompleted,
wasteDisposalCompleted,
checkoutPhoto1,
checkoutPhoto2,
completedAt
}
}

용도:
• 완료 화면 새로고침/재진입 시 query 대신 DB 정산 row로 결제 요약 복원
• 영수증/정산 상세 화면의 기반 데이터

⸻

8. POST /api/payments/prepare

⸻

기능:
결제 준비 row 생성 + provider checkout 정보 반환

입력:
{
method: 'CARD' | 'KAKAO_PAY' | 'NAVER_PAY' | 'TOSS_PAY',
reservation: {
reservationType: 'SELF_SERVICE' | 'SHOP_SERVICE',
bayId: string,
vehicleId: string,
packageId?: string,
taskIds?: string[],
agreeOnlySelectedTasks?: boolean,
consentMethod?: 'CHECKBOX' | 'SIGNATURE',
signatureImageUrl?: string,
helperVerifyRequested: boolean,
startTime: string,
endTime: string
}
}

검증:
• Authorization Bearer session 또는 local dev fallback 필요
• 예약 생성과 같은 서버 검증/가격 계산 경로 사용
• 선택한 bay/time window가 active `partner_availability_blocks`와 겹치면 거부
• 클라이언트 결제 금액을 신뢰하지 않음
• 이 단계에서는 reservations row를 만들지 않음

로직:
• server-calculated amount 확정
• payments insert(status = READY)
• reservation_snapshot에 검증된 예약 payload/amount 저장
• PITNOW_PAYMENT_PROVIDER=FAKE 이면 외부 결제창 없이 테스트 checkout 데이터 반환
• PITNOW_PAYMENT_PROVIDER=TOSS_TEST/TOSS_LIVE 이면 Toss checkout 데이터 반환

성공 응답:
{
paymentId: string,
provider: 'FAKE' | 'TOSS',
providerOrderId: string,
amount: number,
currency: 'KRW',
checkout: object
}

⸻

9. POST /api/payments/confirm

⸻

기능:
provider 승인 검증 후 예약 확정

입력:
{
paymentId: string,
providerPaymentKey?: string,
providerOrderId: string,
amount: number
}

검증:
• Authorization Bearer session 또는 local dev fallback 필요
• payments.user_id = auth user id
• payments.status = READY
• 입력 amount = payments.amount
• provider 승인 결과를 서버에서 검증

로직:
• payments.status → APPROVED
• reservation_snapshot 기준으로 reservations insert(status = CONFIRMED)
• reservation_status_logs에 null → CONFIRMED 기록
• payments.reservation_id 저장
• payments.status → RESERVATION_CONFIRMED
• 예약 생성이 DB overlap으로 실패하면 provider cancel/refund 시도 후 REFUNDED 또는 REFUND_PENDING 저장

성공 응답:
{
paymentStatus: 'RESERVATION_CONFIRMED',
reservationId: string
}

예약 overlap after approval 응답:
{
paymentStatus: 'REFUNDED' | 'REFUND_PENDING',
message: string
}

⸻

10. POST /api/payments/fail

⸻

기능:
provider 실패/사용자 결제 취소 기록

입력:
{
paymentId: string,
code?: string,
message?: string
}

검증:
• Authorization Bearer session 또는 local dev fallback 필요
• payments.user_id = auth user id
• payments.status = READY

로직:
• 사용자가 취소한 경우 status = CANCELLED
• provider 오류이면 status = FAILED
• failure_code/failure_message 저장

성공 응답:
{
paymentStatus: 'FAILED' | 'CANCELLED'
}

⸻

11. POST /api/payments/settlement/prepare

⸻

기능:
체크아웃 후 발생한 초과요금/검수비 등 사후정산 결제 준비 row를 생성한다.

입력:
{
reservationId: string,
method: 'CARD' | 'KAKAO_PAY' | 'NAVER_PAY' | 'TOSS_PAY'
}

검증:
• 로그인 사용자 본인의 COMPLETED 예약만 허용
• checkouts row가 있어야 함
• 결제 금액 = checkouts.total_settlement - reservations.total_price
• 결제 금액이 0 이하이면 NO_SETTLEMENT_DUE
• 기존 READY 사후정산 payment가 있으면 새 결제 시작 시 기존 READY row는 CANCELLED
• 이미 SETTLEMENT_CONFIRMED이면 중복 결제 불가

성공 응답:
{
success: true,
paymentId: string,
provider: 'FAKE' | 'TOSS',
providerOrderId: string,
amount: number,
currency: 'KRW',
checkout: object
}

⸻

12. POST /api/payments/settlement/confirm

⸻

기능:
provider 승인 결과를 검증하고 사후정산 결제를 확정한다.

입력:
{
paymentId: string,
providerPaymentKey?: string,
providerOrderId: string,
amount: number
}

검증:
• payment_purpose = CHECKOUT_SETTLEMENT
• payments.status = READY
• provider/order/amount 일치 필수
• Toss mode에서는 /v1/payments/confirm 승인 검증 필수

성공 응답:
{
success: true,
paymentStatus: 'SETTLEMENT_CONFIRMED',
reservationId: string,
checkoutId: string
}

⸻

13. POST /api/reviews

⸻

기능:
이용 완료 후 매장 후기 작성

입력:
{
reservationId: string,
partnerId: string,
rating: number (1~5),
comment?: string
}

검증:
• reservation 존재
• reservation.status = COMPLETED
• reservation의 bay가 partnerId와 일치
• 이미 작성한 reservation 후기 중복 불가
• rating은 1~5 정수

로직:
• reviews insert

성공 응답:
{
success: true,
reviewId: string
}

⸻

14. GET /api/partner-admin/me

⸻

기능:
로그인한 store-admin의 partner membership 조회

검증:
• Supabase Auth session 필수
• `partner_admins.user_id = auth.uid()`
• `partner_admins.is_active = true`

성공 응답:
{
partners: [
{
partnerId: string,
partnerName: string,
role: 'OWNER' | 'STAFF'
}
]
}

⸻

15. GET /api/partner-admin/reservations

⸻

기능:
store-admin 본인 정비소 예약 목록 조회

Query:
{
partnerId: string,
date?: string
}

검증:
• Supabase Auth session 필수
• 요청 user가 `partner_admins.partner_id = partnerId`의 active member여야 함

응답:
{
reservations: [
{
id,
reservationType,
status,
bayId,
bayLabel,
vehicleLabel,
startTime,
endTime,
blockedUntil,
totalPrice,
checkinCompleted: boolean,
checkoutCompleted: boolean
}
]
}

⸻

16. GET /api/partner-admin/reservations/:id

⸻

기능:
store-admin 본인 정비소 예약 상세와 증적 조회

검증:
• Supabase Auth session 필수
• reservation.partner_id가 요청 user의 active `partner_admins.partner_id`에 포함되어야 함

응답:
{
reservation,
checkin,
checkout,
statusLogs
}

주의:
• 고객의 결제 provider key, 내부 payment failure metadata, 다른 정비소 데이터는 반환하지 않는다.

⸻

17. GET /api/partner-admin/bays

⸻

기능:
store-admin 본인 정비소 bay 목록 조회

Query:
{
partnerId: string
}

검증:
• Supabase Auth session 필수
• 요청 user가 `partner_admins.partner_id = partnerId`의 active member여야 함

성공 응답:
{
success: true,
bays: [
{
id,
partnerId,
name,
isActive
}
]
}

⸻

18. PATCH /api/partner-admin/bays/:id

⸻

기능:
store-admin 본인 정비소 bay 활성/비활성 관리

입력:
{
isActive: boolean
}

검증:
• Supabase Auth session 필수
• bay.partner_id가 요청 user의 active `partner_admins.partner_id`에 포함되어야 함
• active bay를 비활성화할 때 해당 bay에 `CONFIRMED`, `CHECKED_IN`, `IN_USE` 예약이 있으면 409 `BAY_HAS_ACTIVE_RESERVATION`
• 성공 시 `partner_admin_audit_logs.action = BAY_ACTIVE_UPDATED` best-effort 기록

성공 응답:
{
success: true,
bay: {
id,
partnerId,
name,
isActive
}
}

⸻

19. GET /api/partner-admin/availability-blocks

⸻

기능:
store-admin 본인 정비소의 예약 차단 시간 목록 조회

Query:
{
partnerId: string,
includeInactive?: boolean
}

검증:
• Supabase Auth session 필수
• partnerId가 요청 user의 active `partner_admins.partner_id`에 포함되어야 함

성공 응답:
{
success: true,
blocks: [
{
id,
partnerId,
bayId,
bayName,
startsAt,
endsAt,
reason,
isActive
}
]
}

⸻

20. POST /api/partner-admin/availability-blocks

⸻

기능:
store-admin 본인 정비소의 전체 업장 또는 특정 bay 예약 차단 시간 생성

입력:
{
partnerId: string,
bayId?: string,
startsAt: string,
endsAt: string,
reason?: string
}

검증:
• Supabase Auth session 필수
• partnerId가 요청 user의 active `partner_admins.partner_id`에 포함되어야 함
• bayId가 있으면 해당 bay.partner_id = partnerId
• startsAt < endsAt
• 같은 scope의 active block과 겹치면 DB constraint 또는 API에서 거부
• 성공 시 `partner_admin_audit_logs.action = AVAILABILITY_BLOCK_CREATED` best-effort 기록

성공 응답:
{
success: true,
blockId: string,
block: {
id,
partnerId,
bayId,
bayName,
startsAt,
endsAt,
reason,
isActive
}
}

⸻

21. PATCH /api/partner-admin/availability-blocks/:id

⸻

기능:
store-admin 본인 정비소 예약 차단 시간 수정 또는 비활성화

입력:
{
startsAt?: string,
endsAt?: string,
reason?: string,
isActive?: boolean
}

검증:
• Supabase Auth session 필수
• block.partner_id가 요청 user의 active `partner_admins.partner_id`에 포함되어야 함
• 수정 후에도 startsAt < endsAt
• bayId 변경은 MVP에서 허용하지 않는다
• 성공 시 변경 내용에 따라 `AVAILABILITY_BLOCK_UPDATED`, `AVAILABILITY_BLOCK_DEACTIVATED`, `AVAILABILITY_BLOCK_REACTIVATED` best-effort 기록

성공 응답:
{
success: true,
block: {
id,
partnerId,
bayId,
bayName,
startsAt,
endsAt,
reason,
isActive
}
}

⸻

22. GET/POST /api/partner-admin/reservations/:id/notes

⸻

기능:
store-admin 본인 정비소 예약의 현장 메모/이슈 목록 조회 및 생성

GET 검증:
• Supabase Auth session 필수
• reservation.partner_id가 요청 user의 active `partner_admins.partner_id`에 포함되어야 함

POST 입력:
{
noteType: 'NOTE' | 'ISSUE' | 'DELAY' | 'NO_SHOW',
body: string
}

POST 검증:
• Supabase Auth session 필수
• reservation.partner_id가 요청 user의 active `partner_admins.partner_id`에 포함되어야 함
• body는 빈 문자열 불가
• 성공 시 `partner_admin_audit_logs.action = RESERVATION_NOTE_CREATED` best-effort 기록

성공 응답:
{
success: true,
notes?: [
{
id,
reservationId,
partnerId,
noteType,
body,
isResolved,
createdAt
}
],
note?: {
id,
reservationId,
partnerId,
noteType,
body,
isResolved,
createdAt
}
}

⸻

23. PATCH /api/partner-admin/reservation-notes/:id

⸻

기능:
store-admin 본인 정비소 현장 메모/이슈 해결 상태 변경

입력:
{
isResolved: boolean
}

검증:
• Supabase Auth session 필수
• note.partner_id가 요청 user의 active `partner_admins.partner_id`에 포함되어야 함
• 성공 시 `RESERVATION_NOTE_RESOLVED` 또는 `RESERVATION_NOTE_REOPENED` best-effort 기록

성공 응답:
{
success: true,
note: {
id,
reservationId,
partnerId,
noteType,
body,
isResolved,
resolvedAt,
createdAt
}
}

⸻

상태 전환 규칙

결제 상태:

READY → APPROVED
APPROVED → RESERVATION_CONFIRMED
READY → SETTLEMENT_CONFIRMED
APPROVED → REFUND_PENDING
REFUND_PENDING → REFUNDED
READY → FAILED
READY → CANCELLED

예약 상태:

허용:

CONFIRMED → CHECKED_IN
CHECKED_IN → IN_USE
CONFIRMED → IN_USE (SHOP_SERVICE only)
IN_USE → COMPLETED
CONFIRMED → CANCELLED

허용되지 않는 전환은 400 반환.

⸻

중요 원칙 1. 예약 겹침은 반드시 DB 레벨. 2. 체크인은 4장 사진 필수. 3. 타이머는 서버 시간 기준. 4. 초과요금은 서버에서 계산. 5. 프론트 상태만 믿지 않는다.

추가 원칙 6. Self 정비는 법적 허용 작업만 선택 가능. 7. 선택 작업 외 작업 금지 동의(체크박스/서명) 증적을 저장. 8. 베이 점유 충돌은 start_time ~ blocked_until(end+1h) 기준으로 판단.
9. 예약 `CONFIRMED`는 결제 승인 검증 이후에만 생성한다. 10. 개발/E2E는 `PITNOW_PAYMENT_PROVIDER=FAKE`로 실제 결제 없이 검증한다.

⸻

MVP 제외
• 사용자/관리자 주도 환불 기능
• 헬퍼 대행 작업 모드
• 관리자 API
• 노쇼 자동 취소
