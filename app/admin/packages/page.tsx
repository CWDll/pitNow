import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasAdminAccess } from "@/src/lib/admin-auth";
import { hasSupabaseServiceRoleEnv, supabaseAdmin } from "@/src/lib/supabase";
import {
  formatAdminCurrency,
  formatAdminDateTime,
  getAdminPackageManagerData,
  type AdminPackageAuditItem,
  type AdminPackageChangeRequestItem,
  type AdminPackageCreationRequestItem,
  type AdminPackageItem,
  type AdminServicePackageOption,
} from "../_lib/admin-data";

interface AdminPackagesPageProps {
  searchParams?: Promise<{
    error?: string | string[];
    status?: string | string[];
  }>;
}

type PackageAuditAction =
  | "SERVICE_PACKAGE_CREATED"
  | "SERVICE_PACKAGE_UPDATED"
  | "PARTNER_PACKAGE_PRICE_UPSERTED"
  | "PARTNER_PACKAGE_PRICE_UPDATED";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function packagesRedirect(params: { error?: string; status?: string }): never {
  const query = new URLSearchParams();

  if (params.status) {
    query.set("status", params.status);
  }

  if (params.error) {
    query.set("error", params.error);
  }

  redirect(`/admin/packages${query.size > 0 ? `?${query.toString()}` : ""}`);
}

async function requireAdminDb() {
  const canAccessAdmin = await hasAdminAccess();

  if (!canAccessAdmin || !hasSupabaseServiceRoleEnv || !supabaseAdmin) {
    return null;
  }

  return supabaseAdmin;
}

function parseTrimmedString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parsePositiveInteger(formData: FormData, key: string) {
  const value = Number(parseTrimmedString(formData, key));

  return Number.isInteger(value) && value > 0 ? value : null;
}

function parseNonNegativeInteger(formData: FormData, key: string) {
  const value = Number(parseTrimmedString(formData, key));

  return Number.isInteger(value) && value >= 0 ? value : null;
}

async function logPackageAudit(params: {
  action: PackageAuditAction;
  afterState?: Record<string, unknown>;
  beforeState?: Record<string, unknown>;
  packageId?: string | null;
  partnerId?: string | null;
  priceId?: string | null;
}) {
  if (!hasSupabaseServiceRoleEnv || !supabaseAdmin) {
    return;
  }

  const { error } = await supabaseAdmin
    .from("admin_package_audit_logs")
    .insert({
      action: params.action,
      after_state: params.afterState ?? {},
      before_state: params.beforeState ?? {},
      package_id: params.packageId ?? null,
      partner_id: params.partnerId ?? null,
      price_id: params.priceId ?? null,
    });

  if (error) {
    console.warn("ADMIN PACKAGE AUDIT LOG INSERT FAILED:", error.message);
  }
}

async function createServicePackageAction(formData: FormData) {
  "use server";

  const db = await requireAdminDb();

  if (!db) {
    packagesRedirect({ error: "admin-auth" });
  }

  const code = parseTrimmedString(formData, "code");
  const name = parseTrimmedString(formData, "name");
  const description = parseTrimmedString(formData, "description");
  const durationMinutes = parsePositiveInteger(formData, "durationMinutes");
  const isActive = formData.get("isActive") === "on";

  if (!code || !name || !durationMinutes) {
    packagesRedirect({ error: "invalid-service-package" });
  }

  const { data, error } = await db
    .from("service_packages")
    .insert({
      code,
      description: description || null,
      duration_minutes: durationMinutes,
      is_active: isActive,
      name,
    })
    .select("id, code, name, description, duration_minutes, is_active")
    .single();

  if (error || !data) {
    console.error("ADMIN SERVICE PACKAGE CREATE ERROR:", error);
    packagesRedirect({ error: "service-package-create-failed" });
  }

  await logPackageAudit({
    action: "SERVICE_PACKAGE_CREATED",
    afterState: data,
    packageId: data.id,
  });

  revalidatePath("/admin/packages");
  packagesRedirect({ status: "service-package-created" });
}

