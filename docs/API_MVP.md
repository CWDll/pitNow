구조:
• Next.js App Router
• Route Handler 사용
• Supabase DB
• Mock user_id 사용

모든 응답은 JSON.
모든 상태 전환은 명시적이어야 한다.

⸻

1. POST /api/reservations

⸻

기능:
예약 생성

입력:
{
bayId: string,
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
• taskIds는 self_maintenance_tasks.is_legal=true 만 허용
• taskIds 최소 1개 필수
• agreeOnlySelectedTasks=true 필수
• consentMethod 검증 (SIGNATURE면 signatureImageUrl 필수)
• blockedUntil = endTime + 1시간
• helperVerifyRequested=true 이면 helperVerifyFee 계산
	(기본 5,000 + 선택 작업별 단가 합산)
• user_id는 MOCK_USER_ID 사용
• status = CONFIRMED
• total_price 계산 후 저장 (시간요금 + helperVerifyFee)
• reservation_tasks / self_task_agreements 저장
• 겹침은 DB에서 자동 차단

에러:
• 시간 겹침
• 잘못된 시간 범위
• bay 없음
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

2. POST /api/checkin

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

3. POST /api/checkout

⸻

기능:
사용 종료 + 초과요금 계산

입력:
{
reservationId: string,
helperVerifyRequested?: boolean
}

로직:
• reservation 조회
• 현재 서버시간과 end_time 비교
• 초과 시간 계산
• 1시간 단위 올림
• extra_fee 계산
• helperVerifyRequested=true 이고 예약 시 미선택이면
	helperVerifyFee 재계산 후 정산 반영
• checkouts insert
• reservations.status → COMPLETED

초과요금 계산 방식:

diff = now - end_time
diff <= 0 → 0
else → ceil(diff / 1시간) * (시간요금)

성공 응답:
{
status: “COMPLETED”,
extraFee: number,
helperVerifyFee: number,
totalSettlement: number
}

⸻

4. POST /api/reviews

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
CHECKED_IN → IN_USE (프론트 계산용)
IN_USE → COMPLETED
CONFIRMED → CANCELLED

허용되지 않는 전환은 400 반환.

⸻

중요 원칙 1. 예약 겹침은 반드시 DB 레벨. 2. 체크인은 4장 사진 필수. 3. 타이머는 서버 시간 기준. 4. 초과요금은 서버에서 계산. 5. 프론트 상태만 믿지 않는다.

추가 원칙
6. Self 정비는 법적 허용 작업만 선택 가능.
7. 선택 작업 외 작업 금지 동의(체크박스/서명) 증적을 저장.
8. 베이 점유 충돌은 start_time ~ blocked_until(end+1h) 기준으로 판단.

⸻

MVP 제외
• 결제 API
• 환불
• 헬퍼 대행 작업 모드
• 관리자 API
• 노쇼 자동 취소
