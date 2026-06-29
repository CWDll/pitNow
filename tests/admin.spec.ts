import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  cleanupConfirmedReservationForE2E,
  ensureE2EUser,
  ensureE2EVehicle,
  getAdminSupabaseForE2E,
  getSelfReservationSeed,
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

async function loginAdminForE2E(page: Page) {
  const token = requireAdminToken();

  await page.goto("/admin-login");
  await page.getByLabel("Admin token").fill(token);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/admin"),
    page.getByRole("button", { name: "Admin 열기" }).click(),
  ]);
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

async function createConfirmedReservationForAdminE2E() {
  const db = requireAdminSupabaseForE2E();
  const credentials = {
    email: "pitnow-e2e-admin-cancel@example.com",
    password: "PitnowAdminCancelE2e!2026",
  };
  const user = await ensureE2EUser(db, credentials);
  const vehicle = await ensureE2EVehicle({ db, userId: user.id });
  const seed = await getSelfReservationSeed(db);

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const { startTime, endTime } = getFutureWindowForAttempt(attempt);
    const blockedUntil = new Date(
      new Date(endTime).getTime() + 60 * 60 * 1000,
    ).toISOString();
    const amount = 10000;
    const { data: reservation, error: reservationError } = await db
      .from("reservations")
      .insert({
        user_id: user.id,
        vehicle_id: vehicle.id,
        partner_id: seed.partnerId,
        bay_id: seed.bayId,
        reservation_type: "SELF_SERVICE",
        start_time: startTime,
        end_time: endTime,
        reserved_end_time: endTime,
        blocked_until: blockedUntil,
        duration_minutes: 60,
        selected_task_count: 1,
        helper_verify_requested: false,
        helper_verify_fee: 0,
        status: "CONFIRMED",
        total_price: amount,
      })
      .select("id")
      .single<{ id: string }>();

    if (reservation?.id) {
      const providerOrderId = `pitnow_admin_cancel_e2e_${randomUUID()}`;
      const { data: payment, error: paymentError } = await db
        .from("payments")
        .insert({
          user_id: user.id,
          reservation_id: reservation.id,
          payment_purpose: "RESERVATION",
          provider: "FAKE",
          provider_order_id: providerOrderId,
          method: "CARD",
          status: "RESERVATION_CONFIRMED",
          amount,
          currency: "KRW",
          reservation_snapshot: {
            reservationType: "SELF_SERVICE",
            bayId: seed.bayId,
            vehicleId: vehicle.id,
            taskIds: [seed.taskCode],
            agreeOnlySelectedTasks: true,
            consentMethod: "CHECKBOX",
            helperVerifyRequested: false,
            startTime,
            endTime,
            amount,
          },
          metadata: {
            e2e: "admin-cancel",
          },
          approved_at: new Date().toISOString(),
        })
        .select("id")
        .single<{ id: string }>();

      if (paymentError || !payment) {
        await db.from("reservations").delete().eq("id", reservation.id);
        throw paymentError ?? new Error("Failed to create admin E2E payment");
      }

      return {
        reservationId: reservation.id,
        paymentId: payment.id,
        partnerId: seed.partnerId,
      };
    }

    const message = reservationError?.message ?? "";

    if (
      reservationError?.code === "23P01" ||
      message.includes("no_overlap") ||
      message.includes("conflicting key value violates exclusion constraint")
    ) {
      continue;
    }

    throw reservationError ?? new Error("Failed to create admin E2E reservation");
  }

  throw new Error("Could not find an available E2E reservation window");
}

async function createConfirmedReservationRowForAdminIssueE2E() {
  const db = requireAdminSupabaseForE2E();
  const credentials = {
    email: "pitnow-e2e-admin-issues@example.com",
    password: "PitnowAdminIssuesE2e!2026",
  };
  const user = await ensureE2EUser(db, credentials);
  const vehicle = await ensureE2EVehicle({ db, userId: user.id });
  const seed = await getSelfReservationSeed(db);

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const { startTime, endTime } = getFutureWindowForAttempt(attempt + 120);
    const blockedUntil = new Date(
      new Date(endTime).getTime() + 60 * 60 * 1000,
    ).toISOString();
    const { data, error } = await db
      .from("reservations")
      .insert({
        user_id: user.id,
        vehicle_id: vehicle.id,
        partner_id: seed.partnerId,
        bay_id: seed.bayId,
        reservation_type: "SELF_SERVICE",
        start_time: startTime,
        end_time: endTime,
        reserved_end_time: endTime,
        blocked_until: blockedUntil,
        duration_minutes: 60,
        selected_task_count: 1,
        helper_verify_requested: false,
        helper_verify_fee: 0,
        status: "CONFIRMED",
        total_price: 10000,
      })
      .select("id")
      .single<{ id: string }>();

    if (data?.id) {
      return {
        reservationId: data.id,
        partnerId: seed.partnerId,
      };
    }

    const message = error?.message ?? "";

    if (
      error?.code === "23P01" ||
      message.includes("no_overlap") ||
      message.includes("conflicting key value violates exclusion constraint")
    ) {
      continue;
    }

    throw error ?? new Error("Failed to create admin issue E2E reservation");
  }

  throw new Error("Could not create admin issue E2E reservation");
}

