import { hasSupabaseServiceRoleEnv, supabaseAdmin } from "@/src/lib/supabase";
import { formatKstAdminDateTime } from "@/src/lib/timezone";

export type AdminReservationStatus =
  | "CONFIRMED"
  | "CHECKED_IN"
  | "IN_USE"
  | "COMPLETED"
  | "CANCELLED";

export type AdminReservationType = "SELF_SERVICE" | "SHOP_SERVICE";

export interface AdminReservationRow {
  id: string;
  partner_id: string;
  bay_id: string | null;
  vehicle_id?: string | null;
  reservation_type: AdminReservationType;
  package_id: string | null;
  start_time: string;
  end_time: string;
  blocked_until: string | null;
  status: AdminReservationStatus;
  total_price: number | string;
  helper_verify_requested: boolean;
  helper_verify_fee: number | string;
  created_at: string;
}

export interface AdminCheckoutRow {
  id?: string;
  reservation_id: string;
  base_price: number | string;
  extra_fee: number | string;
  helper_verify_requested: boolean;
  helper_verify_fee: number | string;
  total_settlement: number | string;
  tool_check_completed: boolean;
  cleaning_completed: boolean;
  waste_disposal_completed: boolean;
  checkout_photo_1?: string | null;
  checkout_photo_2?: string | null;
  completed_at: string;
}

interface PartnerRow {
  id: string;
  name: string;
}

interface BayRow {
  id: string;
  name: string;
}

interface VehicleRow {
  id: string;
  plate_number: string;
  model: string;
  year: number;
}

interface AdminCheckinRow {
  reservation_id: string;
  front_img: string;
  rear_img: string;
  left_img: string;
  right_img: string;
  checked_in_at: string;
}

