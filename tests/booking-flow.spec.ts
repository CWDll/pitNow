import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  cleanupConfirmedReservationForE2E,
  ensureE2EUser,
  ensureE2EVehicle,
  getAdminSupabaseForE2E,
  getE2ECredentials,
  getE2EEnv,
  getSelfReservationSeed,
} from "./helpers/supabase-e2e";

function requireAdminSupabaseForE2E() {
  const db = getAdminSupabaseForE2E();

  if (!db) {
    test.skip(true, "Supabase service role env is required for booking flow UI smoke");
    throw new Error("Supabase service role env is required");
  }

  return db;
}

function requireAdminTokenForE2E() {
  const token = getE2EEnv().PITNOW_ADMIN_ACCESS_TOKEN;

  if (!token) {
    test.skip(true, "PITNOW_ADMIN_ACCESS_TOKEN is required for admin drill-down checks");
    throw new Error("PITNOW_ADMIN_ACCESS_TOKEN is required");
  }

  return token;
}

async function mockReservationPhotoUploads(page: Page) {
  await page.route("**/storage/v1/object/reservation-photos/**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "image/jpeg",
        body: testImageFile.buffer,
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        Key: "reservation-photos/e2e/mock.jpg",
      }),
    });
  });
}

const testImageFile = {
  name: "pitnow-e2e-checkin.jpg",
  mimeType: "image/jpeg",
  buffer: Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
  ]),
};

async function verifyAdminDrillDownForE2E(params: {
  browser: Browser;
  baseUrl: string;
  adminToken: string;
  reservationId: string;
  partnerName: string;
}) {
  const adminContext = await params.browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });

  try {
    const adminPage = await adminContext.newPage();
    const detailPath = `/admin/reservations/${params.reservationId}`;
    const detailLink = adminPage.locator(`a[href="${detailPath}"]`);

    await adminPage.goto(`${params.baseUrl}/admin-login`);
    await adminPage.getByLabel("Admin token").fill(params.adminToken);
    await Promise.all([
      adminPage.waitForURL((url) => url.pathname === "/admin"),
      adminPage.getByRole("button", { name: "Admin 열기" }).click(),
    ]);

    await adminPage.goto(`${params.baseUrl}${detailPath}`);
    await expect(
      adminPage.getByRole("heading", { name: "예약 및 증적 확인" }),
    ).toBeVisible();
    await expect(adminPage.getByText(params.reservationId)).toBeVisible();
    await expect(adminPage.getByText("COMPLETED").first()).toBeVisible();
    await expect(adminPage.getByText("증적 완료")).toBeVisible();
    await expect(adminPage.getByText(params.partnerName).first()).toBeVisible();
    await expect(adminPage.getByRole("heading", { name: "결제 거래 내역" })).toBeVisible();
    await expect(adminPage.getByText("RESERVATION_CONFIRMED")).toBeVisible();
    await expect(adminPage.getByText("SETTLEMENT_CONFIRMED")).toBeVisible();
    await expect(adminPage.getByRole("heading", { name: "체크인 사진" })).toBeVisible();
    await expect(
      adminPage.getByRole("heading", { name: "체크아웃 사진 및 체크리스트" }),
    ).toBeVisible();
    await expect(adminPage.getByText("체크아웃 사진 1")).toBeVisible();
    await expect(adminPage.getByText("체크아웃 사진 2")).toBeVisible();
    await expect(adminPage.getByRole("heading", { name: "Customer Review" })).toBeVisible();
    await expect(adminPage.getByText("E2E 예약 루프 검증 후기입니다.")).toBeVisible();
    await expect(adminPage.getByRole("heading", { name: "Status Timeline" })).toBeVisible();
    await expect(adminPage.getByText(/CONFIRMED.*CHECKED_IN/)).toBeVisible();
    await expect(adminPage.getByText(/CHECKED_IN.*IN_USE/)).toBeVisible();
    await expect(adminPage.getByText(/IN_USE.*COMPLETED/)).toBeVisible();

    await adminPage.goto(`${params.baseUrl}/admin/settlement`);
    await expect(
      adminPage.getByRole("heading", { name: "체크아웃 정산" }),
    ).toBeVisible();
    await expect(detailLink.first()).toBeVisible();

    await adminPage.goto(`${params.baseUrl}/admin/payments`);
    await expect(
      adminPage.getByRole("heading", { name: "결제 거래 원장" }),
    ).toBeVisible();
    const paymentRowsForReservation = adminPage.locator("tbody tr").filter({
      has: adminPage.locator(`a[href="${detailPath}"]`),
    });
    await expect(paymentRowsForReservation).toHaveCount(2);
    await expect(
      paymentRowsForReservation.filter({ hasText: "예약 결제" }),
    ).toHaveCount(1);
    await expect(
      paymentRowsForReservation.filter({ hasText: "추가 정산 결제" }),
    ).toHaveCount(1);
  } finally {
    await adminContext.close();
  }
}