async function updateServicePackageAction(formData: FormData) {
  "use server";

  const db = await requireAdminDb();

  if (!db) {
    packagesRedirect({ error: "admin-auth" });
  }

  const packageId = parseTrimmedString(formData, "packageId");
  const code = parseTrimmedString(formData, "code");
  const name = parseTrimmedString(formData, "name");
  const description = parseTrimmedString(formData, "description");
  const durationMinutes = parsePositiveInteger(formData, "durationMinutes");
  const isActive = formData.get("isActive") === "on";

  if (!packageId || !code || !name || !durationMinutes) {
    packagesRedirect({ error: "invalid-service-package" });
  }

  const { data: beforeState, error: beforeError } = await db
    .from("service_packages")
    .select("id, code, name, description, duration_minutes, is_active")
    .eq("id", packageId)
    .single();

  if (beforeError || !beforeState) {
    console.error("ADMIN SERVICE PACKAGE BEFORE LOOKUP ERROR:", beforeError);
    packagesRedirect({ error: "service-package-not-found" });
  }

  const { data: afterState, error } = await db
    .from("service_packages")
    .update({
      code,
      description: description || null,
      duration_minutes: durationMinutes,
      is_active: isActive,
      name,
    })
    .eq("id", packageId)
    .select("id, code, name, description, duration_minutes, is_active")
    .single();

  if (error || !afterState) {
    console.error("ADMIN SERVICE PACKAGE UPDATE ERROR:", error);
    packagesRedirect({ error: "service-package-update-failed" });
  }

  await logPackageAudit({
    action: "SERVICE_PACKAGE_UPDATED",
    afterState,
    beforeState,
    packageId,
  });

  revalidatePath("/admin/packages");
  revalidatePath("/");
  packagesRedirect({ status: "service-package-updated" });
}

async function upsertPartnerPackagePriceAction(formData: FormData) {
  "use server";

  const db = await requireAdminDb();

  if (!db) {
    packagesRedirect({ error: "admin-auth" });
  }

  const partnerId = parseTrimmedString(formData, "partnerId");
  const packageId = parseTrimmedString(formData, "packageId");
  const laborPrice = parseNonNegativeInteger(formData, "laborPrice");
  const isActive = formData.get("isActive") === "on";

  if (!partnerId || !packageId || laborPrice === null) {
    packagesRedirect({ error: "invalid-partner-package" });
  }

  const { data: beforeRows } = await db
    .from("partner_package_prices")
    .select("id, partner_id, package_id, labor_price, is_active")
    .eq("partner_id", partnerId)
    .eq("package_id", packageId)
    .limit(1);

  const beforeState = beforeRows?.[0] ?? null;
  const { data: afterState, error } = await db
    .from("partner_package_prices")
    .upsert(
      {
        is_active: isActive,
        labor_price: laborPrice,
        package_id: packageId,
        partner_id: partnerId,
      },
      {
        onConflict: "partner_id,package_id",
      },
    )
    .select("id, partner_id, package_id, labor_price, is_active")
    .single();

  if (error || !afterState) {
    console.error("ADMIN PARTNER PACKAGE UPSERT ERROR:", error);
    packagesRedirect({ error: "partner-package-upsert-failed" });
  }

  await logPackageAudit({
    action: "PARTNER_PACKAGE_PRICE_UPSERTED",
    afterState,
    beforeState: beforeState ?? {},
    packageId,
    partnerId,
    priceId: afterState.id,
  });

  revalidatePath("/admin/packages");
  revalidatePath("/");
  packagesRedirect({ status: "partner-package-upserted" });
}

async function updatePartnerPackagePriceAction(formData: FormData) {
  "use server";

  const db = await requireAdminDb();

  if (!db) {
    packagesRedirect({ error: "admin-auth" });
  }

  const priceId = parseTrimmedString(formData, "priceId");
  const laborPrice = parseNonNegativeInteger(formData, "laborPrice");
  const isActive = formData.get("isActive") === "on";

  if (!priceId || laborPrice === null) {
    packagesRedirect({ error: "invalid-partner-package" });
  }

  const { data: beforeState, error: beforeError } = await db
    .from("partner_package_prices")
    .select("id, partner_id, package_id, labor_price, is_active")
    .eq("id", priceId)
    .single();

  if (beforeError || !beforeState) {
    console.error("ADMIN PARTNER PACKAGE BEFORE LOOKUP ERROR:", beforeError);
    packagesRedirect({ error: "partner-package-not-found" });
  }

  const { data: afterState, error } = await db
    .from("partner_package_prices")
    .update({
      is_active: isActive,
      labor_price: laborPrice,
    })
    .eq("id", priceId)
    .select("id, partner_id, package_id, labor_price, is_active")
    .single();

  if (error || !afterState) {
    console.error("ADMIN PARTNER PACKAGE UPDATE ERROR:", error);
    packagesRedirect({ error: "partner-package-update-failed" });
  }

  await logPackageAudit({
    action: "PARTNER_PACKAGE_PRICE_UPDATED",
    afterState,
    beforeState,
    packageId: afterState.package_id,
    partnerId: afterState.partner_id,
    priceId,
  });

  revalidatePath("/admin/packages");
  revalidatePath("/");
  packagesRedirect({ status: "partner-package-updated" });
}

