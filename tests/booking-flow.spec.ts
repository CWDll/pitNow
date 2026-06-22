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
    await adminContext.addCookies([
      {
        name: "pitnow_admin_access",
        value: params.adminToken,
        url: params.baseUrl,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    const adminPage = await adminContext.newPage();
    const detailPath = `/admin/reservations/${params.reservationId}`;
    const detailLink = adminPage.locator(`a[href="${detailPath}"]`);

    await adminPage.goto(`${params.baseUrl}${detailPath}`);
    await expect(
      adminPage.getByRole("heading", { name: "Evidence Drill-down" }),
    ).toBeVisible();
    await expect(adminPage.getByText(params.reservationId)).toBeVisible();
    await expect(adminPage.getByText("COMPLETED").first()).toBeVisible();
    await expect(adminPage.getByText("증적 완료")).toBeVisible();
    await expect(adminPage.getByText(params.partnerName).first()).toBeVisible();
    await expect(adminPage.getByRole("heading", { name: "Payment Ledger" })).toBeVisible();
    await expect(adminPage.getByText("RESERVATION_CONFIRMED")).toBeVisible();
    await expect(adminPage.getByText("SETTLEMENT_CONFIRMED")).toBeVisible();
    await expect(adminPage.getByRole("heading", { name: "Check-in Evidence" })).toBeVisible();
    await expect(adminPage.getByRole("heading", { name: "Checkout Evidence" })).toBeVisible();
    await expect(adminPage.getByText("Checkout photo 1")).toBeVisible();
    await expect(adminPage.getByText("Checkout photo 2")).toBeVisible();
    await expect(adminPage.getByRole("heading", { name: "Customer Review" })).toBeVisible();
    await expect(adminPage.getByText("E2E 예약 루프 검증 후기입니다.")).toBeVisible();
    await expect(adminPage.getByRole("heading", { name: "Status Timeline" })).toBeVisible();
    await expect(adminPage.getByText(/CONFIRMED.*CHECKED_IN/)).toBeVisible();
    await expect(adminPage.getByText(/CHECKED_IN.*IN_USE/)).toBeVisible();
    await expect(adminPage.getByText(/IN_USE.*COMPLETED/)).toBeVisible();

    await adminPage.goto(`${params.baseUrl}/admin/settlement`);
    await expect(
      adminPage.getByRole("heading", { name: "Checkout Settlement" }),
    ).toBeVisible();
    await expect(detailLink.first()).toBeVisible();

    await adminPage.goto(`${params.baseUrl}/admin/payments`);
    await expect(adminPage.getByRole("heading", { name: "Payment Ledger" })).toBeVisible();
    const paymentRowsForReservation = adminPage.locator("tbody tr").filter({
      has: adminPage.locator(`a[href="${detailPath}"]`),
    });
    await expect(paymentRowsForReservation).toHaveCount(2);
    await expect(
      paymentRowsForReservation.filter({ hasText: "RESERVATION" }),
    ).toHaveCount(1);
    await expect(
      paymentRowsForReservation.filter({ hasText: "CHECKOUT_SETTLEMENT" }),
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

      await page.goto("/login?next=/");
      await page.getByLabel("이메일").fill(user.email);
      await page.getByLabel("비밀번호").fill(user.password);
      await page.locator("form").getByRole("button", { name: "로그인" }).click();
      await expect(page).toHaveURL((url) => url.pathname === "/");

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
      await page.getByRole("button", { name: "시간 선택으로 이동" }).click();

      await expect(page).toHaveURL(
        new RegExp(`/partner/${seed.partnerId}/schedule`),
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
      await page.getByRole("button", { name: "안전 동의" }).click();

      await expect(page).toHaveURL(/\/safety\?/);
      await expect(
        page.getByRole("heading", { name: "안전 동의" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "탭하여 시청 완료 처리" }).click();
      await page.getByLabel(/위에서 선택한 작업만 수행/).check();
      await page.getByLabel("리프트와 장비 사용 전 주의사항을 숙지합니다.").check();
      await page.getByLabel("화재 위험 작업과 위험물 반입은 하지 않습니다.").check();
      await page.getByLabel("폐유와 폐기물은 지정된 수거함에 처리합니다.").check();
      await page
        .getByLabel("작업 중 발생하는 사고 책임 범위를 확인했습니다.")
        .check();
      await page.getByLabel(/선택 작업 한정 동의 내용을 확인/).check();
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
      await expect(page.getByText("아래 QR 코드로 체크인하세요")).toBeVisible();

      const completeUrl = new URL(page.url());
      confirmedReservationId = completeUrl.searchParams.get("reservationId");
      if (!confirmedReservationId) {
        throw new Error("Reservation complete URL did not include reservationId");
      }
      const e2eReservationId = confirmedReservationId;

      const { data: reservation, error: reservationError } = await db
        .from("reservations")
        .select("id, user_id, status, total_price")
        .eq("id", e2eReservationId)
        .single<{
          id: string;
          user_id: string;
          status: string;
          total_price: number | string;
        }>();

      if (reservationError || !reservation) {
        throw reservationError ?? new Error("Confirmed reservation was not found");
      }

      expect(reservation.user_id).toBe(user.id);
      expect(reservation.status).toBe("CONFIRMED");
      expect(Number(reservation.total_price)).toBeGreaterThan(0);

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

      const checkinButton = page.getByRole("button", { name: "체크인 하러 가기" });
      await expect(checkinButton).toBeVisible();
      await Promise.all([
        page.waitForURL(/\/checkin\?/),
        checkinButton.click(),
      ]);

      await expect(page.getByRole("heading", { name: "체크인" })).toBeVisible();
      await expect(page.getByText("CONFIRMED")).toBeVisible();
      await page.getByRole("button", { name: "탭하여 QR 스캔" }).click();
      await expect(page.getByRole("button", { name: "스캔 완료" })).toBeVisible();

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
        name: "체크인 완료 (타이머 시작)",
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
      await page.getByLabel(/카 마스터 검수 요청/).check();

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

      await page.getByLabel("5점 선택").click();
      await page
        .getByPlaceholder("서비스 리뷰를 남겨주세요.")
        .fill("E2E 예약 루프 검증 후기입니다.");
      await page.getByRole("button", { name: "후기 제출" }).click();
      await expect(page.getByText("리뷰 저장이 완료되었습니다.")).toBeVisible();

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
      expect(Number(checkout.helper_verify_fee)).toBeGreaterThan(0);
      expect(Number(checkout.total_settlement)).toBeGreaterThan(
        Number(reservation.total_price),
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