async function createPartnerNotesForAdminE2E(params: {
  reservationId: string;
  partnerId: string;
}) {
  const db = requireAdminSupabaseForE2E();
  const runId = String(Date.now());
  const { data, error } = await db
    .from("partner_reservation_notes")
    .insert([
      {
        reservation_id: params.reservationId,
        partner_id: params.partnerId,
        note_type: "ISSUE",
        body: `Admin issue counter E2E open issue ${runId}`,
        is_resolved: false,
      },
      {
        reservation_id: params.reservationId,
        partner_id: params.partnerId,
        note_type: "DELAY",
        body: `Admin issue counter E2E delay ${runId}`,
        is_resolved: false,
      },
      {
        reservation_id: params.reservationId,
        partner_id: params.partnerId,
        note_type: "NO_SHOW",
        body: `Admin issue counter E2E resolved no-show ${runId}`,
        is_resolved: true,
      },
    ])
    .select("id, body, is_resolved")
    .returns<Array<{ id: string; body: string; is_resolved: boolean }>>();

  if (error || !data || data.length !== 3) {
    throw error ?? new Error("Failed to create partner notes for admin E2E");
  }

  return data;
}

async function createPartnerAuditLogsForAdminE2E(params: {
  reservationId: string;
  partnerId: string;
  targetNoteId: string;
}) {
  const db = requireAdminSupabaseForE2E();
  const { data, error } = await db
    .from("partner_admin_audit_logs")
    .insert([
      {
        partner_id: params.partnerId,
        action: "RESERVATION_NOTE_CREATED",
        target_type: "RESERVATION_NOTE",
        target_id: params.targetNoteId,
        reservation_id: params.reservationId,
        before_state: {},
        after_state: {
          isResolved: false,
        },
        metadata: {
          noteType: "ISSUE",
        },
      },
      {
        partner_id: params.partnerId,
        action: "RESERVATION_NOTE_RESOLVED",
        target_type: "RESERVATION_NOTE",
        target_id: params.targetNoteId,
        reservation_id: params.reservationId,
        before_state: {
          isResolved: false,
        },
        after_state: {
          isResolved: true,
        },
        metadata: {
          noteType: "ISSUE",
        },
      },
    ])
    .select("id")
    .returns<Array<{ id: string }>>();

  if (error || !data || data.length !== 2) {
    throw error ?? new Error("Failed to create partner audit logs for admin E2E");
  }

  return data;
}

