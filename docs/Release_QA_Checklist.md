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
| 1 | Supabase URL | `NEXT_PUBLIC_SUPABASE_URL` 설정 | 성공 | Production 앱 연결 확인 |
| 2 | Supabase anon key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` 설정 | 성공 | Production 로그인·사용자 전체 흐름 확인 |
| 3 | Supabase service role key | `SUPABASE_SERVICE_ROLE_KEY` 설정 | 성공 | Production 범위 및 Sensitive 설정 확인 |
| 4 | Admin token | `PITNOW_ADMIN_ACCESS_TOKEN` 설정 | 성공 | Production/Preview 범위 Admin QA 확인 |
| 5 | Kakao map key | `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` 설정 | 성공 | StudyMapApi JavaScript 키 사용 확인 |
| 6 | Kakao web domain | Preview URL이 Kakao Developers Web 플랫폼에 등록됨 | 성공 | `https://pit-now.vercel.app` 등록 및 지도 로드 확인 |
| 7 | Toss client key | `NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY` test key 설정 | 성공 | Safari Toss Sandbox 결제 확인 |
| 8 | Toss secret key | `TOSS_PAYMENTS_SECRET_KEY` test secret 설정 | 성공 | 서버 승인·환불·사후정산 확인 |
| 9 | Payment provider | `PITNOW_PAYMENT_PROVIDER=TOSS_TEST` | 성공 | Production `TOSS_TEST`, local E2E만 `FAKE` |
| 10 | Supabase SQL migrations | target project에 최신 migration 적용 | 성공 | schema check 및 공개 이미지 실제 업로드 E2E 성공 |

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
| 10 | Self 예약 결제 | Self 작업 선택 → 일정 → Toss sandbox 결제 | 결제 성공 후 예약 확정 | 성공 | iPhone Safari 실결제 QA |
| 11 | Self 예약 목록 | `/reservation` | 방금 만든 예약이 예정 예약에 표시됨 | 성공 | iPhone 전체 예약 흐름에서 확인 |
| 12 | Self 취소 가능 경로 | 취소 가능한 예약에서 cancel 실행 | 예약 취소/환불 상태가 일관됨 | 대기 |  |
| 13 | Self 체크인 시간 제한 | 예약 시작 15분보다 일찍 `/checkin` 진입/제출 | 입장 가능 시각 안내, API `CHECKIN_NOT_OPEN`, 사진 제출 불가 | 성공 | iPhone에서 15분 전 제한 확인 |
| 14 | Self 체크인 | 예약 시작 15분 전 이후 정비소 QR 또는 수동 코드 + 4 photos | 다른 정비소/오류 코드는 거부, 사진 4장 없으면 진행 불가, 완료 시 CHECKED_IN | 성공 | iPhone에서 Partner QR 인증, 사진 4장 제출 및 타이머 화면 이동 확인 |
| 15 | Self 이용 시작 | 체크인 후 in-use 진입 | 서버 시간 기준 타이머, IN_USE 전환, 연장/SOS/매장 연락 버튼 없음 | 성공 | iPhone 이용 시작 확인 |
| 16 | 이용 중 재진입 | 이용 중 다른 탭 및 `/reservation`으로 이동 | 최상단 복귀 배너가 보이고 예약은 `진행 중·예정` 탭에 유지됨 | 성공 | 다른 탭 이동 후 복귀 확인 |
| 17 | Self 체크아웃 | checklist + 2 photos | 검수 재선택 없이 예약 기본요금/검수비/추가요금/추가 결제비용 표시 | 성공 | iPhone 체크아웃 확인 |
| 18 | 사후정산 결제 | 1시간 이상 초과된 테스트 예약으로 추가 결제 발생 | 타이머는 `초과 이용 01:00:00`에서 멈추고 초과요금은 최대 1시간분만 표시·청구되며 Toss sandbox 결제 후 complete 진입 | 성공 | Toss Sandbox 사후정산 확인 |
| 19 | 리뷰 작성 | complete/review 작성 | 완료 예약에 리뷰 저장/표시 | 성공 | iPhone 텍스트·사진 리뷰 확인 |
| 20 | 내 차 등록/정비 이력 | `/my-car` 차량 추가 및 완료 예약 차량 선택 | 차종 드롭다운이 한 줄로 표시되고 소형 화물차 등 12종 선택 가능, 완료 작업명·정비소·이용 일시·최종 정산액 표시 | 성공 | 완료 예약 정비 이력 확인 |
| 21 | 지난 이용 복귀 | `/reservation` 지난 이용 → 완료 상세 | 상단 뒤로가기로 예약 목록 복귀, 결제 직후 완료 화면에는 미표시 | 대기 |  |
| 22 | 영수증 재예약 | receipt의 `다시 예약` 선택 | 이용한 정비소 상세로 이동 | 성공 | iPhone 영수증 흐름 확인 |
| 23 | 예약 완료 연락 기능 | 주소 복사 / 전화하기 | 실제 정비소 주소가 클립보드에 복사되고 등록 번호로 전화 연결 | 대기 |  |
| 24 | Shop 예약 결제 | Shop package 선택 → 일정 → Toss sandbox 결제 | 결제 성공 후 예약 확정 | 성공 | iPhone Safari Toss Sandbox 확인 |
| 25 | Shop 예약 snapshot | 예약 후 package 가격/이름 변경 | 예약 목록/상세 title이 예약 당시 snapshot 기준으로 안정 표시 | 대기 |  |
| 26 | 차량 중량 수정 | `/my-car` 기존 차량 `정보 수정` | 차종과 공차중량 kg 저장 후 새로고침해도 유지 | 대기 |  |
| 27 | 베이 차량 호환성 | 제한 베이 일정 화면에서 허용/비허용 차량 각각 선택 | 허용 차량은 예약 가능, 비허용 차종·중량 초과·중량 미등록 차량은 베이 disabled 및 사유 표시 | 대기 |  |
| 28 | 홈 정비소 대표 사진 | `/partner-admin` 사진 등록·대표 지정 후 `/` 확인 | 선택한 대표 사진 1장이 해당 정비소 카드에 표시 | 자동 검증 성공 | 실제 Storage 업로드와 홈 public URL 확인 |
| 29 | 정비소 사진 갤러리 | `/partner/:id` 사진 선택 | 등록한 사진 전체가 순서대로 표시되고 선택 시 화면 내 확대 | 자동 검증 성공 | 실제 업로드 사진과 확대 modal 확인 |
| 30 | 사용자 프로필 | `/mypage` 닉네임·이름·연락처 저장 후 새로고침 | 입력값 유지, 공개 리뷰에는 닉네임만 표시 | 성공 | iPhone 마이페이지·내 리뷰 확인 |
| 31 | 사진 리뷰 | 완료 화면에서 사진 1~4장과 리뷰 저장/수정 | 정비소 리뷰와 내 리뷰에 미리보기 표시, 사진 선택 시 확대 | 성공 | 실제 iPhone 사진 업로드·공개 리뷰·확대 확인 |
| 32 | 리뷰 작성자 구분 | 서로 다른 두 계정 리뷰 확인 | 각 닉네임과 생성형 프로필 표시, 이메일·차량번호 미표시 | 대기 |  |
| 33 | 전체 리뷰 탐색 | `/partner/:id/reviews` 평점 분포·사진 필터·정렬·사진 선택 | 평균/분포와 사진 리뷰가 표시되고 필터·정렬·화면 내 확대가 동작하며 가로 넘침 없음 | 자동 검증 성공 | 강남 셀프정비소 예시 사진 리뷰 2건으로 모바일 확인 |
| 34 | 공개 이미지 슬라이드·주소 복사 | 전체 리뷰/정비소 상세/마이페이지 사진 확대, 정비소 주소 copy 선택 | 여러 사진은 좌우 버튼과 방향키로 순환, 단일 사진은 이동 버튼 미표시, 주소는 클립보드 복사 후 완료 상태 표시 | 자동 검증 성공 | 모바일 public 4 passed, 로그인 예약 E2E에서 마이페이지 확대 확인 |
| 35 | Shop 체크인·작업 상태 | Shop 결제 완료 후 정비소 QR/코드 인증, Partner 작업 시작·완료 | User 인증 시 CHECKED_IN, Partner 시작 시 IN_USE, Partner 완료 시 COMPLETED. User에는 상태 조회만 표시 | 성공 | iPhone 수동 코드 체크인 후 `작업 시작 대기 → 정비 진행 중 → 정비 완료` 10초 polling 자동 반영과 완료 내역·영수증 이동 확인 |
| 36 | 차량 선택 overlay | `/partner/:id/work`에서 차량 선택 | 본문만 dim 처리되고 하단 탭은 원래 색상 유지 | 수정 후 재확인 | overlay 하단 경계를 bottom navigation 위로 조정 |

