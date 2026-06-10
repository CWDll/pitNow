import { hasSupabaseServiceRoleEnv, supabaseAdmin } from "@/src/lib/supabase";

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
  reservation_id: string;
  base_price: number | string;
  extra_fee: number | string;
  helper_verify_requested: boolean;
  helper_verify_fee: number | string;
  total_settlement: number | string;
  tool_check_completed: boolean;
  cleaning_completed: boolean;
  waste_disposal_completed: boolean;
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
  reservationType: AdminReservationType;
  packageId: string | null;
  startTime: string;
  endTime: string;
  blockedUntil: string | null;
  status: AdminReservationStatus;
  totalPrice: number;
  helperVerifyRequested: boolean;
  helperVerifyFee: number;
  createdAt: string;
}

export interface AdminSettlementItem {
  reservationId: string;
  partnerName: string;
  reservationType: AdminReservationType;
  status: AdminReservationStatus;
  basePrice: number;
  extraFee: number;
  helperVerifyRequested: boolean;
  helperVerifyFee: number;
  totalSettlement: number;
  evidenceComplete: boolean;
  completedAt: string;
}

export interface AdminPackageItem {
  partnerName: string;
  packageName: string;
  durationMinutes: number;
  laborPrice: number;
  isActive: boolean;
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

export async function getAdminReservations(): Promise<AdminReservationItem[]> {
  if (!hasSupabaseServiceRoleEnv || !supabaseAdmin) {
    return [];
  }

  const [partnerMap, bayMap, reservationResult] = await Promise.all([
    getPartnerMap(),
    getBayMap(),
    supabaseAdmin
      .from("reservations")
      .select(
        "id, partner_id, bay_id, reservation_type, package_id, start_time, end_time, blocked_until, status, total_price, helper_verify_requested, helper_verify_fee, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<AdminReservationRow[]>(),
  ]);

  if (reservationResult.error) {
    console.error("ADMIN RESERVATION LOOKUP ERROR:", reservationResult.error);
    return [];
  }

  return (reservationResult.data ?? []).map((reservation) => ({
    id: reservation.id,
    partnerName: partnerMap.get(reservation.partner_id) ?? "Unknown partner",
    bayName: reservation.bay_id
      ? bayMap.get(reservation.bay_id) ?? "Unknown bay"
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
    createdAt: reservation.created_at,
  }));
}

export async function getAdminSettlements(): Promise<AdminSettlementItem[]> {
  if (!hasSupabaseServiceRoleEnv || !supabaseAdmin) {
    return [];
  }

  const [partnerMap, reservationResult, checkoutResult] = await Promise.all([
    getPartnerMap(),
    supabaseAdmin
      .from("reservations")
      .select("id, partner_id, reservation_type, status")
      .returns<
        Array<{
          id: string;
          partner_id: string;
          reservation_type: AdminReservationType;
          status: AdminReservationStatus;
        }>
      >(),
    supabaseAdmin
      .from("checkouts")
      .select(
        "reservation_id, base_price, extra_fee, helper_verify_requested, helper_verify_fee, total_settlement, tool_check_completed, cleaning_completed, waste_disposal_completed, completed_at",
      )
      .order("completed_at", { ascending: false })
      .limit(100)
      .returns<AdminCheckoutRow[]>(),
  ]);

  if (reservationResult.error || checkoutResult.error) {
    console.error("ADMIN SETTLEMENT LOOKUP ERROR:", {
      reservationError: reservationResult.error,
      checkoutError: checkoutResult.error,
    });
    return [];
  }

  const reservationsById = new Map(
    (reservationResult.data ?? []).map((reservation) => [
      reservation.id,
      reservation,
    ]),
  );

  return (checkoutResult.data ?? []).map((checkout) => {
    const reservation = reservationsById.get(checkout.reservation_id);

    return {
      reservationId: checkout.reservation_id,
      partnerName: reservation
        ? partnerMap.get(reservation.partner_id) ?? "Unknown partner"
        : "Unknown partner",
      reservationType: reservation?.reservation_type ?? "SELF_SERVICE",
      status: reservation?.status ?? "COMPLETED",
      basePrice: toNumber(checkout.base_price),
      extraFee: toNumber(checkout.extra_fee),
      helperVerifyRequested: checkout.helper_verify_requested,
      helperVerifyFee: toNumber(checkout.helper_verify_fee),
      totalSettlement: toNumber(checkout.total_settlement),
      evidenceComplete:
        checkout.tool_check_completed &&
        checkout.cleaning_completed &&
        checkout.waste_disposal_completed,
      completedAt: checkout.completed_at,
    };
  });
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
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
