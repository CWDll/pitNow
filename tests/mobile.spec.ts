import { expect, test } from "@playwright/test";

test.describe("mobile public smoke", () => {
  test("home, login, and auth-required user pages render on mobile", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /PitNow/i })).toBeVisible();
    await expect(page.getByText("가장 빠른 예약")).toBeVisible();
    await expect(page.getByRole("link", { name: "예약하기" }).first()).toBeVisible();
    await expect(page.getByRole("navigation")).toContainText("예약");

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
});