### 7.5 Partner-admin QA

| 순서 | 확인 항목 | 경로 / 행동 | 기대 결과 | 상태 | 비고 / 증상 / 후속 작업 |
| --- | --- | --- | --- | --- | --- |
| 1 | 로그인 | `/partner-admin` | partner-admin 계정으로 접근 가능 | 성공 | 강남 셀프정비소 OWNER 확인, 비로그인은 login next로 이동 |
| 2 | partner scope | partner dropdown 확인 | 허용된 정비소만 표시 | 성공 | 강남 셀프정비소만 표시 |
| 3 | 예약 목록 | 오늘/예정 예약 조회 | 본인 정비소 예약만 표시 | 성공 | 날짜 선택과 row 날짜 확인. 비정각 6건은 과거 `PitNow E2E` 자동 테스트 예약으로 확인 |
| 4 | 예약 상세 modal | 예약 row 클릭 | 예약자와 체크인 4장/체크아웃 2장 및 상태 로그 표시 | 수정 후 재확인 | 배경 닫기 성공. HEIC 화면 내 변환, 파일 없는 테스트 URL 오류 상태와 다운로드 없는 확대 보기 추가 |
| 5 | bay 비활성화 | 예약 없는 active bay 비활성화 | 상태 변경 성공, audit 기록 | 수정 후 재확인 | 잠금 예약 표시 성공. 버퍼가 지난 과거 `CHECKED_IN/IN_USE`가 베이를 잠그지 않도록 보정 |
| 6 | 예약 있는 bay 차단 | active/upcoming 예약 있는 bay 비활성화 시도 | 버튼 disabled 또는 `BAY_HAS_ACTIVE_RESERVATION` | 성공 | disabled 확인 |
| 7 | availability block 생성 | 특정 bay 또는 업장 전체 block 생성 | 생성 성공, 사용자 schedule slot disabled | 성공 | 배포 URL 확인 |
| 8 | availability block 수정 | 시간/사유 수정 | 수정 성공, audit 기록 | 수정 후 재확인 | 날짜 + 정시 선택으로 변경, API도 정각 외 요청 거부 |
| 9 | availability block 해제 | active block 비활성화 | 해제 성공, 사용자 schedule slot 재활성화 | 성공 | 배포 URL 확인 |
| 10 | field note 생성 | `NOTE` 작성 | detail/admin에 표시 | 성공 | 생성 확인 |
| 11 | issue note 생성 | `ISSUE` 작성 | unresolved issue count 반영 | 성공 | 미해결 이슈 1 확인 |
| 12 | delay/no-show note | `DELAY`, `NO_SHOW` 작성 | note type별 저장/표시 | 성공 | 유형별 생성과 미해결 수 반영 확인 |
| 13 | note 해결 | issue resolve | resolved 상태와 resolved metadata 반영 | 성공 | 미해결 수 제거 확인 |
| 14 | note 재오픈 | resolved note reopen | unresolved 상태로 복귀 | 성공 | 재오픈 확인 |
| 15 | package/price 읽기 | 패키지 섹션 확인 | 직접 수정 UI 없이 현재 가격 표시 | 성공 | 가격 및 노출 상태 확인 |
| 16 | 가격 변경 요청 | 희망 가격 + 사유 제출 | request 생성, `/admin/packages`에 표시 | 성공 | Admin 검토 대기 문구 확인 |
| 17 | bay 이용 조건 설정 | 기존 bay에서 허용 차종 복수 선택 + 최대 중량 저장 | 목록 요약 갱신, 새로고침 후 유지, `BAY_COMPATIBILITY_UPDATED` audit 기록 | 성공 | Partner/User 화면 반영 확인 |
| 18 | bay 조건 서버 재검증 | 조건에 맞지 않는 차량으로 결제 준비 시도 | 예약 생성 없이 차종/중량별 오류 코드 반환 | 성공 | 사용자 화면 `차종 미지원` 확인 및 API E2E 통과 |
| 19 | 데스크톱 dashboard shell | 1440px 이상에서 `/partner-admin` 확인 | 고정 사이드바와 상단 바가 겹치지 않고 모바일 bottom nav가 표시되지 않음 | 성공 | 배포 URL 확인 |
| 20 | 섹션 내비게이션 | 베이/패키지·가격/예약 차단/예약 현황 메뉴 선택 | 고정 사이드바에서 해당 섹션 이동, 메뉴 색상은 중립 상태 유지 | 성공 | sidebar 고정 확인. 선택 시 파란 active 색상을 제거 |
| 21 | 신규 패키지 생성 요청 | 패키지 섹션에서 이름/시간/가격/사유 제출 | 승인 대기 카드 표시 후 `/admin/packages` 신규 생성 요청에 표시 | 수정 후 재확인 | 입력 라벨, 5분 단위 소요시간(`60` 포함), 승인 대기 목록과 권한 E2E 통과 |
| 22 | Partner 로그아웃 | sidebar 하단 `로그아웃` | session 제거 후 `/login?next=/partner-admin` 이동 | 성공 | 로그아웃 확인, 사용자 앱 링크와 action 스타일 통일 |
| 23 | 정비소 사진 관리 | 사진 여러 장 등록, 대표 변경, 삭제 | 최대 8장, 대표 1장 유지, 사용자 홈/상세 반영 및 audit 기록 | 자동 검증 성공 | 2장 실제 업로드·대표 변경·삭제·원상복구 |
| 24 | 현장 체크인 인증정보 | QR 표시, 수동 코드 복사, 재발급 | QR/코드 모두 사용자 인증 성공, 재발급 후 기존 값 거부 | 성공 | 기본 카메라 QR은 해당 정비소 상세로 이동하고, Self는 QR·Shop은 수동 코드로 실제 체크인 성공 |
| 25 | Shop 작업 상태 제어 | 체크인된 Shop 예약 상세에서 작업 시작·완료 | Partner만 IN_USE/COMPLETED 전환, 상태 로그와 audit 기록 | 성공 | Partner 작업 시작·완료와 User 10초 polling 상태 반영 확인. User 직접 전환 403 및 Partner audit E2E 통과 |
| 26 | 종료 예약 노쇼 전환 | 종료 시각이 지난 `CONFIRMED` 예약 조회 또는 노쇼 메모 작성 | User/Partner/Admin 모두 `노쇼` 표시, `CONFIRMED → NO_SHOW` SYSTEM/PARTNER 로그 기록, 자동 환불 없음 | 자동 검증 성공·배포 재확인 | migration 적용 및 기존 09:00/12:00 예약 backfill 확인. Partner API E2E에서 SYSTEM/PARTNER 전환 로그 통과 |

