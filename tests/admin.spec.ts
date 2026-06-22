import { expect, test, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";

import {
  cleanupConfirmedReservationForE2E,
  ensureE2EUser,
  ensureE2EVehicle,
  getAdminSupabaseForE2E,
  getSelfReservationSeed,
  signInE2EUserForE2E,
} from "./helpers/supabase-e2e";

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

function requireAdminSupabaseForE2E() {
  const db = getAdminSupabaseForE2E();

  if (!db) {
    test.skip(true, "Supabase service role env is required for admin operation tests");
    throw new Error("Supabase service role env is required");
  }

  return db;
}

function getFutureWindowForAttempt(attempt: number) {
  const start = new Date(Date.now() + (45 * 24 + attempt * 3) * 60 * 60 * 1000);
  start.setUTCMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

async function createConfirmedReservationForAdminE2E(params: {
  request: APIRequestContext;
}) {
  const db = requireAdminSupabaseForE2E();
  const credentials = {
    email: "pitnow-e2e-admin-cancel@example.com",
    password: "PitnowAdminCancelE2e!2026",
  };
  const user = await ensureE2EUser(db, credentials);
  const vehicle = await ensureE2EVehicle({ db, userId: user.id });
  const seed = await getSelfReservationSeed(db);
  const token = await signInE2EUserForE2E(credentials);

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const { startTime, endTime } = getFutureWindowForAttempt(attempt);
    const reservation = {
      reservationType: "SELF_SERVICE",
      bayId: seed.bayId,
      vehicleId: vehicle.id,
      taskIds: [seed.taskCode],
      agreeOnlySelectedTasks: true,
      consentMethod: "CHECKBOX",
      helperVerifyRequested: false,
      startTime,
      endTime,
    };

    const prepareResponse = await params.request.post("/api/payments/prepare", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: {
        method: "CARD",
        reservation,
      },
    });
    const preparePayload = (await prepareResponse.json()) as {
      success?: boolean;
      paymentId?: string;
      providerOrderId?: string;
      amount?: number;
      error?: { code?: string; message?: string };
    };

    if (!prepareResponse.ok()) {
      throw new Error(
        `payment prepare failed: ${JSON.stringify(preparePayload)}`,
      );
    }

    if (
      !preparePayload.paymentId ||
      !preparePayload.providerOrderId ||
      typeof preparePayload.amount !== "number"
    ) {
      throw new Error(`invalid prepare payload: ${JSON.stringify(preparePayload)}`);
    }

    const confirmResponse = await params.request.post("/api/payments/confirm", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: {
        paymentId: preparePayload.paymentId,
        providerOrderId: preparePayload.providerOrderId,
        amount: preparePayload.amount,
      },
    });
    const confirmPayload = (await confirmResponse.json()) as {
      success?: boolean;
      reservationId?: string;
      error?: { code?: string; message?: string };
    };

    if (confirmResponse.ok() && confirmPayload.reservationId) {
      return {
        reservationId: confirmPayload.reservationId,
        paymentId: preparePayload.paymentId,
      };
    }

    if (confirmPayload.error?.code === "RESERVATION_OVERLAP") {
      continue;
    }

    throw new Error(`payment confirm failed: ${JSON.stringify(confirmPayload)}`);
  }

  throw new Error("Could not find an available E2E reservation window");
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

  test("admin cancellation requires explicit confirmation and refunds payment", async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000);

    const db = requireAdminSupabaseForE2E();
    let reservationId: string | null = null;

    try {
      const created = await createConfirmedReservationForAdminE2E({ request });
      reservationId = created.reservationId;

      const missingReasonResponse = await page.request.post(
        `/api/admin/reservations/${reservationId}/cancel`,
        {
          data: {
            reason: "",
          },
        },
      );
      const missingReasonPayload = (await missingReasonResponse.json()) as {
        error?: { code?: string };
      };

      expect(missingReasonResponse.status()).toBe(400);
      expect(missingReasonPayload.error?.code).toBe("CANCEL_REASON_REQUIRED");

      await page.goto(`/admin/reservations/${reservationId}`);
      const cancelButton = page.getByRole("button", { name: "예약 취소 처리" });
      await expect(cancelButton).toBeDisabled();

      await page
        .getByLabel("취소 사유")
        .fill("E2E 관리자 취소 안전장치 검증");
      await expect(cancelButton).toBeDisabled();

      await page.getByLabel(/취소 후 예약 상태/).check();
      await expect(cancelButton).toBeDisabled();

      await page.getByLabel("확인 문구 입력").fill("예약 취소");
      await expect(cancelButton).toBeEnabled();
      await cancelButton.click();

      await expect(
        page.getByText("이 예약은 이미 취소되었습니다."),
      ).toBeVisible();

      const { data: reservation, error: reservationError } = await db
        .from("reservations")
        .select("status")
        .eq("id", reservationId)
        .single<{ status: string }>();

      if (reservationError || !reservation) {
        throw reservationError ?? new Error("Cancelled reservation was not found");
      }

      expect(reservation.status).toBe("CANCELLED");

      const { data: payment, error: paymentError } = await db
        .from("payments")
        .select("status, refunded_at, metadata")
        .eq("reservation_id", reservationId)
        .eq("payment_purpose", "RESERVATION")
        .order("created_at", { ascending: false })
        .limit(1)
        .single<{
          status: string;
          refunded_at: string | null;
          metadata: { refund?: { actorType?: string; reason?: string } } | null;
        }>();

      if (paymentError || !payment) {
        throw paymentError ?? new Error("Refunded payment was not found");
      }

      expect(payment.status).toBe("REFUNDED");
      expect(payment.refunded_at).toEqual(expect.any(String));
      expect(payment.metadata?.refund?.actorType).toBe("ADMIN");
      expect(payment.metadata?.refund?.reason).toBe(
        "E2E 관리자 취소 안전장치 검증",
      );

      const { data: statusLog, error: statusLogError } = await db
        .from("reservation_status_logs")
        .select("from_status, to_status, actor_type, reason, metadata")
        .eq("reservation_id", reservationId)
        .eq("to_status", "CANCELLED")
        .order("created_at", { ascending: false })
        .limit(1)
        .single<{
          from_status: string | null;
          to_status: string;
          actor_type: string;
          reason: string | null;
          metadata: { reason?: string } | null;
        }>();

      if (statusLogError || !statusLog) {
        throw statusLogError ?? new Error("Cancellation status log was not found");
      }

      expect(statusLog.from_status).toBe("CONFIRMED");
      expect(statusLog.to_status).toBe("CANCELLED");
      expect(statusLog.actor_type).toBe("ADMIN");
      expect(statusLog.reason).toBe("admin_cancelled");
      expect(statusLog.metadata?.reason).toBe(
        "E2E 관리자 취소 안전장치 검증",
      );

      await page.goto("/admin/payments?filter=refunded");
      await expect(page.getByRole("heading", { name: "Payment Ledger" })).toBeVisible();
      const refundedPaymentRow = page.locator("tbody tr").filter({
        has: page.locator(`a[href="/admin/reservations/${reservationId}"]`),
      });
      await expect(refundedPaymentRow).toHaveCount(1);
      await expect(refundedPaymentRow.getByText("REFUNDED")).toBeVisible();
      await expect(refundedPaymentRow.getByText("환불 완료")).toBeVisible();

      await page.goto("/admin/reservations");
      const cancelledReservationRow = page.locator("tbody tr").filter({
        has: page.locator(`a[href="/admin/reservations/${reservationId}"]`),
      });
      await expect(cancelledReservationRow).toHaveCount(1);
      await expect(cancelledReservationRow.getByText("CANCELLED")).toBeVisible();
      await expect(cancelledReservationRow.getByText("REFUNDED")).toBeVisible();
    } finally {
      if (reservationId) {
        await cleanupConfirmedReservationForE2E({ db, reservationId });
      }
    }
  });
});