async function approvePackageChangeRequestAction(formData: FormData) {
  "use server";

  const db = await requireAdminDb();

  if (!db) {
    packagesRedirect({ error: "admin-auth" });
  }

  const requestId = parseTrimmedString(formData, "requestId");
  const reviewNote = parseTrimmedString(formData, "reviewNote");

  if (!requestId) {
    packagesRedirect({ error: "invalid-package-request" });
  }

  const { data: request, error: requestError } = await db
    .from("partner_package_change_requests")
    .select(
      "id, partner_id, package_id, price_id, requested_labor_price, status",
    )
    .eq("id", requestId)
    .single<{
      id: string;
      partner_id: string;
      package_id: string;
      price_id: string | null;
      requested_labor_price: number | string;
      status: string;
    }>();

  if (requestError || !request) {
    console.error("ADMIN PACKAGE REQUEST LOOKUP ERROR:", requestError);
    packagesRedirect({ error: "package-request-not-found" });
  }

  if (request.status !== "PENDING" || !request.price_id) {
    packagesRedirect({ error: "package-request-not-pending" });
  }

  const requestedLaborPrice = Number(request.requested_labor_price);

  if (!Number.isInteger(requestedLaborPrice) || requestedLaborPrice < 0) {
    packagesRedirect({ error: "invalid-package-request" });
  }

  const { data: beforeState, error: beforeError } = await db
    .from("partner_package_prices")
    .select("id, partner_id, package_id, labor_price, is_active")
    .eq("id", request.price_id)
    .single();

  if (beforeError || !beforeState) {
    console.error("ADMIN PACKAGE REQUEST PRICE LOOKUP ERROR:", beforeError);
    packagesRedirect({ error: "partner-package-not-found" });
  }

  const { data: afterState, error: updateError } = await db
    .from("partner_package_prices")
    .update({
      labor_price: requestedLaborPrice,
    })
    .eq("id", request.price_id)
    .select("id, partner_id, package_id, labor_price, is_active")
    .single();

  if (updateError || !afterState) {
    console.error("ADMIN PACKAGE REQUEST PRICE UPDATE ERROR:", updateError);
    packagesRedirect({ error: "package-request-approve-failed" });
  }

  const { error: requestUpdateError } = await db
    .from("partner_package_change_requests")
    .update({
      review_note: reviewNote || null,
      reviewed_at: new Date().toISOString(),
      status: "APPROVED",
    })
    .eq("id", request.id);

  if (requestUpdateError) {
    console.error(
      "ADMIN PACKAGE REQUEST APPROVE STATUS ERROR:",
      requestUpdateError,
    );
    packagesRedirect({ error: "package-request-approve-failed" });
  }

  await logPackageAudit({
    action: "PARTNER_PACKAGE_PRICE_UPDATED",
    afterState,
    beforeState,
    packageId: request.package_id,
    partnerId: request.partner_id,
    priceId: request.price_id,
  });

  revalidatePath("/admin/packages");
  revalidatePath("/");
  packagesRedirect({ status: "package-request-approved" });
}

async function rejectPackageChangeRequestAction(formData: FormData) {
  "use server";

  const db = await requireAdminDb();

  if (!db) {
    packagesRedirect({ error: "admin-auth" });
  }

  const requestId = parseTrimmedString(formData, "requestId");
  const reviewNote = parseTrimmedString(formData, "reviewNote");

  if (!requestId) {
    packagesRedirect({ error: "invalid-package-request" });
  }

  const { data: request, error: requestError } = await db
    .from("partner_package_change_requests")
    .select("id, status")
    .eq("id", requestId)
    .single<{ id: string; status: string }>();

  if (requestError || !request) {
    console.error("ADMIN PACKAGE REQUEST REJECT LOOKUP ERROR:", requestError);
    packagesRedirect({ error: "package-request-not-found" });
  }

  if (request.status !== "PENDING") {
    packagesRedirect({ error: "package-request-not-pending" });
  }

  const { error } = await db
    .from("partner_package_change_requests")
    .update({
      review_note: reviewNote || null,
      reviewed_at: new Date().toISOString(),
      status: "REJECTED",
    })
    .eq("id", request.id);

  if (error) {
    console.error("ADMIN PACKAGE REQUEST REJECT ERROR:", error);
    packagesRedirect({ error: "package-request-reject-failed" });
  }

  revalidatePath("/admin/packages");
  packagesRedirect({ status: "package-request-rejected" });
}