### 7.6 Admin QA

| 순서 | 확인 항목 | 경로 / 행동 | 기대 결과 | 상태 | 비고 / 증상 / 후속 작업 |
| --- | --- | --- | --- | --- | --- |
| 1 | Admin login | `/admin-login` | admin token으로 로그인 성공 | 성공 | 배포 URL 확인 |
| 2 | Overview | `/admin` 기간 프리셋 변경 | 오늘/이번 주/이번 달/3개월/6개월/이번 년도별 예약·승인 매출·완료·환불 지표 표시 | 수정 후 재확인 | 한글 지표와 기간 프리셋 추가 |
| 3 | 예약 목록 필터 | `/admin/reservations` 정비소/start date/end date/issue 필터 | 종료일 생략 시 시작일 하루로 조회, 검색 결과 건수 표시 | 수정 후 재확인 | `BLOCKED` 열 제거, 중복 본문 패딩 제거 |
| 4 | 예약 상세 | `/admin/reservations/:id` | 예약자 이름·이메일·전화, payment, evidence, notes, audit 표시 | 성공 | 배포 URL의 문제 예약에서 체크인/체크아웃 HEIC 미리보기와 확대 모달 확인. 다운로드 링크를 사용하지 않음 |
| 5 | Issues badge | unresolved partner note 있는 예약 | 목록 Issues 열에 `미해결 N` 표시 | 성공 | 이슈 필터 포함 확인 |
| 6 | Payments | `/admin/payments` | 결제사 거래의 대기/실패/취소/환불 추적, 예약 상세 이동 | 수정 후 재확인 | 정산 화면과 역할 분리, 한글화 |
| 7 | Settlement | `/admin/settlement` | 체크아웃 금액·추가 결제 미수·증적 완료 표시 | 수정 후 재확인 | 체크아웃 운영 정산 화면으로 한글화 |
| 8 | Partner audit | `/admin/partner-audit` | partner/action/range/search 필터와 사람이 읽는 변경 전후 표시 | 수정 후 재확인 | raw JSON 제거, 한글화 |
| 9 | package tabs/partner filter | `/admin/packages` 탭 및 업장별 판매 | 기능별 탭 전환, 선택 업장의 판매 패키지만 표시 | 수정 후 재확인 | 전역/업장/생성 요청/가격 요청/이력 탭 추가 |
| 10 | package exposure toggle | partner package 노출 버튼 | 활성/비활성을 명확한 버튼으로 변경, hard delete 없음 | 수정 후 재확인 | checkbox 제거 |
| 11 | service package edit | catalog duration `120`, 공임 `12345` 저장 | 브라우저 입력 유효성 오류 없이 원 단위 값을 보존 | 수정 후 재확인 | duration `min=5 step=5`, 가격 `step=1` |
| 12 | change request approve/reject | 처리 전/처리 내역 탭 | 승인 시 가격·audit 반영, 거절 시 가격 미변경 | 수정 후 재확인 | 요청 상태 탭 추가, 승인 E2E 통과 |
| 13 | change request reject | pending request 거절 | 가격 미변경, request rejected | Pass | 이번 수동 QA 제외 |
| 14 | audit logs | `/admin/packages?tab=audit` | 필드별 변경 전 → 변경 후가 한글로 표시됨 | 수정 후 재확인 | raw JSON 제거 |
| 15 | 데스크톱 dashboard shell | 1440px 이상에서 전체 Admin 메뉴 순회 | 고정 사이드바·상단 바·본문이 겹치지 않고 현재 메뉴가 강조됨 | 성공 | 배포 URL 확인 |
| 16 | 운영 화면 밀도 | Overview와 목록/상세 화면 비교 | 지표·필터·표가 과도하게 크지 않고 일관된 본문 여백 사용 | 수정 후 재확인 | 예약 화면의 별도 `p-6` 제거 |
| 17 | 신규 패키지 생성 승인 | `/admin/packages?tab=creation`에서 코드 입력 후 승인 | 전역 카탈로그 생성 + 요청 업장 판매 가격 연결 + audit 기록 | 자동 검증 성공 | `120분`, `12,345원` E2E 통과. 과거 FULFILLED 누락 건 복구 버튼 제공 |

