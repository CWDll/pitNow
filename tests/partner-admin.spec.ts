import { expect, test } from "@playwright/test";

import {
  ensureE2EUser,
  getAdminSupabaseForE2E,
  getE2ECredentials,
  getSelfReservationSeed,
} from "./helpers/supabase-e2e";

test.describe("partner admin dashboard", () => {
  test("renders partner context, request fields, and pending requests", async ({
    page,
  }) => {
    const db = getAdminSupabaseForE2E();

    if (!db) {
      test.skip(true, "Supabase service role env is required");
      return;
    }

    const user = await ensureE2EUser(
      db,
      getE2ECredentials({ email: "pitnow-e2e-partner-ui@example.com" }),
    );
    const seed = await getSelfReservationSeed(db);
    let membershipCreated = false;
    let requestId = "";

    try {
      const { data: existingMembership, error: membershipLookupError } =
        await db
          .from("partner_admins")
          .select("partner_id")
          .eq("partner_id", seed.partnerId)
          .eq("user_id", user.id)
          .maybeSingle<{ partner_id: string }>();

      if (membershipLookupError) {
        throw membershipLookupError;
      }

      if (!existingMembership) {
        const { error } = await db.from("partner_admins").insert({
          partner_id: seed.partnerId,
          user_id: user.id,
          role: "OWNER",
          is_active: true,
        });

        if (error) {
          throw error;
        }
        membershipCreated = true;
      }

      const requestName = `E2E 승인 대기 패키지 ${Date.now()}`;
      const { data: request, error: requestError } = await db
        .from("partner_package_creation_requests")
        .insert({
          partner_id: seed.partnerId,
          requested_name: requestName,
          requested_description: "Partner dashboard pending request test",
          requested_duration_minutes: 60,
          requested_labor_price: 50000,
          requested_by: user.id,
          status: "PENDING",
        })
        .select("id")
        .single<{ id: string }>();

      if (requestError || !request) {
        throw requestError ?? new Error("Failed to seed package request");
      }
      requestId = request.id;

      await page.goto("/login?next=/partner-admin");
      await page.getByLabel("이메일").fill(user.email);
      await page.getByLabel("비밀번호").fill(user.password);
      await page.locator("form").getByRole("button", { name: "로그인" }).click();

      await expect(page).toHaveURL(/\/partner-admin/);
      await expect(page.locator("header").getByText(seed.partnerName)).toBeVisible({
        timeout: 15_000,
      });
      const pendingRequestCard = page
        .getByTestId("package-creation-request")
        .filter({ hasText: requestName });
      await expect(pendingRequestCard).toBeVisible({ timeout: 20_000 });
      await expect(pendingRequestCard.getByText("승인 대기 중")).toBeVisible();

      const durationInput = page.getByLabel("소요시간(분) 필수");
      await durationInput.fill("60");
      await expect(durationInput).toHaveValue("60");
      expect(await durationInput.evaluate((input) => (input as HTMLInputElement).checkValidity())).toBe(true);

      const userAppLink = page.getByRole("link", { name: "사용자 앱 열기" });
      const logoutLink = page.getByRole("link", { name: "로그아웃" });
      const sharedActionClasses = [
        "h-10",
        "w-full",
        "items-center",
        "gap-3",
        "px-3",
        "text-sm",
        "font-semibold",
        "text-slate-600",
      ];
      const userAppClasses = (await userAppLink.getAttribute("class")) ?? "";
      const logoutClasses = (await logoutLink.getAttribute("class")) ?? "";

      for (const className of sharedActionClasses) {
        expect(userAppClasses).toContain(className);
        expect(logoutClasses).toContain(className);
      }
    } finally {
      if (requestId) {
        await db
          .from("partner_package_creation_requests")
          .delete()
          .eq("id", requestId);
      }

      if (membershipCreated) {
        await db
          .from("partner_admins")
          .delete()
          .eq("partner_id", seed.partnerId)
          .eq("user_id", user.id);
      }
    }
  });
});