async function reviewPackageCreationRequestAction(formData: FormData) {
  "use server";

  const db = await requireAdminDb();
  if (!db) {
    packagesRedirect({ error: "admin-auth" });
  }

  const requestId = parseTrimmedString(formData, "requestId");
  const reviewNote = parseTrimmedString(formData, "reviewNote");
  const decision = parseTrimmedString(formData, "decision");

  if (
    !requestId ||
    !reviewNote ||
    (decision !== "FULFILLED" && decision !== "REJECTED")
  ) {
    packagesRedirect({ error: "invalid-package-creation-request" });
  }

  const { data: request, error: requestError } = await db
    .from("partner_package_creation_requests")
    .select("id,status")
    .eq("id", requestId)
    .single<{ id: string; status: string }>();

  if (requestError || !request) {
    console.error("ADMIN PACKAGE CREATION REQUEST LOOKUP ERROR:", requestError);
    packagesRedirect({ error: "package-creation-request-not-found" });
  }

  if (request.status !== "PENDING") {
    packagesRedirect({ error: "package-creation-request-not-pending" });
  }

  const { error } = await db
    .from("partner_package_creation_requests")
    .update({
      review_note: reviewNote,
      reviewed_at: new Date().toISOString(),
      status: decision,
      updated_at: new Date().toISOString(),
    })
    .eq("id", request.id);

  if (error) {
    console.error("ADMIN PACKAGE CREATION REQUEST REVIEW ERROR:", error);
    packagesRedirect({ error: "package-creation-request-review-failed" });
  }

  revalidatePath("/admin/packages");
  packagesRedirect({
    status:
      decision === "FULFILLED"
        ? "package-creation-request-fulfilled"
        : "package-creation-request-rejected",
  });
}

function statusMessage(status?: string) {
  switch (status) {
    case "service-package-created":
      return "전역 패키지를 추가했습니다.";
    case "service-package-updated":
      return "전역 패키지 정보를 수정했습니다.";
    case "partner-package-upserted":
      return "업장 패키지 가격을 추가하거나 갱신했습니다.";
    case "partner-package-updated":
      return "업장 패키지 가격과 활성 상태를 수정했습니다.";
    case "package-request-approved":
      return "파트너 패키지 변경 요청을 승인하고 가격을 반영했습니다.";
    case "package-request-rejected":
      return "파트너 패키지 변경 요청을 거절했습니다.";
    case "package-creation-request-fulfilled":
      return "신규 패키지 생성 요청을 처리 완료했습니다.";
    case "package-creation-request-rejected":
      return "신규 패키지 생성 요청을 거절했습니다.";
    default:
      return "";
  }
}

function errorMessage(error?: string) {
  switch (error) {
    case "admin-auth":
      return "Admin 권한 또는 Supabase service role 설정을 확인해 주세요.";
    case "invalid-service-package":
      return "패키지 코드, 이름, 소요시간을 올바르게 입력해 주세요.";
    case "invalid-partner-package":
      return "파트너, 패키지, 공임 가격을 올바르게 입력해 주세요.";
    case "service-package-not-found":
      return "수정할 전역 패키지를 찾지 못했습니다.";
    case "partner-package-not-found":
      return "수정할 업장 패키지 가격 row를 찾지 못했습니다.";
    case "invalid-package-request":
      return "패키지 변경 요청 정보를 올바르게 입력해 주세요.";
    case "package-request-not-found":
      return "패키지 변경 요청 row를 찾지 못했습니다.";
    case "package-request-not-pending":
      return "이미 처리된 패키지 변경 요청입니다.";
    case "package-request-approve-failed":
      return "패키지 변경 요청 승인 처리에 실패했습니다.";
    case "package-request-reject-failed":
      return "패키지 변경 요청 거절 처리에 실패했습니다.";
    case "invalid-package-creation-request":
      return "신규 패키지 요청 처리 메모를 입력해 주세요.";
    case "package-creation-request-not-found":
      return "신규 패키지 요청을 찾지 못했습니다.";
    case "package-creation-request-not-pending":
      return "이미 처리된 신규 패키지 요청입니다.";
    case "package-creation-request-review-failed":
      return "신규 패키지 요청 처리 상태를 저장하지 못했습니다.";
    default:
      return error ? "패키지 변경 처리에 실패했습니다." : "";
  }
}