### 7.7 Toss Sandbox QA

| 순서 | 확인 항목 | 결제 경로 | 기대 결과 | 상태 | 비고 / provider order/payment key |
| --- | --- | --- | --- | --- | --- |
| 1 | 예약 카드 결제 | Self 또는 Shop 선결제 | `RESERVATION_CONFIRMED` | 성공 | Safari Sandbox 최소 확인 조합 |
| 2 | 예약 간편결제 | KakaoPay 등 Toss easy-pay | `RESERVATION_CONFIRMED` | 성공 | Safari Sandbox 최소 확인 조합 |
| 3 | 결제 실패/취소 | Toss 창에서 취소 또는 실패 | payment `FAILED` 또는 `CANCELLED` 기록 | 성공 | Safari Sandbox 최소 확인 조합 |
| 4 | 예약 취소 환불 | admin/user 취소 가능 경로 | payment `REFUNDED` 또는 refund pending 상태 확인 | 성공 | Safari Sandbox 최소 확인 조합 |
| 5 | 사후정산 카드 결제 | checkout 후 추가 결제 | `SETTLEMENT_CONFIRMED` | 성공 | Safari Sandbox 최소 확인 조합 |
| 6 | 사후정산 간편결제 | checkout 후 easy-pay | `SETTLEMENT_CONFIRMED` | 대기 |  |

