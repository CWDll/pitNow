# PitNow Release QA Checklist

This checklist is for the final Preview/Production readiness pass after local
automated tests are green.

## 1. Automated Checks

Run from the project root before a release candidate is accepted.

```bash
node scripts/check-supabase-schema.mjs
npm run lint
npx tsc --noEmit
npm run build
npm run e2e:ui
PORT=3011 PITNOW_PAYMENT_PROVIDER=FAKE npm run start
PITNOW_E2E_BASE_URL=http://localhost:3011 npm run e2e:partner-admin
```

Expected:

- Supabase schema check passes, including package audit/request tables.
- UI E2E passes all mobile/admin smoke tests.
- Partner-admin API E2E passes package request, bay, availability block, notes,
  and audit checks.

## 2. Environment Variables

Verify Vercel Preview and Production separately.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PITNOW_ADMIN_ACCESS_TOKEN`
- `NEXT_PUBLIC_KAKAO_MAP_APP_KEY`
- `NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY`
- `TOSS_PAYMENTS_SECRET_KEY`
- `PITNOW_PAYMENT_PROVIDER`

Preview recommendation:

- `PITNOW_PAYMENT_PROVIDER=TOSS_TEST` for manual Toss sandbox QA.
- Use `FAKE` only for local automated E2E.

## 3. User Manual QA

Use a normal user account, not the partner-admin account.

- Home loads on mobile viewport.
- Kakao map renders on the deployed domain.
- Location denied path shows a clear message when tapping distance filter.
- Location allowed path centers near current position and enables distance sort.
- Partner cards show self hourly price and shop package price.
- Partner detail shows bay availability text consistently.
- Schedule screen does not allow past dates or past time blocks.
- Availability-blocked slots are disabled before payment.
- Full self-service loop:
  - reserve
  - Toss sandbox payment
  - reservation appears under upcoming reservations
  - cancel path works when applicable
- Full shop-service loop:
  - package selection
  - schedule
  - Toss sandbox payment
  - reservation title remains stable after package price/name changes.

## 4. Partner-admin Manual QA

Use a user linked in `partner_admins`.

- `/partner-admin` login succeeds.
- Partner dropdown only shows allowed partners.
- Reservation list opens detail modal and remains readable on desktop.
- Bay inactive state changes from partner-admin.
- Bay with active/upcoming reservation cannot be deactivated.
- Availability block creation disables matching user schedule slots.
- Availability block deactivation re-enables matching user schedule slots.
- Field notes can be created for `NOTE`, `ISSUE`, `DELAY`, `NO_SHOW`.
- Notes can be resolved and reopened.
- Package/price section is read-only except for change requests.
- Package price change request appears in `/admin/packages`.

## 5. Admin Manual QA

Use `/admin-login` with the admin token.

- `/admin` overview renders.
- `/admin/reservations` filters by status, partner, date, and issue state.
- Reservation detail shows payments, evidence, partner notes, and audit logs.
- `/admin/payments` filters and cleanup actions render.
- `/admin/settlement` completed settlement rows render.
- `/admin/partner-audit` filters by partner/action/range/search.
- `/admin/packages` can:
  - update partner package price
  - activate/deactivate partner package exposure
  - edit service package catalog fields
  - approve partner package change request
  - reject partner package change request
  - show audit logs after approval/update.

## 6. Release Gate

Do not promote to production until all are true.

- Automated checks passed on the release candidate.
- Supabase SQL migrations are applied to the target project.
- Kakao domain is registered for the target deployment URL.
- Toss sandbox card and easy-pay paths have been manually checked.
- Admin and partner-admin smoke paths are manually checked on the deployed URL.
- No unexpected rows from E2E cleanup remain in reservations, notes, package
  requests, or audit logs.

## 7. Preview 수동 QA 실행 기록

Preview 배포 URL 기준으로 실제 브라우저에서 확인한 결과를 남긴다.

기록 규칙:

- 상태는 `대기`, `통과`, `실패`, `보류`, `해당 없음` 중 하나로 적는다.
- 실패나 보류가 있으면 `비고 / 증상 / 후속 작업`에 재현 경로와 기대 동작을 적는다.
- 결제, 예약, 메모, 패키지 요청처럼 DB row가 남는 항목은 QA 종료 후 cleanup 여부를 확인한다.

### 7.1 QA 기본 정보

| 항목 | 값 |
| --- | --- |
| QA 일자 |  |
| QA 담당 |  |
| Preview URL |  |
| Vercel 배포 커밋 |  |
| Supabase 프로젝트 |  |
| 결제 provider | `TOSS_TEST` |
| 일반 사용자 계정 |  |
| Partner-admin 계정 |  |
| Admin 접속 방식 | `/admin-login` + admin token |
| 최종 판정 | 대기 |

### 7.2 자동 검증 결과

| 순서 | 확인 항목 | 명령 / 기준 | 상태 | 비고 |
| --- | --- | --- | --- | --- |
| 1 | Supabase schema check | `node scripts/check-supabase-schema.mjs` | 대기 | package audit/request tables 포함 |
| 2 | Lint | `npm run lint` | 대기 |  |
| 3 | TypeScript | `npx tsc --noEmit` | 대기 |  |
| 4 | Build | `npm run build` | 대기 |  |
| 5 | UI E2E | `npm run e2e:ui` | 대기 |  |
| 6 | Partner-admin API E2E | `PITNOW_E2E_BASE_URL=http://localhost:3011 npm run e2e:partner-admin` | 대기 |  |

