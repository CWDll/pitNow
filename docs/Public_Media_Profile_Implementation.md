# Public Media and User Profile Implementation

## 1. 범위

2026-07-24 기능 확장에서 다음 공개 콘텐츠와 사용자 정보를 추가했다.

- Partner-admin 정비소 사진 최대 8장 관리
- 홈 대표 사진과 정비소 상세 갤러리
- 리뷰 작성자 닉네임
- 사용자 이름, 연락처, 닉네임 관리
- 리뷰 사진 최대 4장
- 마이페이지 내 리뷰 조회

예약 체크인/체크아웃 증적은 운영 증거 자료이므로 이 공개 콘텐츠 구조와
분리한다.

## 2. 데이터 모델

### user_profiles

- `auth.users.id`와 `user_id`로 1:1 연결한다.
- 공개 가능한 필드는 `nickname`뿐이다.
- `full_name`, `phone`은 본인과 권한 있는 서버 운영 로직만 사용한다.
- Auth 사용자 생성 trigger가 비식별 기본 닉네임을 만든다.
- 기존 Auth 사용자도 migration에서 일괄 backfill한다.
- 삭제된 테스트 사용자 ID를 가진 레거시 리뷰를 보존하기 위해
  `reviews.user_id`에 추가 프로필 외래키를 강제하지 않는다.

### partner_images

- Storage 객체 경로, 정렬 순서, 대표 여부를 DB row로 관리한다.
- `partner_id WHERE is_cover = true` partial unique index로 정비소당 대표 사진을
  최대 1장으로 제한한다.
- 첫 업로드 사진은 자동으로 대표 사진이 된다.
- 대표 사진 삭제 시 남은 사진 중 정렬 순서가 가장 빠른 사진을 대표로 승격한다.

### review_images

- `review_id`에 연결된 Storage 경로와 0~3 정렬 순서를 저장한다.
- 리뷰 삭제 시 `ON DELETE CASCADE`로 이미지 메타데이터 row도 삭제한다.
- API payload와 UI에서 최종 연결 이미지를 최대 4장으로 제한한다.

## 3. Storage 설계

| Bucket | 공개 여부 | 용도 | 제한 |
| --- | --- | --- | --- |
| `partner-images` | public | 정비소 환경·시설·장비 | 이미지당 8MB, JPEG/PNG/WebP |
| `review-images` | public | 사용자가 공개한 리뷰 이미지 | 이미지당 8MB, JPEG/PNG/WebP |
| `reservation-photos` | 별도 증적 흐름 | 체크인·체크아웃 운영 증적 | 공개 미디어와 혼용 금지 |

두 public bucket은 사용자 화면에서 Supabase public URL로 바로 표시한다. 업로드와
삭제는 Storage public 여부와 관계없이 서버 API에서 Auth와 소유권을 확인한 뒤
service role로 수행한다.

## 4. iPhone 이미지 처리

Safari/iPhone에서 선택할 수 있는 HEIC/HEIF는 브라우저와 Chromium 운영
콘솔에서 직접 미리보기되지 않을 수 있다. 기존 증적 처리에 사용하는
`normalizeReservationImage()`를 재사용해 업로드 전에 JPEG `File`로 변환한다.

흐름:

1. 사용자가 file input에서 사진 선택
2. HEIC/HEIF 여부 확인
3. 필요하면 `heic-to`로 JPEG 변환
4. `FormData`로 API 전송
5. API에서 MIME, 크기, 권한 재검증
6. Storage 업로드 후 DB 메타데이터 저장

클라이언트 검증은 UX용이고, 신뢰 경계는 서버 API의 재검증이다.

## 5. API와 권한

### `/api/partner-admin/images`

- `partner_admins` active membership으로 정비소 scope를 검증한다.
- GET, POST, PATCH 대표 변경, DELETE를 지원한다.
- 최대 8장 여부는 업로드 직전 DB count로 다시 확인한다.
- 변경은 `partner_admin_audit_logs`에 `PARTNER_IMAGE` target으로 기록한다.

### `/api/review-images`

- 로그인 사용자와 본인 `COMPLETED` 예약을 확인한다.
- Storage 경로는 `{userId}/{reservationId}/{uuid}.ext` 구조다.
- DELETE는 요청 사용자 ID prefix를 검사하고 Storage와 `review_images` row를
  함께 제거한다.

### `/api/reviews`

- `imagePaths`는 `{userId}/{reservationId}/` prefix만 허용한다.
- 리뷰 저장·수정 시 이미지 경로를 `review_images`와 동기화한다.
- 수정에서 제외된 기존 파일은 Storage에서도 정리한다.
- `GET ?mine=1`은 마이페이지용 정비소 정보와 이미지 목록을 반환한다.

### `/api/profile`

- 본인 프로필만 조회·수정할 수 있다.
- 닉네임은 2~20자이며 대소문자를 무시하고 중복을 제한한다.
- 이름은 최대 50자, 연락처는 8~20자다.

## 6. 사용자 화면 데이터 흐름

- 홈은 `partner_images.is_cover`를 정비소 카드 모델에 합성한다.
- 대표 사진 변경이 다음 배포까지 캐시되지 않도록 홈 page를
  `force-dynamic`으로 렌더링한다.
