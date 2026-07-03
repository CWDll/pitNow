import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasAdminAccess } from "@/src/lib/admin-auth";
import { hasSupabaseServiceRoleEnv, supabaseAdmin } from "@/src/lib/supabase";
import {
  getAdminPackageManagerData,
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

export default async function AdminPackagesPage({
  searchParams,
}: AdminPackagesPageProps) {
  const resolvedSearchParams = await searchParams;
  const { packages, partners, servicePackages } =
    await getAdminPackageManagerData();
  const activePartnerPrices = packages.filter((item) => item.isActive);
  const inactivePartnerPrices = packages.filter((item) => !item.isActive);
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

      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
        <p className="font-semibold">운영 원칙</p>
        <p className="mt-1">
          기존 예약은 생성 당시 `total_price`, `package_id`,
          `duration_minutes`를 보존합니다. 이 화면의 변경은 신규 예약에서
          조회되는 패키지/가격에만 영향을 주며, 예약이 이미 생성된 row를 직접
          수정하지 않습니다.
        </p>
      </div>
    </section>
  );
}