### 7.8 Cleanup / Release Gate 기록

| 순서 | 확인 항목 | 기준 | 상태 | 비고 |
| --- | --- | --- | --- | --- |
| 1 | 테스트 예약 cleanup | QA/E2E로 만든 불필요 예약 없음 | 대기 |  |
| 2 | 테스트 notes cleanup | 불필요 partner_reservation_notes 없음 | 대기 |  |
| 3 | 테스트 package requests cleanup | 불필요 pending/rejected request 없음 | 대기 |  |
| 4 | 테스트 audit rows 확인 | audit row는 필요 시 남기되 QA row 식별 가능 | 대기 |  |
| 5 | Storage evidence 확인 | 불필요 사진 파일 cleanup 또는 식별 가능 | 대기 |  |
| 6 | 공개 이미지 운영 정책 | 신고/삭제/저작권·개인정보 대응 담당과 절차 확정 | 대기 | 리뷰 이미지 출시 전 필수 |
| 7 | 공개 Storage 확인 | `partner-images`, `review-images` 파일 제한·공개 범위 확인 | 성공 | schema check 및 실제 public URL 응답 확인 |
| 8 | 실제 체크인 검증 | Self/Shop별 Partner 고정 QR·수동 코드 현장 검증 | 자동 검증 성공·현장 재확인 | 서버 인증, QR/코드, 역할별 상태 전환 E2E 통과 |
| 9 | Production 승격 판단 | 실패/보류 항목 없음 | 대기 |  |