test.describe("admin smoke", () => {
  test.beforeEach(async ({ page }) => {
    await loginAdminForE2E(page);
  });

  test("protected admin pages render with admin cookie", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Garage Loop Monitor" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Payments" })).toBeVisible();

    await page.goto("/admin/reservations");
    await expect(page.getByRole("heading", { name: "Reservation Monitor" })).toBeVisible();

    await page.goto("/admin/settlement");
    await expect(page.getByRole("heading", { name: "Checkout Settlement" })).toBeVisible();

    await page.goto("/admin/partner-audit");
    await expect(page.getByRole("heading", { name: "Partner Admin Audit" })).toBeVisible();
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
  }) => {
    test.setTimeout(60_000);

    const db = requireAdminSupabaseForE2E();
    let reservationId: string | null = null;

    try {
      const created = await createConfirmedReservationForAdminE2E();
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

  test("admin reservation list and detail surface open partner issues", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    const db = requireAdminSupabaseForE2E();
    let reservationId: string | null = null;
    let noteIds: string[] = [];
    let auditLogIds: string[] = [];
    let targetAuditNoteId: string | null = null;

    try {
      const created = await createConfirmedReservationRowForAdminIssueE2E();
      reservationId = created.reservationId;
      const notes = await createPartnerNotesForAdminE2E({
        reservationId,
        partnerId: created.partnerId,
      });
      noteIds = notes.map((note) => note.id);
      targetAuditNoteId =
        notes.find((note) => !note.is_resolved)?.id ?? notes[0].id;
      if (!targetAuditNoteId) {
        throw new Error("Target audit note id was not created");
      }

      const auditLogs = await createPartnerAuditLogsForAdminE2E({
        reservationId,
        partnerId: created.partnerId,
        targetNoteId: targetAuditNoteId,
      });
      auditLogIds = auditLogs.map((log) => log.id);

      await page.goto("/admin/reservations");
      await expect(
        page.getByRole("link", { name: /^Open issues \(/ }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /^No open issues \(/ }),
      ).toBeVisible();

      const reservationRow = page.locator("tbody tr").filter({
        has: page.locator(`a[href="/admin/reservations/${reservationId}"]`),
      });
      await expect(reservationRow).toHaveCount(1);
      await expect(reservationRow.getByText("Open 2")).toBeVisible();

      await page.getByRole("link", { name: /^Open issues \(/ }).click();
      await expect(page).toHaveURL(/\/admin\/reservations\?filter=open-issues/);
      await expect(reservationRow).toHaveCount(1);
      await expect(reservationRow.getByText("Open 2")).toBeVisible();

      await page.getByRole("link", { name: /^No open issues \(/ }).click();
      await expect(page).toHaveURL(/\/admin\/reservations\?filter=clean/);
      await expect(reservationRow).toHaveCount(0);

      await page.goto(`/admin/reservations/${reservationId}`);
      await expect(
        page.getByRole("heading", { name: "Partner Field Notes" }),
      ).toBeVisible();
      await expect(page.getByText("Open 2")).toBeVisible();
      await expect(
        page.getByText(notes.find((note) => !note.is_resolved)?.body ?? ""),
      ).toBeVisible();
      await expect(
        page.getByText(notes.find((note) => note.is_resolved)?.body ?? ""),
      ).toBeVisible();
      await expect(page.getByText("Resolved", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Partner Admin Audit" }),
      ).toBeVisible();
      await expect(page.getByText("2 logs")).toBeVisible();
      await expect(page.getByText("Reservation Note Created")).toBeVisible();
      await expect(page.getByText("Reservation Note Resolved")).toBeVisible();
      await expect(page.getByText('"noteType": "ISSUE"')).toHaveCount(2);

      await page.goto("/admin/partner-audit");
      await expect(
        page.getByRole("heading", { name: "Partner Admin Audit" }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: /^Notes \(/ })).toBeVisible();
      await expect(
        page.locator("article").filter({ hasText: "Reservation Note Created" }),
      ).toBeVisible();
      await expect(
        page.locator("article").filter({ hasText: "Reservation Note Resolved" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: `Reservation ${reservationId}` }),
      ).toHaveCount(2);
      await expect(page.getByText('"noteType": "ISSUE"')).toHaveCount(2);

      await page.getByRole("link", { name: /^Notes \(/ }).click();
      await expect(page).toHaveURL(/\/admin\/partner-audit\?filter=notes/);
      await expect(
        page.locator("article").filter({ hasText: "Reservation Note Created" }),
      ).toBeVisible();
      await expect(
        page.locator("article").filter({ hasText: "Reservation Note Resolved" }),
      ).toBeVisible();

      await page.goto(
        `/admin/partner-audit?filter=notes&action=RESERVATION_NOTE_RESOLVED&q=${targetAuditNoteId}&limit=25`,
      );
      await expect(
        page.getByRole("heading", { name: "Partner Admin Audit" }),
      ).toBeVisible();
      await expect(
        page.locator("article").filter({ hasText: "Reservation Note Resolved" }),
      ).toBeVisible();
      await expect(
        page.locator("article").filter({ hasText: "Reservation Note Created" }),
      ).toHaveCount(0);
      await expect(page.getByLabel("Search")).toHaveValue(targetAuditNoteId);
      await expect(page.getByLabel("Action")).toHaveValue(
        "RESERVATION_NOTE_RESOLVED",
      );
      await expect(page.getByLabel("Limit")).toHaveValue("25");
      await expect(page.getByText("Database match")).toBeVisible();
    } finally {
      if (auditLogIds.length > 0) {
        const { error } = await db
          .from("partner_admin_audit_logs")
          .delete()
          .in("id", auditLogIds);

        if (error) {
          throw error;
        }
      }

      if (noteIds.length > 0) {
        const { error } = await db
          .from("partner_reservation_notes")
          .delete()
          .in("id", noteIds);

        if (error) {
          throw error;
        }
      }

      if (reservationId) {
        await cleanupConfirmedReservationForE2E({ db, reservationId });
      }
    }
  });
});
