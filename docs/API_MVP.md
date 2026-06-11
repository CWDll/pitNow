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
예약 생성

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

5. POST /api/checkout

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

6. POST /api/reviews

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

상태 전환 규칙

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

⸻

MVP 제외
• 결제 API
• 환불
• 헬퍼 대행 작업 모드
• 관리자 API
• 노쇼 자동 취소
