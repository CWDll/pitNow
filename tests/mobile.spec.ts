import { expect, test } from "@playwright/test";

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

  test("partner reviews provide summary, photo filtering, and image preview", async ({
    page,
  }) => {
    await page.goto(
      "/partner/11111111-1111-1111-1111-111111111111/reviews",
    );

    await expect(page.getByRole("heading", { name: "이용 후기" })).toBeVisible();
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
});