- 정비소 상세는 전체 이미지 row를 정렬 순서대로 받아 가로 스크롤 갤러리와
  화면 내 확대 modal로 표시한다.
- 리뷰 공개 조회는 server-side에서 프로필 닉네임만 합성한다. 프로필이 없는
  레거시 리뷰는 user UUID 일부로 만든 기본 닉네임을 사용한다.
- 리뷰 avatar는 개인정보 이미지 대신 user ID hash로 색상을 고정한 아이콘을
  사용한다.
- 마이페이지에서는 프로필 편집과 본인이 작성한 리뷰·사진을 함께 조회한다.

## 7. 자동 검증

`node scripts/check-supabase-schema.mjs`

- 신규 테이블 3개와 bucket 2개 존재 여부 확인

`npm run verify:partner-admin-ui`

- 실제 정비소 사진 2장 업로드
- 대표 사진 변경
- 홈 대표 사진과 상세 갤러리 public URL 확인
- 상세 이미지 modal 확인
- Partner-admin DELETE와 DB row 삭제 확인
- Storage 파일, audit test row, 기존 대표 사진 원상복구

`npm run e2e:ui:fake`

- 예약부터 결제, 체크인, 체크아웃, 정산, 완료까지 진행
- 실제 리뷰 이미지 업로드와 `review_images` 연결 확인
- public Storage URL 응답 확인
- 공개 리뷰 미리보기와 확대 modal 확인
- 예약 cleanup 시 리뷰 Storage 객체도 함께 제거

## 8. 운영 시 주의점

- public bucket 파일은 URL을 아는 사용자가 볼 수 있으므로 개인정보나 차량번호가
  포함된 사진을 공개 리뷰에 올리지 않도록 정책과 신고 절차가 필요하다.
- 부적절한 정비소·리뷰 사진 삭제는 현재 Partner 또는 DB/Storage 운영 권한으로
  처리한다. 정식 출시 전 Admin moderation 화면 또는 신고 처리 절차를 정해야 한다.
- 업로드 성공 직후 브라우저가 강제 종료되면 아직 DB row에 연결되지 않은 파일이
  남을 가능성이 있다. 운영 규모가 커지면 미연결 객체를 정리하는 scheduled job을
  추가한다.
- public 이미지 트래픽과 Storage 사용량을 모니터링하고 필요하면 CDN cache,
  리사이즈 thumbnail, 원본 보관 정책을 도입한다.

## 9. 리뷰 탐색 UI와 예시 미디어

`/partner/:id/reviews`는 단순 카드 목록 대신 다음 탐색 구조를 사용한다.

- 전체 평균과 5~1점 분포를 한 화면에서 비교한다.
- 사진이 있는 리뷰 이미지를 상단 가로 목록에서 먼저 탐색한다.
- 전체/사진 리뷰 필터와 최신순/별점순 정렬을 client state로 처리한다.
- 본문 리뷰는 중첩 카드 대신 구분선 기반 feed로 표시해 작은 화면의 밀도를
  낮춘다.
- 상단 사진과 각 리뷰 사진 모두 화면 내 modal에서 확대하며 다운로드 링크를
  사용하지 않는다.
- `ReviewCard`의 `feed` 변형을 추가해 정비소 상세의 compact 리뷰와 전체 리뷰
  화면이 같은 작성자·별점·사진 표시 로직을 공유한다.
- 전체 리뷰, 정비소 갤러리, 최근 리뷰, 마이페이지 리뷰는 공통
  `ImageLightbox`를 사용한다. 여러 장이면 좌우 버튼과 방향키로 순환하고
  단일 사진이면 불필요한 이동 버튼을 숨긴다.
- 정비소 상세 주소 복사는 server page 전체를 client component로 바꾸지 않고
  `CopyAddressButton`만 client island로 삽입한다. Clipboard API 실패 시에는
  브라우저 호환 fallback을 사용한다.

예시 사진은 실제 업체나 사용자의 자산을 복제하지 않고 생성형 이미지로 제작했다.
사람, 식별 가능한 차량번호, 상표, 워터마크가 나타나지 않도록 한 뒤 JPEG로
축소·압축해 `public/images/sample-media`에 보관한다.

`npm run seed:public-media-examples [partnerId]`는 다음 작업을 반복 실행 가능한
형태로 수행한다.

1. `partner-images` bucket에 정비소 외관·베이·장비 사진을 upsert한다.
2. `partner_images`에 없는 메타데이터만 추가하고 외관 사진을 대표로 지정한다.
3. 최근 리뷰 두 건에 예시 사진을 연결하되 리뷰당 최대 4장 제한을 넘기지 않는다.
4. `review-images`의 sample namespace와 `review_images` row를 storage path로
   중복 검사한다.

홈과 정비소 상세은 DB 메타데이터로 만든 Supabase public URL을 사용한다.
`public/images/sample-media` 원본은 시드 재실행과 개발 이력 보존용이며 사용자
화면은 배포 서버의 정적 경로가 아니라 Storage URL을 표시한다.