test.describe("booking flow smoke", () => {
  test.setTimeout(90_000);

  test("clicks full reservation loop through receipt and admin drill-down", async ({
    browser,
    page,
  }) => {
    const db = requireAdminSupabaseForE2E();
    const adminToken = requireAdminTokenForE2E();
    let confirmedReservationId: string | null = null;

    try {
      await mockReservationPhotoUploads(page);
      const user = await ensureE2EUser(
        db,
        getE2ECredentials({
          email: "pitnow-e2e-booking-flow@example.com",
        }),
      );
      await ensureE2EVehicle({ db, userId: user.id });
      const seed = await getSelfReservationSeed(db);
      const { data: commonSafetyContents, error: safetyContentError } = await db
        .from("self_safety_contents")
        .select("id,version")
        .eq("scope", "COMMON")
        .eq("is_active", true)
        .eq("is_required", true)
        .returns<Array<{ id: string; version: number }>>();
      if (safetyContentError || !commonSafetyContents?.length) {
        throw (
          safetyContentError ??
          new Error("Required common safety content was not found")
        );
      }
      const { error: safetyCompletionError } = await db
        .from("user_safety_training_completions")
        .upsert(
          commonSafetyContents.map((content) => ({
            user_id: user.id,
            content_id: content.id,
            content_version: content.version,
            completed_at: new Date().toISOString(),
          })),
          { onConflict: "user_id,content_id,content_version" },
        );
      if (safetyCompletionError) {
        throw safetyCompletionError;
      }

      await page.goto("/login?next=/");
      await page.getByLabel("이메일").fill(user.email);
      await page.getByLabel("비밀번호").fill(user.password);
      await page.locator("form").getByRole("button", { name: "로그인" }).click();
      await expect(page).toHaveURL((url) => url.pathname === "/", {
        timeout: 15_000,
      });

      const partnerCard = page.locator("article").filter({
        has: page.getByRole("heading", { name: seed.partnerName }),
      });
      await expect(partnerCard).toBeVisible({ timeout: 15_000 });
      const homeBookingLink = partnerCard.getByRole("link", {
        name: "예약하기",
      });
      await homeBookingLink.scrollIntoViewIfNeeded();
      await Promise.all([
        page.waitForURL(new RegExp(`/partner/${seed.partnerId}$`)),
        homeBookingLink.click(),
      ]);

      const partnerBookingLink = page.getByRole("link", { name: "예약하기" });
      await partnerBookingLink.scrollIntoViewIfNeeded();
      await Promise.all([
        page.waitForURL(new RegExp(`/partner/${seed.partnerId}/work`)),
        partnerBookingLink.click(),
      ]);

      await expect(
        page.getByRole("heading", { name: "예약 방식 선택" }),
      ).toBeVisible();
      await expect(
        page.getByText("정비소 정보를 불러오는 중입니다."),
      ).toBeHidden({ timeout: 15_000 });
      await expect(page.getByText("PitNow E2E (2026)")).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText(seed.taskTitle)).toBeVisible();
      const availableWorkCheckTasks = page
        .locator("button")
        .filter({ hasText: "작업 확인 가산" })
        .filter({ hasNotText: "작업 확인 미제공" });
      const availableWorkCheckTaskCount = await availableWorkCheckTasks.count();

      expect(availableWorkCheckTaskCount).toBeGreaterThan(0);
      for (
        let index = 0;
        index < Math.min(2, availableWorkCheckTaskCount);
        index += 1
      ) {
        const taskButton = availableWorkCheckTasks.nth(index);
        if ((await taskButton.getAttribute("aria-pressed")) !== "true") {
          await taskButton.click();
        }
      }
      await page.getByRole("button", { name: "시간 선택으로 이동" }).click();

      await expect(page).toHaveURL(
        new RegExp(`/partner/${seed.partnerId}/schedule`),
        { timeout: 15_000 },
      );
      await expect(
        page.getByRole("heading", { name: "시간 / 베이 선택" }),
      ).toBeVisible();

      await page.getByRole("button", { name: "›" }).click();
      await page.getByRole("button", { name: "›" }).click();

      const availableTimeButtons = page.locator("button").filter({
        hasText:
          /^(09:00|10:00|11:00|12:00|13:00|14:00|15:00|16:00|17:00|18:00|19:00|20:00)$/,
      });
      const count = await availableTimeButtons.count();
      let selected = false;

      for (let index = 0; index < count; index += 1) {
        const button = availableTimeButtons.nth(index);

        if (await button.isEnabled()) {
          await button.click();
          selected = true;
          break;
        }
      }

      expect(selected).toBe(true);
      await expect(page.getByText(/작업 시간: (?!-)/)).toBeVisible();
      await page
        .getByRole("checkbox", { name: "정비사 작업 확인 신청" })
        .check();
      const workCheckTaskCheckboxes = page.getByRole("checkbox", {
        name: /정비사 작업 확인 대상:/,
      });
      const workCheckTaskCheckboxCount = await workCheckTaskCheckboxes.count();
      expect(workCheckTaskCheckboxCount).toBeGreaterThan(0);
      if (workCheckTaskCheckboxCount > 1) {
        await workCheckTaskCheckboxes.nth(1).uncheck();
      }
      await page.getByRole("button", { name: "안전 동의" }).click();

      await expect(page).toHaveURL(/\/safety\?/);
      await expect(
        page.getByRole("heading", { name: "작업별 안전 확인" }),
      ).toBeVisible();
      const safetyConfirmButtons = page.getByRole("button", {
        name: "안전수칙 확인",
        exact: true,
      });
      await expect(safetyConfirmButtons.nth(0)).toBeVisible({
        timeout: 15_000,
      });
      for (let index = 0; index < 10; index += 1) {
        const remainingSafetyButtons = await safetyConfirmButtons.count();
        if (remainingSafetyButtons === 0) {
          break;
        }
        await safetyConfirmButtons.nth(0).click();
        await expect(safetyConfirmButtons).toHaveCount(
          remainingSafetyButtons - 1,
        );
      }
      await page.getByLabel(/위에서 선택한 작업만 수행/).check();
      await page.getByLabel(/작업별 안전수칙과 선택 작업 한정/).check();
      await page.getByRole("button", { name: "동의하고 결제" }).click();

      await expect(page).toHaveURL(/\/payment\?/);
      await expect(
        page.getByRole("heading", { name: "결제", exact: true }),
      ).toBeVisible();
      await expect(page.getByText("주문 요약")).toBeVisible();
      await expect(page.getByText(seed.partnerName)).toBeVisible();
      await expect(page.getByText("PitNow E2E (2026)")).toBeVisible();
      const payButton = page.getByRole("button", { name: /원 결제하기/ });
      await expect(payButton).toBeVisible();
      await Promise.all([
        page.waitForURL(/\/reservation-complete\?/),
        payButton.click(),
      ]);

      await expect(
        page.getByRole("heading", { name: "예약 완료!" }),
      ).toBeVisible();
      await expect(
        page.getByText("예약 시간에 방문해 현장 체크인을 진행하세요"),
      ).toBeVisible();

      const completeUrl = new URL(page.url());
      confirmedReservationId = completeUrl.searchParams.get("reservationId");
      if (!confirmedReservationId) {
        throw new Error("Reservation complete URL did not include reservationId");
      }
      const e2eReservationId = confirmedReservationId;

      const { data: reservation, error: reservationError } = await db
        .from("reservations")
        .select(
          "id,user_id,partner_id,status,total_price,helper_verify_requested,helper_verify_fee",
        )
        .eq("id", e2eReservationId)
        .single<{
          id: string;
          user_id: string;
          partner_id: string;
          status: string;
          total_price: number | string;
          helper_verify_requested: boolean;
          helper_verify_fee: number | string;
        }>();

      if (reservationError || !reservation) {
        throw reservationError ?? new Error("Confirmed reservation was not found");
      }

      expect(reservation.user_id).toBe(user.id);
      expect(reservation.status).toBe("CONFIRMED");
      expect(Number(reservation.total_price)).toBeGreaterThan(0);
      expect(reservation.helper_verify_requested).toBe(true);
      expect(Number(reservation.helper_verify_fee)).toBeGreaterThanOrEqual(5000);

      const { data: reservationTasks, error: reservationTasksError } = await db
        .from("reservation_tasks")
        .select(
          "id,work_check_unit_fee_snapshot,check_scope_snapshot",
        )
        .eq("reservation_id", e2eReservationId)
        .returns<
          Array<{
            id: string;
            work_check_unit_fee_snapshot: number | string;
            check_scope_snapshot: Array<{
              id: string;
              label: string;
              version: number;
              sortOrder: number;
            }>;
          }>
        >();

      if (reservationTasksError || !reservationTasks?.length) {
        throw (
          reservationTasksError ??
          new Error("Reservation work-check task snapshot was not found")
        );
      }
      const includedWorkCheckTasks = reservationTasks.filter(
        (task) =>
          Number(task.work_check_unit_fee_snapshot) > 0 &&
          task.check_scope_snapshot.length > 0,
      );
      expect(includedWorkCheckTasks).toHaveLength(1);
      if (reservationTasks.length > 1) {
        expect(
          reservationTasks.some(
            (task) =>
              Number(task.work_check_unit_fee_snapshot) === 0 &&
              task.check_scope_snapshot.length === 0,
          ),
        ).toBe(true);
      }

      const { data: pendingWorkCheck, error: pendingWorkCheckError } = await db
        .from("reservation_work_checks")
        .select("status,prepaid_fee")
        .eq("reservation_id", e2eReservationId)
        .single<{ status: string; prepaid_fee: number | string }>();

      if (pendingWorkCheckError || !pendingWorkCheck) {
        throw (
          pendingWorkCheckError ??
          new Error("Pending reservation work check was not found")
        );
      }
      expect(pendingWorkCheck.status).toBe("PENDING");
      expect(Number(pendingWorkCheck.prepaid_fee)).toBe(
        Number(reservation.helper_verify_fee),
      );

      const { data: payment, error: paymentError } = await db
        .from("payments")
        .select("id, reservation_id, payment_purpose, status, amount")
        .eq("reservation_id", e2eReservationId)
        .eq("payment_purpose", "RESERVATION")
        .order("created_at", { ascending: false })
        .limit(1)
        .single<{
          id: string;
          reservation_id: string;
          payment_purpose: string;
          status: string;
          amount: number | string;
        }>();

      if (paymentError || !payment) {
        throw paymentError ?? new Error("Reservation payment was not found");
      }

      expect(payment.reservation_id).toBe(e2eReservationId);
      expect(payment.status).toBe("RESERVATION_CONFIRMED");
      expect(Number(payment.amount)).toBe(Number(reservation.total_price));

      const earlyCheckinResult = await page.evaluate(async (reservationId) => {
        const authStorageKey = Object.keys(localStorage).find((key) =>
          key.endsWith("-auth-token"),
        );
        const storedSession = authStorageKey
          ? (JSON.parse(localStorage.getItem(authStorageKey) ?? "{}") as {
              access_token?: string;
            })
          : null;
        const response = await fetch("/api/checkin", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(storedSession?.access_token
              ? { Authorization: `Bearer ${storedSession.access_token}` }
              : {}),
          },
          body: JSON.stringify({
            reservationId,
            frontImg: "https://example.com/front.jpg",
            rearImg: "https://example.com/rear.jpg",
            leftImg: "https://example.com/left.jpg",
            rightImg: "https://example.com/right.jpg",
          }),
        });

        return { status: response.status, payload: await response.json() };
      }, e2eReservationId);
      expect(earlyCheckinResult.status).toBe(409);
      expect(earlyCheckinResult.payload).toMatchObject({
        error: { code: "CHECKIN_NOT_OPEN" },
      });
      await expect(
        page.getByRole("button", { name: /부터 체크인/ }),
      ).toBeDisabled();

      const checkinStart = new Date(Date.now() + 10 * 60 * 1000);
      const checkinEnd = new Date(checkinStart.getTime() + 60 * 60 * 1000);
      const checkinBlockedUntil = new Date(checkinEnd.getTime() + 60 * 60 * 1000);
      const { error: checkinWindowUpdateError } = await db
        .from("reservations")
        .update({
          start_time: checkinStart.toISOString(),
          end_time: checkinEnd.toISOString(),
          reserved_end_time: checkinEnd.toISOString(),
          blocked_until: checkinBlockedUntil.toISOString(),
        })
        .eq("id", e2eReservationId);

      if (checkinWindowUpdateError) {
        throw checkinWindowUpdateError;
      }
      await page.reload();

      const { data: existingCredential, error: credentialLookupError } = await db
        .from("partner_checkin_credentials")
        .select("manual_code")
        .eq("partner_id", reservation.partner_id)
        .maybeSingle<{ manual_code: string }>();

      if (credentialLookupError) {
        throw credentialLookupError;
      }

      let manualCheckinCode = existingCredential?.manual_code ?? "";

      if (!manualCheckinCode) {
        const { data: createdCredential, error: credentialCreateError } = await db
          .from("partner_checkin_credentials")
          .insert({
            partner_id: reservation.partner_id,
            qr_token: `e2e-${crypto.randomUUID()}-${crypto.randomUUID()}`,
            manual_code: "PIT-TEST-CODE",
          })
          .select("manual_code")
          .single<{ manual_code: string }>();

        if (credentialCreateError || !createdCredential) {
          throw (
            credentialCreateError ??
            new Error("Partner check-in credential was not created")
          );
        }

        manualCheckinCode = createdCredential.manual_code;
      }

      const checkinButton = page.getByRole("button", { name: "체크인", exact: true });
      await expect(checkinButton).toBeVisible();
      await Promise.all([
        page.waitForURL(/\/checkin\?/),
        checkinButton.click(),
      ]);

      await expect(page.getByRole("heading", { name: "체크인" })).toBeVisible();
      await expect(page.getByText("CONFIRMED")).toBeVisible();
      await page.getByRole("button", { name: "코드 입력" }).click();
      await page.getByLabel("체크인 코드").fill(manualCheckinCode);
      await page.getByRole("button", { name: "확인", exact: true }).click();
      await expect(page.getByText("정비소 도착 인증 완료")).toBeVisible();

      const photoInputs = page.locator('input[type="file"]');
      await expect(photoInputs).toHaveCount(4);
      for (let index = 0; index < 4; index += 1) {
        await photoInputs.nth(index).setInputFiles(testImageFile);
      }

      await expect(page.getByText("전면 완료")).toBeVisible();
      await expect(page.getByText("후면 완료")).toBeVisible();
      await expect(page.getByText("좌측 완료")).toBeVisible();
      await expect(page.getByText("우측 완료")).toBeVisible();

      const completeCheckinButton = page.getByRole("button", {
        name: "사진 제출하고 체크인 완료",
      });
      await expect(completeCheckinButton).toBeEnabled();
      await Promise.all([
        page.waitForURL(/\/in-use\?/),
        completeCheckinButton.click(),
      ]);

      await expect(page.getByText("이용 중")).toBeVisible();
      await expect(page.getByText("남은 시간")).toBeVisible();

      await expect
        .poll(async () => {
          const { data, error } = await db
            .from("reservations")
            .select("status")
            .eq("id", e2eReservationId)
            .single<{ status: string }>();

          if (error) {
            throw error;
          }

          return data.status;
        })
        .toBe("IN_USE");

      const { data: checkin, error: checkinError } = await db
        .from("checkins")
        .select("id, front_img, rear_img, left_img, right_img")
        .eq("reservation_id", e2eReservationId)
        .single<{
          id: string;
          front_img: string;
          rear_img: string;
          left_img: string;
          right_img: string;
        }>();

      if (checkinError || !checkin) {
        throw checkinError ?? new Error("Check-in evidence was not found");
      }

      expect(checkin.front_img).toContain("/reservation-photos/");
      expect(checkin.rear_img).toContain("/reservation-photos/");
      expect(checkin.left_img).toContain("/reservation-photos/");
      expect(checkin.right_img).toContain("/reservation-photos/");

      const { data: statusLogs, error: statusLogError } = await db
        .from("reservation_status_logs")
        .select("from_status, to_status, reason")
        .eq("reservation_id", e2eReservationId)
        .in("to_status", ["CHECKED_IN", "IN_USE"])
        .order("created_at", { ascending: true })
        .returns<
          Array<{
            from_status: string | null;
            to_status: string;
            reason: string | null;
          }>
        >();

      if (statusLogError) {
        throw statusLogError;
      }

      expect(statusLogs.map((log) => log.to_status)).toEqual([
        "CHECKED_IN",
        "IN_USE",
      ]);

      await page.goto("/guide");
      const activeReservationLink = page.getByRole("link", {
        name: /이용 중인 예약으로 가기/,
      });
      await expect(activeReservationLink).toBeVisible();
      await Promise.all([
        page.waitForURL(/\/in-use\?reservationId=/),
        activeReservationLink.click(),
      ]);
      await expect(page.getByText("이용 중")).toBeVisible();

      const inUseUrl = page.url();
      const overdueEnd = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const overdueStart = new Date(overdueEnd.getTime() - 60 * 60 * 1000);
      const overdueBlockedUntil = new Date(overdueEnd.getTime() + 60 * 60 * 1000);
      const { error: overdueWindowUpdateError } = await db
        .from("reservations")
        .update({
          start_time: overdueStart.toISOString(),
          end_time: overdueEnd.toISOString(),
          reserved_end_time: overdueEnd.toISOString(),
          blocked_until: overdueBlockedUntil.toISOString(),
        })
        .eq("id", e2eReservationId);

      if (overdueWindowUpdateError) {
        throw overdueWindowUpdateError;
      }

      await page.goto("/reservation");
      await expect(
        page.getByRole("button", { name: /진행 중·예정/ }),
      ).toBeVisible({ timeout: 15_000 });
      const activeReservationCard = page
        .locator("article")
        .filter({ hasText: seed.partnerName })
        .filter({ hasText: "이용중" });
      await expect(activeReservationCard).toBeVisible();

      await page.goto(inUseUrl);
      await expect(page.getByText("이용 중")).toBeVisible();
      await expect(page.getByText("초과 이용")).toBeVisible();
      await expect(page.getByText("01:00:00", { exact: true })).toBeVisible();
      await expect(page.getByText("최대 과금 시간 적용")).toBeVisible();
      await expect(page.getByText(/예상 초과요금 \(최대\):/)).toBeVisible();

      const endWorkButton = page.getByRole("button", { name: "작업 종료" });
      await expect(endWorkButton).toBeVisible();
      await Promise.all([
        page.waitForURL(/\/checkout\?/),
        endWorkButton.click(),
      ]);

      await expect(
        page.getByRole("heading", { name: "체크아웃", exact: true }),
      ).toBeVisible();
      await expect(page.getByText("IN_USE")).toBeVisible();
      await page.getByLabel("공구 반납 완료").check();
      await page.getByLabel("베이 청소 완료").check();
      await page.getByLabel("폐유/폐기물 처리 완료").check();

      const checkoutPhotoInputs = page.locator('input[type="file"]');
      await expect(checkoutPhotoInputs).toHaveCount(2);
      for (let index = 0; index < 2; index += 1) {
        await checkoutPhotoInputs.nth(index).setInputFiles(testImageFile);
      }

      await expect(page.getByText("사진1 완료")).toBeVisible();
      await expect(page.getByText("사진2 완료")).toBeVisible();
      await expect(page.getByText("정비사 작업 확인 비용")).toBeVisible();
      await expect(page.getByText("추가 결제비용")).toBeVisible();

      const checkoutButton = page.getByRole("button", {
        name: "체크아웃 및 정산하기",
      });
      await expect(checkoutButton).toBeEnabled();
      await Promise.all([
        page.waitForURL(/\/settlement-payment\?/),
        checkoutButton.click(),
      ]);

      await expect(
        page.getByRole("heading", { name: "추가 정산" }),
      ).toBeVisible();
      await expect(page.getByText("정산 요약")).toBeVisible();

      const settlementPayButton = page.getByRole("button", {
        name: /원 추가 결제하기/,
      });
      await expect(settlementPayButton).toBeEnabled();
      await Promise.all([
        page.waitForURL(/\/complete\?/),
        settlementPayButton.click(),
      ]);

      await expect(page.getByRole("heading", { name: "이용 완료" })).toBeVisible();
      await expect(page.getByText("정비가 마무리되었습니다.")).toBeVisible();
      await expect(page.getByText("추가 정산 결제 완료")).toBeVisible();
      await expect(
        page.getByRole("link", { name: "예약 내역으로 돌아가기" }),
      ).toHaveCount(0);
      await expect(page.getByText("사진", { exact: true })).toBeVisible();
      await expect(page.getByText("0/4")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "사진 추가" }),
      ).toBeVisible();
      await page
        .locator('input[type="file"][accept*="image/jpeg"]')
        .setInputFiles({
          name: "pitnow-e2e-review.jpg",
          mimeType: testImageFile.mimeType,
          buffer: testImageFile.buffer,
        });
      await expect(page.getByText("1/4")).toBeVisible();

      await page.getByLabel("5점 선택").click();
      await page
        .getByPlaceholder("서비스 리뷰를 남겨주세요.")
        .fill("E2E 예약 루프 검증 후기입니다.");
      await page.getByRole("button", { name: "후기 제출" }).click();
      await expect(
        page.getByText("리뷰 저장이 완료되었습니다."),
      ).toBeVisible({ timeout: 15_000 });

      const { data: review, error: reviewError } = await db
        .from("reviews")
        .select("id, rating, comment")
        .eq("reservation_id", e2eReservationId)
        .single<{
          id: string;
          rating: number;
          comment: string | null;
        }>();

      if (reviewError || !review) {
        throw reviewError ?? new Error("Review was not found");
      }

      expect(review.rating).toBe(5);
      expect(review.comment).toBe("E2E 예약 루프 검증 후기입니다.");

      const { data: reviewImage, error: reviewImageError } = await db
        .from("review_images")
        .select("storage_path,sort_order")
        .eq("review_id", review.id)
        .single<{ storage_path: string; sort_order: number }>();

      if (reviewImageError || !reviewImage) {
        throw reviewImageError ?? new Error("Review image was not found");
      }

      expect(reviewImage.sort_order).toBe(0);
      expect(reviewImage.storage_path).toContain(
        `/${e2eReservationId}/`,
      );
      const reviewImagePublicUrl = db.storage
        .from("review-images")
        .getPublicUrl(reviewImage.storage_path).data.publicUrl;
      const reviewImageResponse = await page.request.get(reviewImagePublicUrl);
      expect(reviewImageResponse.ok()).toBe(true);

      const publicReviewPage = await page.context().newPage();
      await publicReviewPage.goto(`/partner/${seed.partnerId}/reviews`);
      await expect(
        publicReviewPage.getByText("E2E 예약 루프 검증 후기입니다."),
      ).toBeVisible();
      const createdReview = publicReviewPage.locator("article").filter({
        hasText: "E2E 예약 루프 검증 후기입니다.",
      });
      await expect(
        createdReview.getByRole("button", {
          name: "리뷰 사진 1 크게 보기",
        }),
      ).toBeVisible();
      await createdReview.getByRole("button", {
        name: "리뷰 사진 1 크게 보기",
      }).click();
      await expect(
        publicReviewPage.getByRole("dialog", {
          name: "리뷰 사진 상세보기",
        }),
      ).toBeVisible();
      await publicReviewPage.close();

      const myPage = await page.context().newPage();
      await myPage.goto("/mypage");
      await expect(
        myPage.getByRole("heading", { name: "내가 남긴 리뷰" }),
      ).toBeVisible();
      const myCreatedReview = myPage.locator("article").filter({
        hasText: "E2E 예약 루프 검증 후기입니다.",
      });
      await myCreatedReview
        .getByRole("button", {
          name: `${seed.partnerName} 리뷰 사진 1 크게 보기`,
        })
        .click();
      await expect(
        myPage.getByRole("dialog", {
          name: `${seed.partnerName} 리뷰 사진 상세보기`,
        }),
      ).toBeVisible();
      await myPage
        .getByRole("button", { name: "내 리뷰 사진 닫기" })
        .click();
      await myPage.close();

      await Promise.all([
        page.waitForURL(/\/receipt\?/),
        page.getByRole("link", { name: "영수증" }).click(),
      ]);

      await expect(
        page.getByRole("heading", { name: "이용 영수증" }),
      ).toBeVisible();
      await expect(page.getByText("PITNOW RECEIPT")).toBeVisible();
      await expect(page.getByText("예약 ID")).toBeVisible();
      await expect(page.getByText(e2eReservationId)).toBeVisible();
      await expect(page.getByText("정산 내역")).toBeVisible();
      await expect(page.getByText("총 결제")).toBeVisible();
      await expect(page.getByRole("link", { name: "다시 예약" })).toHaveAttribute(
        "href",
        `/partner/${seed.partnerId}`,
      );

      await page.goto("/my-car");
      await expect(page.getByText("차량 정보를 불러오는 중입니다.")).toBeHidden({
        timeout: 15_000,
      });
      await expect(page.getByRole("heading", { name: "정비 이력" })).toBeVisible();
      await expect(page.getByText(seed.partnerName).first()).toBeVisible();
      await expect(page.getByText(seed.taskTitle).first()).toBeVisible();
      await page.getByRole("button", { name: "차량 추가" }).click();
      const vehicleTypeSelect = page.getByLabel("차량 종류");
      await expect(vehicleTypeSelect).toBeVisible();
      await vehicleTypeSelect.selectOption({ label: "소형 화물차 (포터 등)" });
      await expect(vehicleTypeSelect).toHaveValue("소형 화물차");
      await page.getByRole("button", { name: "차량 추가 닫기" }).click();

      await page.goto("/reservation");
      await page.getByRole("button", { name: /지난 이용/ }).click();
      const completedReservationLink = page.locator(
        `a[href*="reservationId=${e2eReservationId}"]`,
      );
      await expect(completedReservationLink).toHaveCount(1);
      await Promise.all([
        page.waitForURL(/\/complete\?.*from=reservation/),
        completedReservationLink.click(),
      ]);
      const reservationBackLink = page.getByRole("link", {
        name: "예약 내역으로 돌아가기",
      });
      await expect(reservationBackLink).toBeVisible();
      await Promise.all([
        page.waitForURL((url) => url.pathname === "/reservation"),
        reservationBackLink.click(),
      ]);

      const { data: completedReservation, error: completedReservationError } =
        await db
          .from("reservations")
          .select("status")
          .eq("id", e2eReservationId)
          .single<{ status: string }>();

      if (completedReservationError || !completedReservation) {
        throw (
          completedReservationError ??
          new Error("Completed reservation was not found")
        );
      }

      expect(completedReservation.status).toBe("COMPLETED");

      const { data: checkout, error: checkoutError } = await db
        .from("checkouts")
        .select(
          "id, extra_fee, helper_verify_requested, helper_verify_fee, total_settlement, tool_check_completed, cleaning_completed, waste_disposal_completed, checkout_photo_1, checkout_photo_2",
        )
        .eq("reservation_id", e2eReservationId)
        .single<{
          id: string;
          extra_fee: number | string;
          helper_verify_requested: boolean;
          helper_verify_fee: number | string;
          total_settlement: number | string;
          tool_check_completed: boolean;
          cleaning_completed: boolean;
          waste_disposal_completed: boolean;
          checkout_photo_1: string;
          checkout_photo_2: string;
        }>();

      if (checkoutError || !checkout) {
        throw checkoutError ?? new Error("Checkout evidence was not found");
      }

      expect(checkout.tool_check_completed).toBe(true);
      expect(checkout.cleaning_completed).toBe(true);
      expect(checkout.waste_disposal_completed).toBe(true);
      expect(checkout.checkout_photo_1).toContain("/reservation-photos/");
      expect(checkout.checkout_photo_2).toContain("/reservation-photos/");
      expect(checkout.helper_verify_requested).toBe(true);
      expect(Number(checkout.helper_verify_fee)).toBe(
        Number(reservation.helper_verify_fee),
      );
      const reservationBasePrice =
        Number(reservation.total_price) -
        Number(reservation.helper_verify_fee);
      expect(Number(checkout.extra_fee)).toBe(reservationBasePrice);
      expect(Number(checkout.total_settlement)).toBe(
        Number(reservation.total_price) + reservationBasePrice,
      );

      const { data: settlementPayment, error: settlementPaymentError } =
        await db
          .from("payments")
          .select("id, checkout_id, payment_purpose, status, amount")
          .eq("checkout_id", checkout.id)
          .eq("payment_purpose", "CHECKOUT_SETTLEMENT")
          .order("created_at", { ascending: false })
          .limit(1)
          .single<{
            id: string;
            checkout_id: string;
            payment_purpose: string;
            status: string;
            amount: number | string;
          }>();

      if (settlementPaymentError || !settlementPayment) {
        throw (
          settlementPaymentError ??
          new Error("Settlement payment was not found")
        );
      }

      expect(settlementPayment.checkout_id).toBe(checkout.id);
      expect(settlementPayment.status).toBe("SETTLEMENT_CONFIRMED");
      expect(Number(settlementPayment.amount)).toBe(
        Number(checkout.total_settlement) - Number(reservation.total_price),
      );

      const { data: finalStatusLogs, error: finalStatusLogError } = await db
        .from("reservation_status_logs")
        .select("to_status")
        .eq("reservation_id", e2eReservationId)
        .in("to_status", ["CHECKED_IN", "IN_USE", "COMPLETED"])
        .order("created_at", { ascending: true })
        .returns<Array<{ to_status: string }>>();

      if (finalStatusLogError) {
        throw finalStatusLogError;
      }

      expect(finalStatusLogs.map((log) => log.to_status)).toEqual([
        "CHECKED_IN",
        "IN_USE",
        "COMPLETED",
      ]);

      await verifyAdminDrillDownForE2E({
        browser,
        baseUrl: new URL(page.url()).origin,
        adminToken,
        reservationId: e2eReservationId,
        partnerName: seed.partnerName,
      });
    } finally {
      if (confirmedReservationId) {
        await cleanupConfirmedReservationForE2E({
          db,
          reservationId: confirmedReservationId,
        });
      }
    }
  });
});
