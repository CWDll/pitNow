import { expect, test } from "@playwright/test";

import {
  cleanupConfirmedReservationForE2E,
  ensureE2EUser,
  ensureE2EVehicle,
  getAdminSupabaseForE2E,
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

test.describe("booking flow smoke", () => {
  test("clicks home booking path through work, schedule, safety, and payment", async ({
    page,
  }) => {
    const db = requireAdminSupabaseForE2E();
    let confirmedReservationId: string | null = null;

    try {
      const user = await ensureE2EUser(db);
      await ensureE2EVehicle({ db, userId: user.id });
      const seed = await getSelfReservationSeed(db);

      await page.goto("/login?next=/");
      await page.getByLabel("이메일").fill(user.email);
      await page.getByLabel("비밀번호").fill(user.password);
      await page.locator("form").getByRole("button", { name: "로그인" }).click();
      await expect(page).toHaveURL(/\/$/);

      const partnerCard = page.locator("article").filter({
        has: page.getByRole("heading", { name: seed.partnerName }),
      });
      await expect(partnerCard).toBeVisible();
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
      await expect(page.getByText("PitNow E2E (2026)")).toBeVisible();
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
      expect(confirmedReservationId).toBeTruthy();

      const { data: reservation, error: reservationError } = await db
        .from("reservations")
        .select("id, user_id, status, total_price")
        .eq("id", confirmedReservationId)
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
        .eq("reservation_id", confirmedReservationId)
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

      expect(payment.reservation_id).toBe(confirmedReservationId);
      expect(payment.status).toBe("RESERVATION_CONFIRMED");
      expect(Number(payment.amount)).toBe(Number(reservation.total_price));
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
