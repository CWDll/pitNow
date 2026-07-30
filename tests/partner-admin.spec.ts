import { expect, test } from "@playwright/test";

import {
  ensureE2EUser,
  ensureE2EVehicle,
  getAdminSupabaseForE2E,
  getE2ECredentials,
  getSelfReservationSeed,
} from "./helpers/supabase-e2e";
import { getWorkCheckSelection } from "../src/lib/work-check-selection";

test("calculates work-check pricing from eligible selected tasks only", () => {
  const tasks = [
    {
      id: "engine-oil",
      code: "engine-oil",
      name: "엔진오일 교환",
      difficulty: "BEGINNER" as const,
      description: "",
      sortOrder: 1,
      workCheckUnitFee: 2000,
      workCheckEnabled: false,
      checkItems: [{ id: "oil", label: "오일량", sortOrder: 1, version: 1 }],
      safetyContents: [],
    },
    {
      id: "brake-pad",
      code: "brake-pad",
      name: "브레이크 패드 교환",
      difficulty: "INTERMEDIATE" as const,
      description: "",
      sortOrder: 2,
      workCheckUnitFee: 3000,
      workCheckEnabled: true,
      checkItems: [
        { id: "pad", label: "패드 장착 상태", sortOrder: 1, version: 1 },
      ],
      safetyContents: [],
    },
  ];

  const result = getWorkCheckSelection(tasks);

  expect(result.eligibleTasks.map((task) => task.id)).toEqual(["brake-pad"]);
  expect(result.excludedTasks.map((task) => task.id)).toEqual(["engine-oil"]);
  expect(result.fee).toBe(8000);
});