function PackageStatusBadge(props: {
  isActive: boolean;
  servicePackageActive?: boolean;
}) {
  const label =
    props.servicePackageActive === false
      ? "Catalog inactive"
      : props.isActive
        ? "Active"
        : "Inactive";

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
        props.servicePackageActive === false
          ? "bg-amber-50 text-amber-700 ring-amber-200"
          : props.isActive
            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
            : "bg-slate-100 text-slate-600 ring-slate-200"
      }`}
    >
      {label}
    </span>
  );
}

function inputClassName(extra = "") {
  return `h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 ${extra}`;
}

function textareaClassName(extra = "") {
  return `min-h-20 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 ${extra}`;
}

function servicePackageOptionLabel(item: AdminServicePackageOption) {
  return `${item.name} · ${item.durationMinutes}분${item.isActive ? "" : " · inactive"}`;
}

function auditActionLabel(action: string) {
  return action
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function auditActionClass(action: string) {
  if (action.includes("CREATED") || action.includes("UPSERTED")) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  return "bg-cyan-50 text-cyan-700 ring-cyan-200";
}

function hasObjectValues(value: Record<string, unknown>) {
  return Object.keys(value).length > 0;
}

function PartnerPackageRow({ item }: { item: AdminPackageItem }) {
  return (
    <tr className="text-slate-800">
      <td className="px-4 py-4 align-top">
        <p className="font-semibold text-slate-950">{item.partnerName}</p>
      </td>
      <td className="px-4 py-4 align-top">
        <p className="font-semibold text-slate-950">{item.packageName}</p>
        <p className="mt-1 font-mono text-xs text-slate-500">
          {item.packageCode}
        </p>
        {item.packageDescription ? (
          <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">
            {item.packageDescription}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-4 text-right align-top">
        {item.durationMinutes}분
      </td>
      <td className="px-4 py-4 align-top">
        <form
          action={updatePartnerPackagePriceAction}
          className="ml-auto grid max-w-xs gap-2"
        >
          <input type="hidden" name="priceId" value={item.id} />
          <label className="sr-only" htmlFor={`labor-${item.id}`}>
            {item.partnerName} {item.packageName} 공임 가격
          </label>
          <input
            id={`labor-${item.id}`}
            name="laborPrice"
            type="number"
            min="0"
            step="1000"
            defaultValue={item.laborPrice}
            className={inputClassName("text-right")}
          />
          <label className="flex items-center justify-end gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={item.isActive}
              className="size-4 accent-cyan-600"
            />
            신규 예약 노출
          </label>
          <button
            type="submit"
            className="h-10 rounded-2xl bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-500"
          >
            저장
          </button>
        </form>
      </td>
      <td className="px-4 py-4 align-top">
        <PackageStatusBadge
          isActive={item.isActive}
          servicePackageActive={item.servicePackageActive}
        />
      </td>
    </tr>
  );
}

function PackageAuditCard({ item }: { item: AdminPackageAuditItem }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${auditActionClass(
                item.action,
              )}`}
            >
              {auditActionLabel(item.action)}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
              Package
            </span>
          </div>
          <p className="mt-3 text-lg font-semibold text-slate-950">
            {item.partnerName}
          </p>
          <p className="mt-1 text-sm text-slate-600">{item.packageName}</p>
          <p className="mt-1 break-all font-mono text-xs text-slate-500">
            Audit {item.id}
          </p>
        </div>
        <p className="text-xs text-slate-500">
          {formatAdminDateTime(item.createdAt)}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
        {item.partnerId ? (
          <span className="break-all">Partner {item.partnerId}</span>
        ) : null}
        {item.packageId ? (
          <span className="break-all">Package {item.packageId}</span>
        ) : null}
        {item.priceId ? (
          <span className="break-all">Price {item.priceId}</span>
        ) : null}
      </div>

      {hasObjectValues(item.beforeState) || hasObjectValues(item.afterState) ? (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {hasObjectValues(item.beforeState) ? (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Before
              </p>
              <pre className="max-h-52 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-200">
                {JSON.stringify(item.beforeState, null, 2)}
              </pre>
            </div>
          ) : null}
          {hasObjectValues(item.afterState) ? (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                After
              </p>
              <pre className="max-h-52 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-200">
                {JSON.stringify(item.afterState, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function requestStatusClass(status: AdminPackageChangeRequestItem["status"]) {
  if (status === "APPROVED") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (status === "REJECTED") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  return "bg-amber-50 text-amber-700 ring-amber-200";
}

function PackageChangeRequestCard({
  item,
}: {
  item: AdminPackageChangeRequestItem;
}) {
  const isPending = item.status === "PENDING";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${requestStatusClass(
                item.status,
              )}`}
            >
              {item.status}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
              Package request
            </span>
          </div>
          <p className="mt-3 text-lg font-semibold text-slate-950">
            {item.partnerName}
          </p>
          <p className="mt-1 text-sm text-slate-600">{item.packageName}</p>
        </div>
        <p className="text-xs text-slate-500">
          {formatAdminDateTime(item.createdAt)}
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Current
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {formatAdminCurrency(item.currentLaborPrice)}
          </p>
        </div>
        <div className="rounded-2xl bg-cyan-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">
            Requested
          </p>
          <p className="mt-2 text-2xl font-semibold text-cyan-900">
            {formatAdminCurrency(item.requestedLaborPrice)}
          </p>
        </div>
      </div>

      {item.reason ? (
        <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          {item.reason}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="break-all">Request {item.id}</span>
        <span className="break-all">Price {item.priceId ?? "-"}</span>
        {item.requestedBy ? (
          <span className="break-all">Actor {item.requestedBy}</span>
        ) : null}
      </div>

      {item.reviewedAt ? (
        <p className="mt-3 text-sm text-slate-600">
          처리: {formatAdminDateTime(item.reviewedAt)}
          {item.reviewNote ? ` · ${item.reviewNote}` : ""}
        </p>
      ) : null}

      {isPending ? (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          <form
            action={approvePackageChangeRequestAction}
            className="grid gap-2"
          >
            <input type="hidden" name="requestId" value={item.id} />
            <input
              name="reviewNote"
              placeholder="승인 메모"
              className={inputClassName()}
            />
            <button
              type="submit"
              className="h-10 rounded-2xl bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-500"
            >
              승인하고 가격 반영
            </button>
          </form>
          <form
            action={rejectPackageChangeRequestAction}
            className="grid gap-2"
          >
            <input type="hidden" name="requestId" value={item.id} />
            <input
              name="reviewNote"
              placeholder="거절 사유"
              className={inputClassName()}
            />
            <button
              type="submit"
              className="h-10 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
            >
              거절
            </button>
          </form>
        </div>
      ) : null}
    </article>
  );
}

function PackageCreationRequestCard({
  item,
}: {
  item: AdminPackageCreationRequestItem;
}) {
  const isPending = item.status === "PENDING";

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-md px-2 py-1 text-xs font-bold ${
                item.status === "FULFILLED"
                  ? "bg-emerald-50 text-emerald-700"
                  : item.status === "REJECTED"
                    ? "bg-rose-50 text-rose-700"
                    : "bg-amber-50 text-amber-700"
              }`}
            >
              {item.status}
            </span>
            <span className="text-xs font-semibold text-slate-500">
              신규 생성 요청
            </span>
          </div>
          <h4 className="mt-3 text-lg font-bold text-slate-950">
            {item.requestedName}
          </h4>
          <p className="mt-1 text-sm text-slate-600">{item.partnerName}</p>
        </div>
        <p className="text-xs text-slate-500">
          {formatAdminDateTime(item.createdAt)}
        </p>
      </div>

      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-3">
          <dt className="text-xs font-semibold text-slate-500">
            제안 소요시간
          </dt>
          <dd className="mt-1 font-bold">{item.requestedDurationMinutes}분</dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <dt className="text-xs font-semibold text-slate-500">희망 공임</dt>
          <dd className="mt-1 font-bold">
            {formatAdminCurrency(item.requestedLaborPrice)}
          </dd>
        </div>
      </dl>
      {item.requestedDescription ? (
        <p className="mt-3 text-sm leading-6 text-slate-700">
          {item.requestedDescription}
        </p>
      ) : null}
      {item.reason ? (
        <p className="mt-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
          요청 사유: {item.reason}
        </p>
      ) : null}

      {isPending ? (
        <form
          action={reviewPackageCreationRequestAction}
          className="mt-4 grid gap-2 md:grid-cols-[1fr_auto_auto]"
        >
          <input type="hidden" name="requestId" value={item.id} />
          <input
            required
            name="reviewNote"
            placeholder="생성한 package code 또는 거절 사유"
            className={inputClassName()}
          />
          <button
            type="submit"
            name="decision"
            value="FULFILLED"
            className="h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white"
          >
            처리 완료
          </button>
          <button
            type="submit"
            name="decision"
            value="REJECTED"
            className="h-11 rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700"
          >
            거절
          </button>
        </form>
      ) : item.reviewNote ? (
        <p className="mt-3 text-sm text-slate-600">
          처리 메모: {item.reviewNote}
        </p>
      ) : null}
    </article>
  );
}

export default async function AdminPackagesPage({
  searchParams,
}: AdminPackagesPageProps) {
  const resolvedSearchParams = await searchParams;
  const {
    auditLogs,
    changeRequests,
    creationRequests,
    packages,
    partners,
    servicePackages,
  } = await getAdminPackageManagerData();
  const activePartnerPrices = packages.filter((item) => item.isActive);
  const inactivePartnerPrices = packages.filter((item) => !item.isActive);
  const pendingChangeRequests = changeRequests.filter(
    (item) => item.status === "PENDING",
  );
  const pendingCreationRequests = creationRequests.filter(
    (item) => item.status === "PENDING",
  );
  const status = statusMessage(firstParam(resolvedSearchParams?.status));
  const error = errorMessage(firstParam(resolvedSearchParams?.error));

  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-700">
          Packages
        </p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
          Partner Package Pricing
        </h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          Admin이 전역 Shop Service 패키지와 업장별 판매 가격을 관리합니다.
          삭제는 하지 않고 비활성화하여 기존 예약의 가격/패키지 snapshot을
          보존합니다.
        </p>
      </header>

      {status ? (
        <p className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Partner rows
          </p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">
            {packages.length}
          </p>
          <p className="mt-1 text-sm text-slate-600">업장별 가격 row</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Active
          </p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">
            {activePartnerPrices.length}
          </p>
          <p className="mt-1 text-sm text-slate-600">신규 예약 노출</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Inactive
          </p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">
            {inactivePartnerPrices.length}
          </p>
          <p className="mt-1 text-sm text-slate-600">신규 예약 숨김</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Catalog
          </p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">
            {servicePackages.length}
          </p>
          <p className="mt-1 text-sm text-slate-600">전역 패키지 카탈로그</p>
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-2">
        <form
          action={upsertPartnerPackagePriceAction}
          className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h3 className="text-xl font-semibold text-slate-950">
            업장 패키지 추가/갱신
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            같은 업장과 패키지 조합이 이미 있으면 가격과 활성 상태를 갱신합니다.
          </p>
          <div className="mt-5 grid gap-3">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Partner
              <select name="partnerId" required className={inputClassName()}>
                <option value="">업장 선택</option>
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Package
              <select name="packageId" required className={inputClassName()}>
                <option value="">패키지 선택</option>
                {servicePackages.map((item) => (
                  <option key={item.id} value={item.id}>
                    {servicePackageOptionLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Labor price
              <input
                name="laborPrice"
                type="number"
                min="0"
                step="1000"
                required
                placeholder="69000"
                className={inputClassName()}
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked
                className="size-4 accent-cyan-600"
              />
              신규 예약에 노출
            </label>
          </div>
          <button
            type="submit"
            className="mt-5 h-11 rounded-2xl bg-cyan-600 px-5 text-sm font-semibold text-white transition hover:bg-cyan-500"
          >
            업장 패키지 저장
          </button>
        </form>

        <form
          action={createServicePackageAction}
          className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h3 className="text-xl font-semibold text-slate-950">
            전역 패키지 추가
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            새 작업 패키지를 카탈로그에 만든 뒤 업장별 가격을 연결합니다.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Code
              <input
                name="code"
                required
                placeholder="pkg-engine-premium"
                className={inputClassName()}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Name
              <input
                name="name"
                required
                placeholder="엔진오일 프리미엄"
                className={inputClassName()}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Duration
              <input
                name="durationMinutes"
                type="number"
                min="1"
                step="5"
                required
                placeholder="90"
                className={inputClassName()}
              />
            </label>
            <label className="flex items-end gap-2 pb-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked
                className="size-4 accent-cyan-600"
              />
              카탈로그 활성
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700 md:col-span-2">
              Description
              <textarea
                name="description"
                placeholder="사용자에게 보일 패키지 설명"
                className={textareaClassName()}
              />
            </label>
          </div>
          <button
            type="submit"
            className="mt-5 h-11 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            전역 패키지 추가
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h3 className="text-xl font-semibold text-slate-950">
            업장별 판매 패키지
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            가격과 신규 예약 노출 여부만 이 row에서 수정합니다. 패키지명과
            소요시간은 전역 카탈로그 섹션에서 수정합니다.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1040px] w-full border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-4">Partner</th>
                <th className="px-4 py-4">Package</th>
                <th className="px-4 py-4 text-right">Duration</th>
                <th className="px-4 py-4 text-right">Labor Price</th>
                <th className="px-4 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {packages.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-slate-500"
                  >
                    패키지 가격 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                packages.map((item) => (
                  <PartnerPackageRow key={item.id} item={item} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h3 className="text-xl font-semibold text-slate-950">
            전역 패키지 카탈로그
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            이 정보는 같은 패키지를 사용하는 모든 업장에 영향을 줍니다. 기존
            예약의 결제 금액은 변경하지 않습니다.
          </p>
        </div>
        <div className="divide-y divide-slate-200">
          {servicePackages.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">
              전역 패키지 카탈로그가 없습니다.
            </p>
          ) : (
            servicePackages.map((item) => (
              <form
                key={item.id}
                action={updateServicePackageAction}
                className="grid gap-3 p-5 xl:grid-cols-[0.8fr_1fr_0.45fr_1.4fr_auto]"
              >
                <input type="hidden" name="packageId" value={item.id} />
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Code
                  <input
                    name="code"
                    required
                    defaultValue={item.code}
                    className={inputClassName()}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Name
                  <input
                    name="name"
                    required
                    defaultValue={item.name}
                    className={inputClassName()}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Duration
                  <input
                    name="durationMinutes"
                    type="number"
                    min="1"
                    step="5"
                    required
                    defaultValue={item.durationMinutes}
                    className={inputClassName()}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Description
                  <textarea
                    name="description"
                    defaultValue={item.description}
                    className={textareaClassName()}
                  />
                </label>
                <div className="flex flex-col justify-end gap-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      name="isActive"
                      defaultChecked={item.isActive}
                      className="size-4 accent-cyan-600"
                    />
                    카탈로그 활성
                  </label>
                  <button
                    type="submit"
                    className="h-10 rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    저장
                  </button>
                </div>
              </form>
            ))
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-slate-950">
              신규 패키지 생성 요청
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Partner-admin이 제안한 작업을 검토합니다. 반영할 경우 위 전역
              패키지 추가와 업장 패키지 연결을 완료한 뒤 처리 메모를 남깁니다.
            </p>
          </div>
          <span className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 ring-1 ring-amber-200">
            {pendingCreationRequests.length} pending
          </span>
        </div>
        <div className="mt-5 space-y-3">
          {creationRequests.length === 0 ? (
            <p className="rounded-lg bg-slate-100 p-4 text-sm text-slate-600">
              아직 신규 패키지 생성 요청이 없습니다.
            </p>
          ) : (
            creationRequests.map((item) => (
              <PackageCreationRequestCard key={item.id} item={item} />
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-slate-950">
              패키지 변경 요청
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Partner-admin이 남긴 가격 변경 요청을 검토한 뒤 승인 시 업장
              패키지 가격에 반영합니다.
            </p>
          </div>
          <span className="rounded-full bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 ring-1 ring-amber-200">
            {pendingChangeRequests.length} pending
          </span>
        </div>

        <div className="mt-5 space-y-3">
          {changeRequests.length === 0 ? (
            <p className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">
              아직 패키지 변경 요청이 없습니다.
            </p>
          ) : (
            changeRequests.map((item) => (
              <PackageChangeRequestCard key={item.id} item={item} />
            ))
          )}
        </div>
      </section>

      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
        <p className="font-semibold">운영 원칙</p>
        <p className="mt-1">
          기존 예약은 생성 당시 `total_price`, `package_id`,
          `duration_minutes`를 보존합니다. 이 화면의 변경은 신규 예약에서
          조회되는 패키지/가격에만 영향을 주며, 예약이 이미 생성된 row를 직접
          수정하지 않습니다.
        </p>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-slate-950">
              최근 패키지 변경 이력
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Admin이 수행한 전역 패키지와 업장별 가격 변경을 최근 20건까지
              표시합니다.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
            {auditLogs.length} logs
          </span>
        </div>

        <div className="mt-5 space-y-3">
          {auditLogs.length === 0 ? (
            <p className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">
              아직 패키지 변경 이력이 없습니다.
            </p>
          ) : (
            auditLogs.map((item) => (
              <PackageAuditCard key={item.id} item={item} />
            ))
          )}
        </div>
      </section>
    </section>
  );
}
