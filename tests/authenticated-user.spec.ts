import { expect, test } from "@playwright/test";

import {
  cancelPaymentForE2E,
  ensureE2EUser,
  ensureE2EVehicle,
  getAdminSupabaseForE2E,
  getFutureReservationWindow,
  getSelfReservationSeed,
} from "./helpers/supabase-e2e";

function requireAdminSupabaseForE2E() {
  const db = getAdminSupabaseForE2E();

  if (!db) {
    test.skip(true, "Supabase service role env is required for authenticated UI smoke");
    throw new Error("Supabase service role env is required");
  }

  return db;
}

test.describe("authenticated user smoke", () => {
  test("logs in, reads account-owned vehicle, and prepares a payment", async ({
    page,
  }) => {
    const db = requireAdminSupabaseForE2E();

    const user = await ensureE2EUser(db);
    const vehicle = await ensureE2EVehicle({ db, userId: user.id });
    const seed = await getSelfReservationSeed(db);
    const { startTime, endTime } = getFutureReservationWindow();

    await page.goto("/login?next=/my-car");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.locator("form").getByRole("button", { name: "로그인" }).click();

    await expect(page).toHaveURL(/\/my-car/);
    await expect(page.getByText("대표 차량")).toBeVisible();
    await expect(page.getByText("E2E 2026").first()).toBeVisible();
    await expect(page.getByText("PitNow E2E (2026)").first()).toBeVisible();

    await page.goto("/reservation");
    await expect(
      page.getByText("내 예약 내역은 로그인 후 확인할 수 있습니다."),
    ).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "예약" })).toBeVisible();

    const prepareResult = await page.evaluate(
      async ({ bayId, vehicleId, taskCode, startTimeValue, endTimeValue }) => {
        const authToken = Object.values(window.localStorage)
          .map((rawValue) => {
            try {
              return JSON.parse(rawValue);
            } catch {
              return null;
            }
          })
          .find(
            (value): value is { access_token: string } =>
              Boolean(value) &&
              typeof value === "object" &&
              "access_token" in value &&
              typeof value.access_token === "string",
          )?.access_token;

        if (!authToken) {
          throw new Error("Missing Supabase access token in browser storage");
        }

        const response = await fetch("/api/payments/prepare", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            method: "CARD",
            reservation: {
              reservationType: "SELF_SERVICE",
              bayId,
              vehicleId,
              taskIds: [taskCode],
              agreeOnlySelectedTasks: true,
              consentMethod: "CHECKBOX",
              helperVerifyRequested: false,
              startTime: startTimeValue,
              endTime: endTimeValue,
            },
          }),
        });

        const payload = await response.json();

        return {
          status: response.status,
          payload,
        };
      },
      {
        bayId: seed.bayId,
        vehicleId: vehicle.id,
        taskCode: seed.taskCode,
        startTimeValue: startTime,
        endTimeValue: endTime,
      },
    );

    expect(prepareResult.status).toBe(200);
    expect(prepareResult.payload.success).toBe(true);
    expect(prepareResult.payload.paymentId).toEqual(expect.any(String));
    expect(prepareResult.payload.amount).toBeGreaterThan(0);

    await cancelPaymentForE2E({
      db,
      paymentId: prepareResult.payload.paymentId,
    });
  });
});