test("calculates work-check pricing from the user's explicit task selection", () => {
  const tasks = [
    {
      id: "engine-oil",
      code: "engine-oil",
      name: "엔진오일 교환",
      difficulty: "BEGINNER" as const,
      description: "",
      sortOrder: 1,
      workCheckUnitFee: 2000,
      workCheckEnabled: true,
      checkItems: [{ id: "oil", label: "오일량", sortOrder: 1, version: 1 }],
      safetyContents: [],
    },
    {
      id: "brake-pad",
      code: "brake-pad",
      name: "브레이크 패드 교환",
      difficulty: "INTERMEDIATE" as const,
      description: "",
      sortOrder: 2,
      workCheckUnitFee: 3000,
      workCheckEnabled: true,
      checkItems: [
        { id: "pad", label: "패드 장착 상태", sortOrder: 1, version: 1 },
      ],
      safetyContents: [],
    },
  ];

  const result = getWorkCheckSelection(tasks, ["brake-pad"]);

  expect(result.eligibleTasks.map((task) => task.id)).toEqual([
    "engine-oil",
    "brake-pad",
  ]);
  expect(result.selectedTasks.map((task) => task.id)).toEqual(["brake-pad"]);
  expect(result.excludedTasks).toEqual([]);
  expect(result.fee).toBe(8000);
});

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
    test.setTimeout(45_000);
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
    let oldFulfilledRequestId = "";
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

      const { data: oldFulfilledRequest, error: oldFulfilledRequestError } =
        await db
          .from("partner_package_creation_requests")
          .insert({
            partner_id: seed.partnerId,
            requested_name: `E2E 오래된 처리 완료 패키지 ${Date.now()}`,
            requested_description: "Old fulfilled request visibility test",
            requested_duration_minutes: 60,
            requested_labor_price: 50000,
            requested_by: user.id,
            status: "FULFILLED",
            reviewed_at: new Date(
              Date.now() - 2 * 24 * 60 * 60 * 1000,
            ).toISOString(),
          })
          .select("id,requested_name")
          .single<{ id: string; requested_name: string }>();

      if (oldFulfilledRequestError || !oldFulfilledRequest) {
        throw (
          oldFulfilledRequestError ??
          new Error("Failed to seed old fulfilled package request")
        );
      }
      oldFulfilledRequestId = oldFulfilledRequest.id;

      const isReservationListResponse = (response: {
        url(): string;
        request(): { method(): string };
      }) =>
        response.url().includes("/api/partner-admin/reservations?") &&
        response.request().method() === "GET";
      const initialReservationResponse = page.waitForResponse(
        isReservationListResponse,
        { timeout: 15_000 },
      );

      await page.goto("/login?next=/partner-admin");
      await page.getByLabel("이메일").fill(user.email);
      await page.getByLabel("비밀번호").fill(user.password);
      await page
        .locator("form")
        .getByRole("button", { name: "로그인" })
        .click();

      await expect(page).toHaveURL(/\/partner-admin/);
      await expect(
        page.locator("header").getByText(seed.partnerName),
      ).toBeVisible({
        timeout: 15_000,
      });
      await initialReservationResponse;
      const pollingReservationResponse = await page.waitForResponse(
        isReservationListResponse,
        { timeout: 15_000 },
      );
      expect(pollingReservationResponse.ok()).toBe(true);
      await expect(
        page.getByRole("heading", { name: "정비소 사진" }),
      ).toBeVisible();
      await expect(page.getByText(/최대 8장 등록/)).toBeVisible();
      const checkinCredentialSection = page.locator(
        "section#checkin-credential",
      );
      await expect(
        checkinCredentialSection.getByRole("heading", {
          name: "현장 체크인 인증",
        }),
      ).toBeVisible();
      await expect(checkinCredentialSection.locator("code")).toHaveText(
        /^PIT-[A-Z0-9]{4}-[A-Z0-9]{4}$/,
        { timeout: 15_000 },
      );
      await expect(
        checkinCredentialSection.locator(
          `img[alt="${seed.partnerName} 체크인 QR"]`,
        ),
      ).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        checkinCredentialSection.getByRole("link", {
          name: "QR 이미지 저장",
        }),
      ).toBeVisible();

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
      uploadedStoragePaths = uploadedImages.map((image) => image.storage_path);

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
        publicPartnerCard.locator(`img[src*="${coverCandidate.storage_path}"]`),
      ).toBeVisible({ timeout: 15_000 });

      await page.goto(`/partner/${seed.partnerId}`);
      await expect(
        page.locator(`img[src*="${coverCandidate.storage_path}"]`),
      ).toBeVisible({ timeout: 15_000 });
      await page
        .locator("button")
        .filter({
          has: page.locator(`img[src*="${coverCandidate.storage_path}"]`),
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
      await expect(
        page.getByText(oldFulfilledRequest.requested_name),
      ).toHaveCount(0);

      const availabilitySection = page.locator("section#availability");
      const alignedControlLocators = [
        ["범위", availabilitySection.getByLabel("범위")],
        ["시작 날짜", availabilitySection.getByLabel("시작 날짜")],
        ["시작 시각", availabilitySection.getByLabel("시작 시각")],
        ["종료 날짜", availabilitySection.getByLabel("종료 날짜")],
        ["종료 시각", availabilitySection.getByLabel("종료 시각")],
        ["사유", availabilitySection.getByLabel("사유")],
        [
          "차단 추가",
          availabilitySection.getByRole("button", { name: "차단 추가" }),
        ],
      ] as const;
      const alignedControls = await Promise.all(
        alignedControlLocators.map(async ([name, locator]) => ({
          name,
          box: await locator.boundingBox(),
        })),
      );
      const controlYPositions = alignedControls.map(({ box }) => {
        if (!box) {
          throw new Error(
            "예약 차단 입력 컨트롤의 위치를 확인하지 못했습니다.",
          );
        }
        return box.y;
      });
      expect(
        Math.max(...controlYPositions) - Math.min(...controlYPositions),
        JSON.stringify(
          alignedControls.map(({ name, box }) => ({ name, y: box?.y })),
        ),
      ).toBeLessThanOrEqual(1);

      const durationInput = page.getByLabel("소요시간(분) 필수");
      await durationInput.fill("60");
      await expect(durationInput).toHaveValue("60");
      expect(
        await durationInput.evaluate((input) =>
          (input as HTMLInputElement).checkValidity(),
        ),
      ).toBe(true);

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

      if (oldFulfilledRequestId) {
        await db
          .from("partner_package_creation_requests")
          .delete()
          .eq("id", oldFulfilledRequestId);
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

  test("records SELF work-check results and exposes them to the customer", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const db = getAdminSupabaseForE2E();

    if (!db) {
      test.skip(true, "Supabase service role env is required");
      return;
    }

    const user = await ensureE2EUser(
      db,
      getE2ECredentials({ email: "pitnow-e2e-work-check@example.com" }),
    );
    const vehicle = await ensureE2EVehicle({ db, userId: user.id });
    const seed = await getSelfReservationSeed(db);
    let membershipCreated = false;
    let reservationId = "";

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

      const { data: task, error: taskError } = await db
        .from("self_maintenance_tasks")
        .select("id,helper_verify_unit_fee")
        .eq("code", seed.taskCode)
        .single<{ id: string; helper_verify_unit_fee: number | string }>();
      if (taskError || !task) {
        throw taskError ?? new Error("SELF task was not found");
      }

      const { data: checkItems, error: checkItemsError } = await db
        .from("self_task_check_items")
        .select("id,label,version,sort_order")
        .eq("task_id", task.id)
        .eq("is_active", true)
        .order("sort_order")
        .returns<
          Array<{
            id: string;
            label: string;
            version: number;
            sort_order: number;
          }>
        >();
      if (checkItemsError || !checkItems?.length) {
        throw checkItemsError ?? new Error("SELF check items were not found");
      }

      const start = new Date();
      start.setUTCMinutes(0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const blockedUntil = new Date(end.getTime() + 60 * 60 * 1000);
      const unitFee = Number(task.helper_verify_unit_fee);
      const prepaidFee = 5000 + unitFee;
      const { data: reservation, error: reservationError } = await db
        .from("reservations")
        .insert({
          user_id: user.id,
          vehicle_id: vehicle.id,
          partner_id: seed.partnerId,
          bay_id: seed.bayId,
          reservation_type: "SELF_SERVICE",
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          reserved_end_time: end.toISOString(),
          blocked_until: blockedUntil.toISOString(),
          duration_minutes: 60,
          selected_task_count: 1,
          helper_verify_requested: true,
          helper_verify_fee: prepaidFee,
          status: "COMPLETED",
          total_price: prepaidFee,
        })
        .select("id")
        .single<{ id: string }>();
      if (reservationError || !reservation) {
        throw (
          reservationError ??
          new Error("Work-check reservation was not created")
        );
      }
      reservationId = reservation.id;

      const scopeSnapshot = checkItems.map((item) => ({
        id: item.id,
        label: item.label,
        version: item.version,
        sortOrder: item.sort_order,
      }));
      const { data: reservationTask, error: reservationTaskError } = await db
        .from("reservation_tasks")
        .insert({
          reservation_id: reservationId,
          task_id: task.id,
          work_check_unit_fee_snapshot: unitFee,
          check_scope_snapshot: scopeSnapshot,
        })
        .select("id")
        .single<{ id: string }>();
      if (reservationTaskError || !reservationTask) {
        throw (
          reservationTaskError ??
          new Error("Work-check reservation task was not created")
        );
      }

      const { error: workCheckError } = await db
        .from("reservation_work_checks")
        .insert({
          reservation_id: reservationId,
          partner_id: seed.partnerId,
          status: "PENDING",
          prepaid_fee: prepaidFee,
        });
      if (workCheckError) {
        throw workCheckError;
      }

      await page.goto("/login?next=/partner-admin");
      await page.getByLabel("이메일").fill(user.email);
      await page.getByLabel("비밀번호").fill(user.password);
      await page
        .locator("form")
        .getByRole("button", { name: "로그인" })
        .click();
      await expect(page).toHaveURL(/\/partner-admin/);

      const reservationRow = page.locator("button").filter({
        hasText: reservationId,
      });
      await expect(reservationRow).toBeVisible({ timeout: 15_000 });
      await reservationRow.click();

      const detailDialog = page.getByRole("dialog", { name: "예약 상세" });
      await expect(
        detailDialog.getByRole("heading", {
          name: "정비사 작업 확인 결과",
        }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(detailDialog.getByText(checkItems[0].label)).toBeVisible();
      await expect(
        detailDialog.getByRole("button", { name: "재확인" }),
      ).toBeDisabled();

      const prematureRecheck = await page.evaluate(
        async ({ id, reservationTaskId, item }) => {
          const storageKey = Object.keys(localStorage).find((key) =>
            key.endsWith("-auth-token"),
          );
          const session = storageKey
            ? (JSON.parse(localStorage.getItem(storageKey) ?? "{}") as {
                access_token?: string;
              })
            : {};
          const response = await fetch(
            `/api/partner-admin/reservations/${id}/work-check`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                ...(session.access_token
                  ? { Authorization: `Bearer ${session.access_token}` }
                  : {}),
              },
              body: JSON.stringify({
                status: "RECORDED",
                summaryNote: "잘못된 선행 재확인",
                results: [
                  {
                    reservationTaskId,
                    checkItemId: item.id,
                    itemLabel: item.label,
                    result: "NO_ISSUE",
                    note: "",
                    checkRound: 2,
                    sortOrder: item.sort_order,
                  },
                ],
              }),
            },
          );
          return { status: response.status, body: await response.json() };
        },
        {
          id: reservationId,
          reservationTaskId: reservationTask.id,
          item: checkItems[0],
        },
      );
      expect(prematureRecheck).toMatchObject({
        status: 409,
        body: { error: { code: "FIRST_CHECK_REQUIRED" } },
      });

      await detailDialog
        .getByLabel("전체 메모")
        .fill("E2E 1차 작업 확인 결과입니다.");
      await detailDialog.getByRole("button", { name: "1차 결과 저장" }).click();
      await expect(
        detailDialog.getByText("1차 작업 확인 결과를 저장했습니다."),
      ).toBeVisible({ timeout: 15_000 });
      await detailDialog.getByRole("button", { name: "재확인" }).click();
      await detailDialog.getByLabel("전체 메모").fill("E2E 재확인 결과입니다.");
      await detailDialog
        .getByRole("button", { name: "재확인 결과 저장" })
        .click();
      await expect(
        detailDialog.getByText("2차 작업 확인 결과를 저장했습니다."),
      ).toBeVisible({ timeout: 15_000 });

      const customerPayload = await page.evaluate(async (id) => {
        const storageKey = Object.keys(localStorage).find((key) =>
          key.endsWith("-auth-token"),
        );
        const session = storageKey
          ? (JSON.parse(localStorage.getItem(storageKey) ?? "{}") as {
              access_token?: string;
            })
          : {};
        const response = await fetch(`/api/reservations/${id}`, {
          headers: session.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        });
        return {
          status: response.status,
          body: await response.json(),
        };
      }, reservationId);

      expect(customerPayload.status).toBe(200);
      expect(customerPayload.body.workCheck).toMatchObject({
        status: "RECORDED",
        summaryNote: "E2E 재확인 결과입니다.",
      });
      expect(customerPayload.body.workCheck.results).toHaveLength(
        checkItems.length * 2,
      );
      expect(
        customerPayload.body.workCheck.results.filter(
          (result: { result: string; checkRound: number }) =>
            result.result === "NO_ISSUE" && result.checkRound === 1,
        ),
      ).toHaveLength(checkItems.length);
      expect(
        customerPayload.body.workCheck.results.filter(
          (result: { result: string; checkRound: number }) =>
            result.result === "NO_ISSUE" && result.checkRound === 2,
        ),
      ).toHaveLength(checkItems.length);
    } finally {
      if (reservationId) {
        await db.from("reservations").delete().eq("id", reservationId);
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