### 7.3 환경변수 / 외부 설정

| 순서 | 확인 항목 | Preview 기준 | 상태 | 비고 |
| --- | --- | --- | --- | --- |
| 1 | Supabase URL | `NEXT_PUBLIC_SUPABASE_URL` 설정 | 대기 |  |
| 2 | Supabase anon key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` 설정 | 대기 |  |
| 3 | Supabase service role key | `SUPABASE_SERVICE_ROLE_KEY` 설정 | 대기 | 서버 전용 |
| 4 | Admin token | `PITNOW_ADMIN_ACCESS_TOKEN` 설정 | 대기 |  |
| 5 | Kakao map key | `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` 설정 | 대기 |  |
| 6 | Kakao web domain | Preview URL이 Kakao Developers Web 플랫폼에 등록됨 | 대기 |  |
| 7 | Toss client key | `NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY` test key 설정 | 대기 |  |
| 8 | Toss secret key | `TOSS_PAYMENTS_SECRET_KEY` test secret 설정 | 대기 | 서버 전용 |
| 9 | Payment provider | `PITNOW_PAYMENT_PROVIDER=TOSS_TEST` | 대기 | local E2E만 `FAKE` |
| 10 | Supabase SQL migrations | target project에 최신 migration 적용 | 대기 | `check-supabase-schema`로 확인 |

### 7.4 사용자 모바일 QA

| 순서 | 확인 항목 | 경로 / 행동 | 기대 결과 | 상태 | 비고 / 증상 / 후속 작업 |
| --- | --- | --- | --- | --- | --- |
| 1 | 홈 모바일 로드 | Preview URL `/` 접속 | 모바일 홈이 깨지지 않고 표시됨 | 대기 |  |
| 2 | Kakao 지도 로드 | 홈 지도 영역 확인 | fallback 미니맵이 아니라 Kakao 지도 타일이 표시됨 | 대기 |  |
| 3 | 위치 거부 경로 | 위치 권한 거부 후 거리 필터/내 위치 사용 | 명확한 안내 메시지 표시, 화면 유지 | 대기 |  |
| 4 | 위치 허용 경로 | 위치 권한 허용 | 현재 위치 중심 이동, 거리 정렬 가능 | 대기 |  |
| 5 | 파트너 카드 가격 | 홈 파트너 카드 확인 | Self 시간가와 Shop 패키지 가격 표시 | 대기 |  |
| 6 | 파트너 상세 bay 문구 | `/partner/:id` | 총 bay/사용 가능 bay 문구가 일관됨 | 대기 |  |
| 7 | 과거 날짜 차단 | schedule 화면에서 과거 날짜 선택 시도 | 과거 날짜 선택 불가 | 대기 |  |
| 8 | 과거 시간 차단 | 오늘 schedule에서 지난 시간 선택 시도 | 과거 시간 block 비활성화 | 대기 |  |
| 9 | availability block 반영 | partner-admin에서 block 생성 후 사용자 schedule 확인 | block된 slot disabled | 대기 |  |
| 10 | Self 예약 결제 | Self 작업 선택 → 일정 → Toss sandbox 결제 | 결제 성공 후 예약 확정 | 대기 |  |
| 11 | Self 예약 목록 | `/reservation` | 방금 만든 예약이 예정 예약에 표시됨 | 대기 |  |
| 12 | Self 취소 가능 경로 | 취소 가능한 예약에서 cancel 실행 | 예약 취소/환불 상태가 일관됨 | 대기 |  |
| 13 | Self 체크인 시간 제한 | 예약 시작 15분보다 일찍 `/checkin` 진입/제출 | 입장 가능 시각 안내, API `CHECKIN_NOT_OPEN`, 사진 제출 불가 | 대기 |  |
| 14 | Self 체크인 | 예약 시작 15분 전 이후 QR 확인 + 4 photos | 사진 4장 없으면 진행 불가, 완료 시 CHECKED_IN | 대기 |  |
| 15 | Self 이용 시작 | 체크인 후 in-use 진입 | 서버 시간 기준 타이머, IN_USE 전환, 연장/SOS/매장 연락 버튼 없음 | 대기 |  |
| 16 | 이용 중 재진입 | 이용 중 다른 탭으로 이동 | 최상단 `이용 중인 예약으로 가기` 배너로 타이머 복귀 | 대기 |  |
| 17 | Self 체크아웃 | checklist + 2 photos | 검수 재선택 없이 예약 기본요금/검수비/추가요금/추가 결제비용 표시 | 대기 |  |
| 18 | 사후정산 결제 | 실제 초과 이용으로 추가 결제 발생 | 초과요금 근거가 표시되고 Toss sandbox 결제 후 complete 진입 | 대기 |  |
| 19 | 리뷰 작성 | complete/review 작성 | 완료 예약에 리뷰 저장/표시 | 대기 |  |
| 20 | 영수증 재예약 | receipt의 `다시 예약` 선택 | 이용한 정비소 상세로 이동 | 대기 |  |
| 21 | 예약 완료 연락 기능 | 주소 복사 / 전화하기 | 실제 정비소 주소가 클립보드에 복사되고 등록 번호로 전화 연결 | 대기 |  |
| 22 | Shop 예약 결제 | Shop package 선택 → 일정 → Toss sandbox 결제 | 결제 성공 후 예약 확정 | 대기 |  |
| 23 | Shop 예약 snapshot | 예약 후 package 가격/이름 변경 | 예약 목록/상세 title이 예약 당시 snapshot 기준으로 안정 표시 | 대기 |  |

### 7.5 Partner-admin QA

| 순서 | 확인 항목 | 경로 / 행동 | 기대 결과 | 상태 | 비고 / 증상 / 후속 작업 |
| --- | --- | --- | --- | --- | --- |
| 1 | 로그인 | `/partner-admin` | partner-admin 계정으로 접근 가능 | 대기 |  |
| 2 | partner scope | partner dropdown 확인 | 허용된 정비소만 표시 | 대기 |  |
| 3 | 예약 목록 | 오늘/예정 예약 조회 | 본인 정비소 예약만 표시 | 대기 |  |
| 4 | 예약 상세 modal | 예약 row 클릭 | 체크인/체크아웃 증적과 상태 로그가 읽기 좋게 표시 | 대기 |  |
| 5 | bay 비활성화 | 예약 없는 active bay 비활성화 | 상태 변경 성공, audit 기록 | 대기 |  |
| 6 | 예약 있는 bay 차단 | active/upcoming 예약 있는 bay 비활성화 시도 | 버튼 disabled 또는 `BAY_HAS_ACTIVE_RESERVATION` | 대기 |  |
| 7 | availability block 생성 | 특정 bay 또는 업장 전체 block 생성 | 생성 성공, 사용자 schedule slot disabled | 대기 |  |
| 8 | availability block 수정 | 시간/사유 수정 | 수정 성공, audit 기록 | 대기 |  |
| 9 | availability block 해제 | active block 비활성화 | 해제 성공, 사용자 schedule slot 재활성화 | 대기 |  |
| 10 | field note 생성 | `NOTE` 작성 | detail/admin에 표시 | 대기 |  |
| 11 | issue note 생성 | `ISSUE` 작성 | unresolved issue count 반영 | 대기 |  |
| 12 | delay/no-show note | `DELAY`, `NO_SHOW` 작성 | note type별 저장/표시 | 대기 |  |
| 13 | note 해결 | issue resolve | resolved 상태와 resolved metadata 반영 | 대기 |  |
| 14 | note 재오픈 | resolved note reopen | unresolved 상태로 복귀 | 대기 |  |
| 15 | package/price 읽기 | 패키지 섹션 확인 | 직접 수정 UI 없이 현재 가격 표시 | 대기 |  |
| 16 | 가격 변경 요청 | 희망 가격 + 사유 제출 | request 생성, `/admin/packages`에 표시 | 대기 |  |

### 7.6 Admin QA

| 순서 | 확인 항목 | 경로 / 행동 | 기대 결과 | 상태 | 비고 / 증상 / 후속 작업 |
| --- | --- | --- | --- | --- | --- |
| 1 | Admin login | `/admin-login` | admin token으로 로그인 성공 | 대기 |  |
| 2 | Overview | `/admin` | 주요 운영 요약 렌더 | 대기 |  |
| 3 | 예약 목록 필터 | `/admin/reservations` status/partner/date/issue 필터 | 필터 결과가 일관됨 | 대기 |  |
| 4 | 예약 상세 | `/admin/reservations/:id` | payment, evidence, partner notes, audit logs 표시 | 대기 |  |
| 5 | Issues badge | unresolved partner note 있는 예약 | 목록 Issues 열에 `Open N` 표시 | 대기 |  |
| 6 | Payments | `/admin/payments` | 필터와 cleanup/refunded 관련 UI 렌더 | 대기 |  |
| 7 | Settlement | `/admin/settlement` | completed settlement rows 표시 | 대기 |  |
| 8 | Partner audit | `/admin/partner-audit` | partner/action/range/search 필터 동작 | 대기 |  |
| 9 | package price update | `/admin/packages`에서 partner package price 수정 | 가격 row 갱신, audit log 생성 | 대기 |  |
| 10 | package exposure toggle | partner package 활성/비활성 변경 | 신규 예약 노출 상태 변경, hard delete 없음 | 대기 |  |
| 11 | service package edit | catalog 필드 수정 | catalog 갱신, 기존 예약 snapshot 유지 | 대기 |  |
| 12 | change request approve | pending request 승인 | 가격 반영, request approved, audit log 생성 | 대기 |  |
| 13 | change request reject | pending request 거절 | 가격 미변경, request rejected | 대기 |  |
| 14 | audit logs | `/admin/packages` 최근 이력 | approval/update 이력이 표시됨 | 대기 |  |

### 7.7 Toss Sandbox QA

| 순서 | 확인 항목 | 결제 경로 | 기대 결과 | 상태 | 비고 / provider order/payment key |
| --- | --- | --- | --- | --- | --- |
| 1 | 예약 카드 결제 | Self 또는 Shop 선결제 | `RESERVATION_CONFIRMED` | 대기 |  |
| 2 | 예약 간편결제 | KakaoPay 등 Toss easy-pay | `RESERVATION_CONFIRMED` | 대기 |  |
| 3 | 결제 실패/취소 | Toss 창에서 취소 또는 실패 | payment `FAILED` 또는 `CANCELLED` 기록 | 대기 |  |
| 4 | 예약 취소 환불 | admin/user 취소 가능 경로 | payment `REFUNDED` 또는 refund pending 상태 확인 | 대기 |  |
| 5 | 사후정산 카드 결제 | checkout 후 추가 결제 | `SETTLEMENT_CONFIRMED` | 대기 |  |
| 6 | 사후정산 간편결제 | checkout 후 easy-pay | `SETTLEMENT_CONFIRMED` | 대기 |  |

### 7.8 Cleanup / Release Gate 기록

| 순서 | 확인 항목 | 기준 | 상태 | 비고 |
| --- | --- | --- | --- | --- |
| 1 | 테스트 예약 cleanup | QA/E2E로 만든 불필요 예약 없음 | 대기 |  |
| 2 | 테스트 notes cleanup | 불필요 partner_reservation_notes 없음 | 대기 |  |
| 3 | 테스트 package requests cleanup | 불필요 pending/rejected request 없음 | 대기 |  |
| 4 | 테스트 audit rows 확인 | audit row는 필요 시 남기되 QA row 식별 가능 | 대기 |  |
| 5 | Storage evidence 확인 | 불필요 사진 파일 cleanup 또는 식별 가능 | 대기 |  |
| 6 | Production 승격 판단 | 실패/보류 항목 없음 | 대기 |  |