interface AdminStatusLogRow {
  id: string;
  reservation_id: string;
  from_status: AdminReservationStatus | null;
  to_status: AdminReservationStatus;
  actor_type: "SYSTEM" | "USER" | "PARTNER" | "ADMIN";
  actor_user_id?: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface AdminReviewRow {
  id: string;
  reservation_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

interface AdminPaymentRow {
  id: string;
  reservation_id: string | null;
  checkout_id: string | null;
  payment_purpose: "RESERVATION" | "CHECKOUT_SETTLEMENT";
  provider: "FAKE" | "TOSS";
  method: string;
  status: string;
  amount: number | string;
  approved_at: string | null;
  created_at: string;
}

type AdminPartnerNoteType = "NOTE" | "ISSUE" | "DELAY" | "NO_SHOW";

interface AdminPartnerNoteRow {
  id: string;
  reservation_id: string;
  partner_id: string;
  author_user_id: string | null;
  note_type: AdminPartnerNoteType;
  body: string;
  is_resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

interface PartnerPackagePriceRow {
  partner_id: string;
  labor_price: number | string;
  is_active: boolean;
  partners:
    | { name: string }
    | Array<{ name: string }>
    | null;
  service_packages:
    | {
        name: string;
        duration_minutes: number;
        is_active: boolean;
      }
    | Array<{
        name: string;
        duration_minutes: number;
        is_active: boolean;
      }>
    | null;
}

export interface AdminReservationItem {
  id: string;
  partnerName: string;
  bayName: string;
  vehicleLabel: string;
  reservationType: AdminReservationType;
  packageId: string | null;
  startTime: string;
  endTime: string;
  blockedUntil: string | null;
  status: AdminReservationStatus;
  totalPrice: number;
  helperVerifyRequested: boolean;
  helperVerifyFee: number;
  reservationPaymentStatus: string | null;
  reservationRefundedAt: string | null;
  openPartnerNoteCount: number;
  createdAt: string;
}

export interface AdminSettlementItem {
  reservationId: string;
  partnerName: string;
  reservationType: AdminReservationType;
  status: AdminReservationStatus;
  reservationPaidAmount: number;
  settlementAmountDue: number;
  settlementPaymentStatus: string | null;
  settlementPaidAmount: number;
  basePrice: number;
  extraFee: number;
  helperVerifyRequested: boolean;
  helperVerifyFee: number;
  totalSettlement: number;
  evidenceComplete: boolean;
  completedAt: string;
}

export interface AdminPaymentItem {
  id: string;
  reservationId: string | null;
  checkoutId: string | null;
  purpose: "RESERVATION" | "CHECKOUT_SETTLEMENT";
  provider: "FAKE" | "TOSS";
  method: string;
  status: string;
  amount: number;
  approvedAt: string | null;
  refundedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPackageItem {
  partnerName: string;
  packageName: string;
  durationMinutes: number;
  laborPrice: number;
  isActive: boolean;
}

export interface AdminReservationDetail {
  reservation: AdminReservationItem;
  checkin: {
    frontImg: string;
    rearImg: string;
    leftImg: string;
    rightImg: string;
    checkedInAt: string;
  } | null;
  checkout: {
    id: string;
    basePrice: number;
    extraFee: number;
    helperVerifyRequested: boolean;
    helperVerifyFee: number;
    totalSettlement: number;
    toolCheckCompleted: boolean;
    cleaningCompleted: boolean;
    wasteDisposalCompleted: boolean;
    checkoutPhoto1: string | null;
    checkoutPhoto2: string | null;
    completedAt: string;
  } | null;
  payments: Array<{
    id: string;
    purpose: "RESERVATION" | "CHECKOUT_SETTLEMENT";
    provider: "FAKE" | "TOSS";
    method: string;
    status: string;
    amount: number;
    approvedAt: string | null;
    createdAt: string;
  }>;
  partnerNotes: Array<{
    id: string;
    noteType: AdminPartnerNoteType;
    body: string;
    isResolved: boolean;
    authorUserId: string | null;
    resolvedAt: string | null;
    resolvedBy: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  statusLogs: Array<{
    id: string;
    fromStatus: AdminReservationStatus | null;
    toStatus: AdminReservationStatus;
    actorType: "SYSTEM" | "USER" | "PARTNER" | "ADMIN";
    actorUserId: string | null;
    reason: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
  review: {
    id: string;
    rating: number;
    comment: string | null;
    createdAt: string;
  } | null;
  evidenceIssues: string[];
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstOrSelf<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function latestPaymentForPurpose(
  payments: AdminPaymentRow[],
  purpose: AdminPaymentRow["payment_purpose"],
): AdminPaymentRow | null {
  const candidates = payments.filter(
    (payment) => payment.payment_purpose === purpose,
  );

  return candidates[0] ?? null;
}

function isMissingPartnerNotesSchema(error: { code?: string; message?: string } | null) {
  const message = error?.message ?? "";
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    message.includes("partner_reservation_notes")
  );
}

async function getPartnerMap() {
  if (!supabaseAdmin) {
    return new Map<string, string>();
  }

  const { data, error } = await supabaseAdmin
    .from("partners")
    .select("id, name")
    .returns<PartnerRow[]>();

  if (error) {
    console.error("ADMIN PARTNER LOOKUP ERROR:", error);
    return new Map<string, string>();
  }

  return new Map((data ?? []).map((partner) => [partner.id, partner.name]));
}

async function getBayMap() {
  if (!supabaseAdmin) {
    return new Map<string, string>();
  }

  const { data, error } = await supabaseAdmin
    .from("bays")
    .select("id, name")
    .returns<BayRow[]>();

  if (error) {
    console.error("ADMIN BAY LOOKUP ERROR:", error);
    return new Map<string, string>();
  }

  return new Map((data ?? []).map((bay) => [bay.id, bay.name]));
}

async function getVehicleMap() {
  if (!supabaseAdmin) {
    return new Map<string, string>();
  }

  const { data, error } = await supabaseAdmin
    .from("vehicles")
    .select("id, plate_number, model, year")
    .returns<VehicleRow[]>();

  if (error) {
    console.error("ADMIN VEHICLE LOOKUP ERROR:", error);
    return new Map<string, string>();
  }

  return new Map(
    (data ?? []).map((vehicle) => [
      vehicle.id,
      `${vehicle.model} (${vehicle.year}) · ${vehicle.plate_number}`,
    ]),
  );
}

export async function getAdminReservations(): Promise<AdminReservationItem[]> {
  if (!hasSupabaseServiceRoleEnv || !supabaseAdmin) {
    return [];
  }

  const [partnerMap, bayMap, vehicleMap, reservationResult] = await Promise.all([
    getPartnerMap(),
    getBayMap(),
    getVehicleMap(),
    supabaseAdmin
      .from("reservations")
      .select(
        "id, partner_id, bay_id, vehicle_id, reservation_type, package_id, start_time, end_time, blocked_until, status, total_price, helper_verify_requested, helper_verify_fee, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<AdminReservationRow[]>(),
  ]);

  let reservationRows = reservationResult.data ?? [];

  if (reservationResult.error) {
    const shouldFallback =
      reservationResult.error.code === "PGRST204" ||
      reservationResult.error.code === "42703";

    if (!shouldFallback) {
      console.error("ADMIN RESERVATION LOOKUP ERROR:", reservationResult.error);
      return [];
    }

    const { data, error } = await supabaseAdmin
      .from("reservations")
      .select(
        "id, partner_id, bay_id, reservation_type, package_id, start_time, end_time, blocked_until, status, total_price, helper_verify_requested, helper_verify_fee, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<AdminReservationRow[]>();

    if (error) {
      console.error("ADMIN RESERVATION FALLBACK LOOKUP ERROR:", error);
      return [];
    }

    reservationRows = data ?? [];
  }

  const reservationIds = reservationRows.map((reservation) => reservation.id);
  const paymentResult =
    reservationIds.length > 0
      ? await supabaseAdmin
          .from("payments")
          .select(
            "id, reservation_id, payment_purpose, provider, method, status, amount, approved_at, created_at, refunded_at",
          )
          .eq("payment_purpose", "RESERVATION")
          .in("reservation_id", reservationIds)
          .order("created_at", { ascending: false })
          .returns<
            Array<
              AdminPaymentRow & {
                refunded_at: string | null;
              }
            >
          >()
      : { data: [], error: null };

  if (paymentResult.error) {
    console.error("ADMIN RESERVATION PAYMENT LOOKUP ERROR:", paymentResult.error);
  }

  const partnerNotesResult =
    reservationIds.length > 0
      ? await supabaseAdmin
          .from("partner_reservation_notes")
          .select("reservation_id")
          .in("reservation_id", reservationIds)
          .eq("is_resolved", false)
          .returns<Array<{ reservation_id: string }>>()
      : { data: [], error: null };

  if (partnerNotesResult.error) {
    if (isMissingPartnerNotesSchema(partnerNotesResult.error)) {
      console.warn(
        "ADMIN RESERVATION PARTNER NOTE COUNT SKIPPED: apply db/migrations/20260626_partner_reservation_notes.sql",
      );
    } else {
      console.error(
        "ADMIN RESERVATION PARTNER NOTE COUNT LOOKUP ERROR:",
        partnerNotesResult.error,
      );
    }
  }

  const latestPaymentsByReservationId = new Map<
    string,
    AdminPaymentRow & {
      refunded_at: string | null;
    }
  >();
  const openPartnerNoteCountByReservationId = new Map<string, number>();

  if (!partnerNotesResult.error) {
    for (const note of partnerNotesResult.data ?? []) {
      openPartnerNoteCountByReservationId.set(
        note.reservation_id,
        (openPartnerNoteCountByReservationId.get(note.reservation_id) ?? 0) + 1,
      );
    }
  }

  for (const payment of paymentResult.data ?? []) {
    if (!payment.reservation_id) {
      continue;
    }

    if (!latestPaymentsByReservationId.has(payment.reservation_id)) {
      latestPaymentsByReservationId.set(payment.reservation_id, payment);
    }
  }

  return reservationRows.map((reservation) => {
    const reservationPayment = latestPaymentsByReservationId.get(reservation.id);

    return {
    id: reservation.id,
    partnerName: partnerMap.get(reservation.partner_id) ?? "Unknown partner",
    bayName: reservation.bay_id
      ? bayMap.get(reservation.bay_id) ?? "Unknown bay"
      : "-",
    vehicleLabel: reservation.vehicle_id
      ? vehicleMap.get(reservation.vehicle_id) ?? "Unknown vehicle"
      : "-",
    reservationType: reservation.reservation_type,
    packageId: reservation.package_id,
    startTime: reservation.start_time,
    endTime: reservation.end_time,
    blockedUntil: reservation.blocked_until,
    status: reservation.status,
    totalPrice: toNumber(reservation.total_price),
    helperVerifyRequested: reservation.helper_verify_requested,
    helperVerifyFee: toNumber(reservation.helper_verify_fee),
    reservationPaymentStatus: reservationPayment?.status ?? null,
    reservationRefundedAt: reservationPayment?.refunded_at ?? null,
    openPartnerNoteCount:
      openPartnerNoteCountByReservationId.get(reservation.id) ?? 0,
    createdAt: reservation.created_at,
    };
  });
}

export async function getAdminReservationDetail(
  reservationId: string,
): Promise<AdminReservationDetail | null> {
  if (!hasSupabaseServiceRoleEnv || !supabaseAdmin) {
    return null;
  }

  const [partnerMap, bayMap, vehicleMap, reservationResult] = await Promise.all([
    getPartnerMap(),
    getBayMap(),
    getVehicleMap(),
    supabaseAdmin
      .from("reservations")
      .select(
        "id, partner_id, bay_id, vehicle_id, reservation_type, package_id, start_time, end_time, blocked_until, status, total_price, helper_verify_requested, helper_verify_fee, created_at",
      )
      .eq("id", reservationId)
      .maybeSingle<AdminReservationRow>(),
  ]);

  if (reservationResult.error) {
    console.error("ADMIN RESERVATION DETAIL LOOKUP ERROR:", reservationResult.error);
    return null;
  }

  const reservation = reservationResult.data;

  if (!reservation) {
    return null;
  }

  const [
    checkinResult,
    checkoutResult,
    paymentResult,
    partnerNotesResult,
    statusLogsResult,
    reviewResult,
  ] =
    await Promise.all([
      supabaseAdmin
        .from("checkins")
        .select(
          "reservation_id, front_img, rear_img, left_img, right_img, checked_in_at",
        )
        .eq("reservation_id", reservation.id)
        .maybeSingle<AdminCheckinRow>(),
      supabaseAdmin
        .from("checkouts")
        .select(
          "id, reservation_id, base_price, extra_fee, helper_verify_requested, helper_verify_fee, total_settlement, tool_check_completed, cleaning_completed, waste_disposal_completed, checkout_photo_1, checkout_photo_2, completed_at",
        )
        .eq("reservation_id", reservation.id)
        .maybeSingle<AdminCheckoutRow>(),
      supabaseAdmin
        .from("payments")
        .select(
          "id, reservation_id, checkout_id, payment_purpose, provider, method, status, amount, approved_at, created_at",
        )
        .eq("reservation_id", reservation.id)
        .order("created_at", { ascending: false })
        .returns<AdminPaymentRow[]>(),
      supabaseAdmin
        .from("partner_reservation_notes")
        .select(
          "id, reservation_id, partner_id, author_user_id, note_type, body, is_resolved, resolved_at, resolved_by, created_at, updated_at",
        )
        .eq("reservation_id", reservation.id)
        .order("created_at", { ascending: false })
        .returns<AdminPartnerNoteRow[]>(),
      supabaseAdmin
        .from("reservation_status_logs")
        .select(
          "id, reservation_id, from_status, to_status, actor_type, actor_user_id, reason, metadata, created_at",
        )
        .eq("reservation_id", reservation.id)
        .order("created_at", { ascending: true })
        .returns<AdminStatusLogRow[]>(),
      supabaseAdmin
        .from("reviews")
        .select("id, reservation_id, rating, comment, created_at")
        .eq("reservation_id", reservation.id)
        .maybeSingle<AdminReviewRow>(),
    ]);

  if (checkinResult.error) {
    console.error("ADMIN CHECKIN DETAIL LOOKUP ERROR:", checkinResult.error);
  }

  if (checkoutResult.error) {
    console.error("ADMIN CHECKOUT DETAIL LOOKUP ERROR:", checkoutResult.error);
  }

  if (paymentResult.error) {
    console.error("ADMIN PAYMENT DETAIL LOOKUP ERROR:", paymentResult.error);
  }

  if (partnerNotesResult.error) {
    if (isMissingPartnerNotesSchema(partnerNotesResult.error)) {
      console.warn(
        "ADMIN PARTNER NOTE LOOKUP SKIPPED: apply db/migrations/20260626_partner_reservation_notes.sql",
      );
    } else {
      console.error(
        "ADMIN PARTNER NOTE DETAIL LOOKUP ERROR:",
        partnerNotesResult.error,
      );
    }
  }

  if (statusLogsResult.error) {
    console.error("ADMIN STATUS LOG DETAIL LOOKUP ERROR:", statusLogsResult.error);
  }

  if (reviewResult.error) {
    console.error("ADMIN REVIEW DETAIL LOOKUP ERROR:", reviewResult.error);
  }

  const checkin = checkinResult.data
    ? {
        frontImg: checkinResult.data.front_img,
        rearImg: checkinResult.data.rear_img,
        leftImg: checkinResult.data.left_img,
        rightImg: checkinResult.data.right_img,
        checkedInAt: checkinResult.data.checked_in_at,
      }
    : null;
  const checkout = checkoutResult.data
    ? {
        id: checkoutResult.data.id ?? "",
        basePrice: toNumber(checkoutResult.data.base_price),
        extraFee: toNumber(checkoutResult.data.extra_fee),
        helperVerifyRequested: checkoutResult.data.helper_verify_requested,
        helperVerifyFee: toNumber(checkoutResult.data.helper_verify_fee),
        totalSettlement: toNumber(checkoutResult.data.total_settlement),
        toolCheckCompleted: checkoutResult.data.tool_check_completed,
        cleaningCompleted: checkoutResult.data.cleaning_completed,
        wasteDisposalCompleted: checkoutResult.data.waste_disposal_completed,
        checkoutPhoto1: checkoutResult.data.checkout_photo_1 ?? null,
        checkoutPhoto2: checkoutResult.data.checkout_photo_2 ?? null,
        completedAt: checkoutResult.data.completed_at,
    }
    : null;
  const payments = (paymentResult.data ?? []).map((payment) => ({
    id: payment.id,
    purpose: payment.payment_purpose,
    provider: payment.provider,
    method: payment.method,
    status: payment.status,
    amount: toNumber(payment.amount),
    approvedAt: payment.approved_at,
    createdAt: payment.created_at,
  }));
  const evidenceIssues = [
    !checkin ? "체크인 row 없음" : null,
    checkin && !checkin.frontImg ? "체크인 전면 사진 없음" : null,
    checkin && !checkin.rearImg ? "체크인 후면 사진 없음" : null,
    checkin && !checkin.leftImg ? "체크인 좌측 사진 없음" : null,
    checkin && !checkin.rightImg ? "체크인 우측 사진 없음" : null,
    !checkout ? "체크아웃 row 없음" : null,
    checkout && !checkout.toolCheckCompleted ? "공구 반납 체크 미완료" : null,
    checkout && !checkout.cleaningCompleted ? "베이 청소 체크 미완료" : null,
    checkout && !checkout.wasteDisposalCompleted
      ? "폐유/폐기물 처리 체크 미완료"
      : null,
    checkout && !checkout.checkoutPhoto1 ? "체크아웃 사진 1 없음" : null,
    checkout && !checkout.checkoutPhoto2 ? "체크아웃 사진 2 없음" : null,
  ].filter((issue): issue is string => issue !== null);

  return {
    reservation: {
      id: reservation.id,
      partnerName: partnerMap.get(reservation.partner_id) ?? "Unknown partner",
      bayName: reservation.bay_id
        ? bayMap.get(reservation.bay_id) ?? "Unknown bay"
        : "-",
      vehicleLabel: reservation.vehicle_id
        ? vehicleMap.get(reservation.vehicle_id) ?? "Unknown vehicle"
        : "-",
      reservationType: reservation.reservation_type,
      packageId: reservation.package_id,
      startTime: reservation.start_time,
      endTime: reservation.end_time,
      blockedUntil: reservation.blocked_until,
      status: reservation.status,
      totalPrice: toNumber(reservation.total_price),
      helperVerifyRequested: reservation.helper_verify_requested,
      helperVerifyFee: toNumber(reservation.helper_verify_fee),
      reservationPaymentStatus: null,
      reservationRefundedAt: null,
      openPartnerNoteCount: partnerNotesResult.error
        ? 0
        : (partnerNotesResult.data ?? []).filter((note) => !note.is_resolved)
            .length,
      createdAt: reservation.created_at,
    },
    checkin,
    checkout,
    payments,
    partnerNotes: partnerNotesResult.error
      ? []
      : (partnerNotesResult.data ?? []).map((note) => ({
          id: note.id,
          noteType: note.note_type,
          body: note.body,
          isResolved: note.is_resolved,
          authorUserId: note.author_user_id,
          resolvedAt: note.resolved_at,
          resolvedBy: note.resolved_by,
          createdAt: note.created_at,
          updatedAt: note.updated_at,
        })),
    statusLogs: (statusLogsResult.data ?? []).map((log) => ({
      id: log.id,
      fromStatus: log.from_status,
      toStatus: log.to_status,
      actorType: log.actor_type,
      actorUserId: log.actor_user_id ?? null,
      reason: log.reason,
      metadata: log.metadata ?? {},
      createdAt: log.created_at,
    })),
    review: reviewResult.data
      ? {
          id: reviewResult.data.id,
          rating: reviewResult.data.rating,
          comment: reviewResult.data.comment,
          createdAt: reviewResult.data.created_at,
        }
      : null,
    evidenceIssues,
  };
}

export async function getAdminSettlements(): Promise<AdminSettlementItem[]> {
  if (!hasSupabaseServiceRoleEnv || !supabaseAdmin) {
    return [];
  }

  const [partnerMap, reservationResult, checkoutResult, paymentResult] =
    await Promise.all([
      getPartnerMap(),
      supabaseAdmin
        .from("reservations")
        .select("id, partner_id, reservation_type, status, total_price")
        .returns<
          Array<{
            id: string;
            partner_id: string;
            reservation_type: AdminReservationType;
            status: AdminReservationStatus;
            total_price: number | string;
          }>
        >(),
      supabaseAdmin
        .from("checkouts")
        .select(
          "id, reservation_id, base_price, extra_fee, helper_verify_requested, helper_verify_fee, total_settlement, tool_check_completed, cleaning_completed, waste_disposal_completed, completed_at",
        )
        .order("completed_at", { ascending: false })
        .limit(100)
        .returns<AdminCheckoutRow[]>(),
      supabaseAdmin
        .from("payments")
        .select(
          "id, reservation_id, checkout_id, payment_purpose, provider, method, status, amount, approved_at, created_at",
        )
        .in("payment_purpose", ["RESERVATION", "CHECKOUT_SETTLEMENT"])
        .order("created_at", { ascending: false })
        .returns<AdminPaymentRow[]>(),
    ]);

  if (reservationResult.error || checkoutResult.error || paymentResult.error) {
    console.error("ADMIN SETTLEMENT LOOKUP ERROR:", {
      reservationError: reservationResult.error,
      checkoutError: checkoutResult.error,
      paymentError: paymentResult.error,
    });
    return [];
  }

  const reservationsById = new Map(
    (reservationResult.data ?? []).map((reservation) => [
      reservation.id,
      reservation,
    ]),
  );
  const paymentsByReservationId = new Map<string, AdminPaymentRow[]>();

  for (const payment of paymentResult.data ?? []) {
    if (!payment.reservation_id) {
      continue;
    }

    const existing = paymentsByReservationId.get(payment.reservation_id) ?? [];
    existing.push(payment);
    paymentsByReservationId.set(payment.reservation_id, existing);
  }

  return (checkoutResult.data ?? []).map((checkout) => {
    const reservation = reservationsById.get(checkout.reservation_id);
    const payments = paymentsByReservationId.get(checkout.reservation_id) ?? [];
    const reservationPayment = latestPaymentForPurpose(payments, "RESERVATION");
    const settlementPayment = latestPaymentForPurpose(
      payments,
      "CHECKOUT_SETTLEMENT",
    );
    const reservationPaidAmount = toNumber(reservation?.total_price);
    const totalSettlement = toNumber(checkout.total_settlement);
    const settlementAmountDue = Math.max(
      0,
      totalSettlement - reservationPaidAmount,
    );
    const settlementPaidAmount =
      settlementPayment?.status === "SETTLEMENT_CONFIRMED"
        ? toNumber(settlementPayment.amount)
        : 0;

    return {
      reservationId: checkout.reservation_id,
      partnerName: reservation
        ? partnerMap.get(reservation.partner_id) ?? "Unknown partner"
        : "Unknown partner",
      reservationType: reservation?.reservation_type ?? "SELF_SERVICE",
      status: reservation?.status ?? "COMPLETED",
      reservationPaidAmount:
        reservationPayment?.status === "RESERVATION_CONFIRMED"
          ? toNumber(reservationPayment.amount)
          : reservationPaidAmount,
      settlementAmountDue,
      settlementPaymentStatus: settlementPayment?.status ?? null,
      settlementPaidAmount,
      basePrice: toNumber(checkout.base_price),
      extraFee: toNumber(checkout.extra_fee),
      helperVerifyRequested: checkout.helper_verify_requested,
      helperVerifyFee: toNumber(checkout.helper_verify_fee),
      totalSettlement,
      evidenceComplete:
        checkout.tool_check_completed &&
        checkout.cleaning_completed &&
        checkout.waste_disposal_completed,
      completedAt: checkout.completed_at,
    };
  });
}

export async function getAdminPayments(): Promise<AdminPaymentItem[]> {
  if (!hasSupabaseServiceRoleEnv || !supabaseAdmin) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("payments")
    .select(
      "id, reservation_id, checkout_id, payment_purpose, provider, method, status, amount, approved_at, refunded_at, failure_code, failure_message, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<
      Array<
        AdminPaymentRow & {
          refunded_at: string | null;
          failure_code: string | null;
          failure_message: string | null;
          updated_at: string;
        }
      >
    >();

  if (error) {
    console.error("ADMIN PAYMENT LOOKUP ERROR:", error);
    return [];
  }

  return (data ?? []).map((payment) => ({
    id: payment.id,
    reservationId: payment.reservation_id,
    checkoutId: payment.checkout_id,
    purpose: payment.payment_purpose,
    provider: payment.provider,
    method: payment.method,
    status: payment.status,
    amount: toNumber(payment.amount),
    approvedAt: payment.approved_at,
    refundedAt: payment.refunded_at,
    failureCode: payment.failure_code,
    failureMessage: payment.failure_message,
    createdAt: payment.created_at,
    updatedAt: payment.updated_at,
  }));
}

export async function getAdminPackages(): Promise<AdminPackageItem[]> {
  if (!hasSupabaseServiceRoleEnv || !supabaseAdmin) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("partner_package_prices")
    .select(
      "partner_id, labor_price, is_active, partners!inner(name), service_packages!inner(name, duration_minutes, is_active)",
    )
    .order("partner_id", { ascending: true })
    .returns<PartnerPackagePriceRow[]>();

  if (error) {
    console.error("ADMIN PACKAGE LOOKUP ERROR:", error);
    return [];
  }

  return (data ?? []).map((row) => {
    const partner = firstOrSelf(row.partners);
    const servicePackage = firstOrSelf(row.service_packages);

    return {
      partnerName: partner?.name ?? "Unknown partner",
      packageName: servicePackage?.name ?? "Unknown package",
      durationMinutes: servicePackage?.duration_minutes ?? 0,
      laborPrice: toNumber(row.labor_price),
      isActive: row.is_active && Boolean(servicePackage?.is_active),
    };
  });
}

export function formatAdminCurrency(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function formatAdminDateTime(value: string | null): string {
  return formatKstAdminDateTime(value);
}
