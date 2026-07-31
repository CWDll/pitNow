import { expect, test } from "@playwright/test";

import {
  calculateConfirmedReservationRefundAmount,
  reservationCancellationPolicy,
} from "@/src/domain/cancellation-policy";

test("confirmed reservation refund policy returns the full payment amount", () => {
  expect(calculateConfirmedReservationRefundAmount(22000)).toBe(22000);
  expect(calculateConfirmedReservationRefundAmount("15000")).toBe(15000);
  expect(calculateConfirmedReservationRefundAmount("invalid")).toBe(0);
  expect(reservationCancellationPolicy).toContain(
    "체크인 전 예약 취소 시 결제 금액 전액 환불",
  );
});

test.describe("mobile public smoke", () => {
  test("home, login, and auth-required user pages render on mobile", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /PitNow/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "거리" })).toBeVisible();
    await expect(page.getByRole("button", { name: "가격" })).toBeVisible();
    await expect(page.getByRole("button", { name: "평점" })).toBeVisible();
    await expect(page.getByRole("link", { name: "예약하기" }).first()).toBeVisible();
    await expect(page.getByRole("navigation")).toContainText("예약");

    const shopModeButton = page.getByRole("button", { name: "Shop 맡기기" });
    await shopModeButton.click();
    await expect(shopModeButton).toHaveAttribute("aria-pressed", "true");

    await page.goto("/guide");
    await expect(page.getByRole("heading", { name: "이용 가이드" })).toBeVisible();
    await expect(page.getByText("체크인 사진 4장")).toBeVisible();

    await page.goto("/legal");
    await expect(
      page.getByRole("heading", { name: "사업자 정보 및 정책", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("통신판매중개자 고지")).toBeVisible();
    await expect(page.getByText("개인정보 처리 안내")).toBeVisible();
    await expect(page.getByText("취소·환불 및 노쇼")).toBeVisible();
    await expect(
      page.getByText(/체크인 전 예약 확정 상태에서는.*전액 환불합니다/),
    ).toBeVisible();

    await page.goto("/payment");
    await expect(
      page.getByText("체크인 전 예약 취소 시 결제 금액 전액 환불"),
    ).toBeVisible();
    await expect(page.getByText(/24시간 전 전액 환불/)).toHaveCount(0);

    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "정비 루프를 이어가려면 로그인해 주세요" }),
    ).toBeVisible();
    await expect(page.getByLabel("이메일")).toBeVisible();
    await expect(page.getByLabel("비밀번호")).toBeVisible();

    await page.goto("/my-car");
    await expect(page.getByText("로그인이 필요합니다")).toBeVisible();
    await expect(page.getByRole("link", { name: "로그인하러 가기" })).toBeVisible();

    await page.goto("/reservation");
    await expect(
      page.getByText("내 예약 내역은 로그인 후 확인할 수 있습니다."),
    ).toBeVisible();
  });

  test("payment failure pages show recovery path", async ({ page }) => {
    await page.goto("/payment/fail");
    await expect(
      page.getByRole("heading", { name: "결제가 완료되지 않았습니다" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "예약 내역으로 이동" })).toBeVisible();

    await page.goto("/settlement-payment/fail");
    await expect(
      page.getByRole("heading", { name: "추가 정산 결제가 완료되지 않았습니다" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "예약 내역으로 이동" })).toBeVisible();
  });

  test("shop booking shows its package schedule and gates early check-in", async ({
    page,
  }) => {
    const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    startTime.setUTCMinutes(0, 0, 0);
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
    const query = new URLSearchParams({
      reservationType: "SHOP_SERVICE",
      bookingMode: "PACKAGE",
      garageName: "강남 셀프정비소",
      carLabel: "현대 아반떼 CV7 (2020) · 32조 1234",
      packageTitle: "엔진오일 패키지",
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    });

    await page.goto(`/in-use?${query.toString()}`);

    await expect(
      page.getByRole("heading", { name: "엔진오일 패키지" }),
    ).toBeVisible();
    await expect(page.getByText("작업 예정 시간")).toBeVisible();
    await expect(page.getByText("체크인 대기", { exact: true })).toHaveCount(2);
    await expect(page.getByRole("button", { name: /부터 체크인/ })).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "작업 완료 처리" }),
    ).toHaveCount(0);

    await page.goto(`/reservation-complete?${query.toString()}`);
    await expect(
      page.getByText("예약 시간에 방문해 현장 체크인을 진행하세요"),
    ).toBeVisible();
    await expect(page.getByText("QR 코드", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /부터 체크인/ }),
    ).toBeDisabled();
  });

  test("partner reviews provide summary, photo filtering, and image preview", async ({
    page,
  }) => {
    const partnerId = "11111111-1111-1111-1111-111111111111";

    await page.goto(
      `/partner/${partnerId}/reviews`,
    );

    await expect(page.getByRole("heading", { name: "이용 후기" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "정비소 상세로 돌아가기" }),
    ).toHaveAttribute("href", `/partner/${partnerId}`);
    await expect(
      page.getByRole("link", { name: "강남 셀프정비소" }),
    ).toHaveAttribute("href", `/partner/${partnerId}`);
    await expect(page.getByText("사진으로 먼저 보기")).toBeVisible();
    await expect(page.getByRole("button", { name: /^전체 \d+$/ })).toBeVisible();

    const photoFilter = page.getByRole("button", { name: /^사진 \d+$/ });
    await photoFilter.click();
    await expect(photoFilter).toHaveAttribute("aria-pressed", "true");

    await page.getByLabel("리뷰 정렬").selectOption("HIGH_RATING");
    await expect(page.getByLabel("리뷰 정렬")).toHaveValue("HIGH_RATING");

    await page
      .getByRole("button", { name: "사진 후기 1 크게 보기" })
      .click();
    await expect(
      page.getByRole("dialog", { name: "사진 후기 상세보기" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "이전 이미지" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "다음 이미지" }).click();
    await expect(
      page
        .getByRole("dialog", { name: "사진 후기 상세보기" })
        .getByText(/^2 \/ \d+$/),
    ).toBeVisible();
    await page.getByRole("button", { name: "사진 후기 닫기" }).click();
    await expect(
      page.getByRole("dialog", { name: "사진 후기 상세보기" }),
    ).toBeHidden();

    const viewport = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(viewport.scrollWidth).toBe(viewport.clientWidth);
  });

  test("reviews opened from mypage return to mypage", async ({ page }) => {
    const partnerId = "11111111-1111-1111-1111-111111111111";

    await page.goto(`/partner/${partnerId}/reviews?from=mypage`);

    await expect(
      page.getByRole("link", { name: "마이페이지로 돌아가기" }),
    ).toHaveAttribute("href", "/mypage");
    await expect(
      page.getByRole("link", { name: "강남 셀프정비소" }),
    ).toHaveAttribute("href", `/partner/${partnerId}`);
  });

  test("partner detail copies its address and slides gallery images", async ({
    page,
  }) => {
    await page.goto("/partner/11111111-1111-1111-1111-111111111111");

    const copyButton = page.getByRole("button", { name: "주소 복사" });
    await expect(copyButton).toBeVisible();
    await copyButton.click();
    await expect(
      page.getByRole("button", { name: "주소 복사 완료" }),
    ).toBeVisible();

    await page
      .getByRole("button", {
        name: "강남 셀프정비소 사진 1 크게 보기",
      })
      .click();
    const galleryDialog = page.getByRole("dialog", {
      name: "강남 셀프정비소 사진 상세보기",
    });
    await expect(galleryDialog).toBeVisible();
    await galleryDialog.getByRole("button", { name: "다음 이미지" }).click();
    await expect(galleryDialog.getByText("2 / 3", { exact: true })).toBeVisible();
    await galleryDialog.getByRole("button", { name: "이전 이미지" }).click();
    await expect(galleryDialog.getByText("1 / 3", { exact: true })).toBeVisible();
    await galleryDialog
      .getByRole("button", { name: "정비소 사진 닫기" })
      .click();
    await expect(galleryDialog).toBeHidden();
  });
});
