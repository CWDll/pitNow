import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function readLocalEnv(name: string): string | undefined {
  const envFile = readFileSync(".env.local", "utf8");
  const line = envFile
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`));

  return line?.slice(name.length + 1).trim();
}

function requireAdminToken(): string {
  const token =
    process.env.PITNOW_ADMIN_ACCESS_TOKEN ??
    readLocalEnv("PITNOW_ADMIN_ACCESS_TOKEN");

  if (!token) {
    test.skip(true, "PITNOW_ADMIN_ACCESS_TOKEN is required for admin smoke tests");
    throw new Error("PITNOW_ADMIN_ACCESS_TOKEN is required");
  }

  return token;
}

test.describe("admin smoke", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    const token = requireAdminToken();

    await context.addCookies([
      {
        name: "pitnow_admin_access",
        value: token,
        url: baseURL ?? "http://localhost:3000",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  });

  test("protected admin pages render with admin cookie", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Garage Loop Monitor" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Payments" })).toBeVisible();

    await page.goto("/admin/reservations");
    await expect(page.getByRole("heading", { name: "Reservation Monitor" })).toBeVisible();

    await page.goto("/admin/settlement");
    await expect(page.getByRole("heading", { name: "Checkout Settlement" })).toBeVisible();
  });

  test("payment ledger filters and safety copy render", async ({ page }) => {
    await page.goto("/admin/payments");
    await expect(page.getByRole("heading", { name: "Payment Ledger" })).toBeVisible();
    await expect(page.getByRole("button", { name: "만료 READY 정리" })).toBeVisible();
    await expect(page.getByText("실제 환불을 확인한 뒤에만")).toBeVisible();

    const filterNames = [
      "READY",
      "Stale READY",
      "FAILED",
      "CANCELLED",
      "REFUNDED",
      "REFUND_PENDING",
    ];

    for (const name of filterNames) {
      await page.getByRole("link", { name: new RegExp(`^${name}`) }).click();
      await expect(page).toHaveURL(new RegExp(`/admin/payments\\?filter=`));
      await expect(page.getByRole("heading", { name: "Payment Ledger" })).toBeVisible();
    }
  });
});
