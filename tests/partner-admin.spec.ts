import { expect, test } from "@playwright/test";

import {
  ensureE2EUser,
  getAdminSupabaseForE2E,
  getE2ECredentials,
  getSelfReservationSeed,
} from "./helpers/supabase-e2e";

const testPartnerImage = {
  name: "pitnow-e2e-partner.jpg",
  mimeType: "image/jpeg",
  buffer: Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
  ]),
};

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
    let initialCoverId = "";
    let uploadedImageIds: string[] = [];
    let uploadedStoragePaths: string[] = [];

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

      const { data: initialCover, error: initialCoverError } = await db
        .from("partner_images")
        .select("id")
        .eq("partner_id", seed.partnerId)
        .eq("is_cover", true)
        .maybeSingle<{ id: string }>();

      if (initialCoverError) {
        throw initialCoverError;
      }
      initialCoverId = initialCover?.id ?? "";

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
      await expect(
        page.getByRole("heading", { name: "정비소 사진" }),
      ).toBeVisible();
      await expect(page.getByText(/최대 8장 등록/)).toBeVisible();

      const imageSection = page.locator("section#images");
      const uploadStartedAt = new Date(Date.now() - 1_000).toISOString();
      await imageSection.locator('input[type="file"]').setInputFiles([
        {
          name: `first-${testPartnerImage.name}`,
          mimeType: testPartnerImage.mimeType,
          buffer: testPartnerImage.buffer,
        },
        {
          name: `second-${testPartnerImage.name}`,
          mimeType: testPartnerImage.mimeType,
          buffer: testPartnerImage.buffer,
        },
      ]);
      await expect(
        imageSection.getByText("2장의 정비소 사진을 등록했습니다."),
      ).toBeVisible({ timeout: 20_000 });

      const { data: uploadedImages, error: uploadedImagesError } = await db
        .from("partner_images")
        .select("id,storage_path,sort_order,is_cover")
        .eq("partner_id", seed.partnerId)
        .eq("created_by", user.id)
        .gte("created_at", uploadStartedAt)
        .order("sort_order", { ascending: true })
        .returns<
          Array<{
            id: string;
            storage_path: string;
            sort_order: number;
            is_cover: boolean;
          }>
        >();

      if (uploadedImagesError || uploadedImages?.length !== 2) {
        throw (
          uploadedImagesError ??
          new Error("Expected two uploaded partner images")
        );
      }

      uploadedImageIds = uploadedImages.map((image) => image.id);
      uploadedStoragePaths = uploadedImages.map(
        (image) => image.storage_path,
      );

      const coverCandidate = uploadedImages[1];
      const coverCandidateCard = imageSection
        .locator(`img[src*="${coverCandidate.storage_path}"]`)
        .locator("xpath=ancestor::article");
      await coverCandidateCard
        .getByRole("button", { name: "대표로 지정" })
        .click();
      await expect(
        imageSection.getByText("홈에 표시할 대표 사진을 변경했습니다."),
      ).toBeVisible();

      const { data: selectedCover, error: selectedCoverError } = await db
        .from("partner_images")
        .select("id,is_cover")
        .eq("id", coverCandidate.id)
        .single<{ id: string; is_cover: boolean }>();

      if (selectedCoverError || !selectedCover?.is_cover) {
        throw (
          selectedCoverError ??
          new Error("Uploaded partner image was not selected as cover")
        );
      }

      await page.goto("/");
      const publicPartnerCard = page.locator("article").filter({
        has: page.getByRole("heading", { name: seed.partnerName }),
      });
      await expect(
        publicPartnerCard.locator(
          `img[src*="${coverCandidate.storage_path}"]`,
        ),
      ).toBeVisible({ timeout: 15_000 });

      await page.goto(`/partner/${seed.partnerId}`);
      await expect(
        page.locator(`img[src*="${coverCandidate.storage_path}"]`),
      ).toBeVisible({ timeout: 15_000 });
      await page
        .locator("button")
        .filter({
          has: page.locator(
            `img[src*="${coverCandidate.storage_path}"]`,
          ),
        })
        .click();
      await expect(
        page.getByRole("dialog", {
          name: `${seed.partnerName} 사진 상세보기`,
        }),
      ).toBeVisible();

      await page.goto("/partner-admin");
      await expect(
        page.getByRole("heading", { name: "정비소 사진" }),
      ).toBeVisible({ timeout: 15_000 });
      const reloadedImageSection = page.locator("section#images");
      for (const storagePath of uploadedStoragePaths) {
        const imageCard = reloadedImageSection
          .locator(`img[src*="${storagePath}"]`)
          .locator("xpath=ancestor::article");
        await imageCard.getByTitle("사진 삭제").click();
        await expect(
          reloadedImageSection.locator(`img[src*="${storagePath}"]`),
        ).toHaveCount(0);
      }

      const { count: remainingUploadCount, error: remainingUploadError } =
        await db
          .from("partner_images")
          .select("id", { count: "exact", head: true })
          .in("id", uploadedImageIds);

      if (remainingUploadError) {
        throw remainingUploadError;
      }
      expect(remainingUploadCount).toBe(0);

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
      if (uploadedStoragePaths.length > 0) {
        await db.storage.from("partner-images").remove(uploadedStoragePaths);
      }

      if (uploadedImageIds.length > 0) {
        await db.from("partner_images").delete().in("id", uploadedImageIds);
        await db
          .from("partner_admin_audit_logs")
          .delete()
          .in("target_id", uploadedImageIds);
      }

      if (initialCoverId) {
        await db
          .from("partner_images")
          .update({ is_cover: false })
          .eq("partner_id", seed.partnerId);
        await db
          .from("partner_images")
          .update({ is_cover: true })
          .eq("id", initialCoverId);
      }

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
