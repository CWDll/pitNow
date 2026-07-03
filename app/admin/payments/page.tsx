import Link from "next/link";
import { revalidatePath } from "next/cache";

import { hasAdminAccess } from "@/src/lib/admin-auth";
import {
  cleanupStaleReadyPayments,
  confirmManualRefund,
  getStaleReadyPaymentCutoff,
} from "@/src/lib/payment-cleanup";
import {
  formatAdminCurrency,
  formatAdminDateTime,
  getAdminPayments,
  type AdminPaymentItem,
} from "../_lib/admin-data";
import { hasSupabaseServiceRoleEnv, supabaseAdmin } from "@/src/lib/supabase";

type PaymentFilter =
  | "all"
  | "ready"
  | "stale-ready"
  | "failed"
  | "cancelled"
  | "refunded"
  | "refund-pending";

interface AdminPaymentsPageProps {
  searchParams?: Promise<{
    filter?: string | string[];
  }>;
}

async function cleanupStaleReadyPaymentsAction() {
  "use server";

  const canAccessAdmin = await hasAdminAccess();

  if (!canAccessAdmin || !hasSupabaseServiceRoleEnv || !supabaseAdmin) {
    return;
  }

  await cleanupStaleReadyPayments({
    db: supabaseAdmin,
  });
  revalidatePath("/admin/payments");
}

async function confirmManualRefundAction(formData: FormData) {
  "use server";

  const canAccessAdmin = await hasAdminAccess();
  const paymentId = String(formData.get("paymentId") ?? "").trim();

  if (
    !canAccessAdmin ||
    !hasSupabaseServiceRoleEnv ||
    !supabaseAdmin ||
    !paymentId
  ) {
    return;
  }

  await confirmManualRefund({
    db: supabaseAdmin,
    paymentId,
    actorType: "ADMIN",
  });
  revalidatePath("/admin/payments");
  revalidatePath("/admin/reservations");
  revalidatePath("/admin/settlement");
}

function normalizeFilter(value: string | string[] | undefined): PaymentFilter {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (
    rawValue === "ready" ||
    rawValue === "stale-ready" ||
    rawValue === "failed" ||
    rawValue === "cancelled" ||
    rawValue === "refunded" ||
    rawValue === "refund-pending"
  ) {
    return rawValue;
  }

  return "all";
}

function filterLabel(filter: PaymentFilter): string {
  switch (filter) {
    case "ready":
      return "READY";
    case "stale-ready":
      return "Stale READY";
    case "failed":
      return "FAILED";
    case "cancelled":
      return "CANCELLED";
    case "refunded":
      return "REFUNDED";
    case "refund-pending":
      return "REFUND_PENDING";
    default:
      return "All";
  }
}

function filterHref(filter: PaymentFilter): string {
  return filter === "all"
    ? "/admin/payments"
    : `/admin/payments?filter=${filter}`;
}

function statusClass(status: string): string {
  if (status === "RESERVATION_CONFIRMED" || status === "SETTLEMENT_CONFIRMED") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (status === "READY" || status === "APPROVED") {
    return "bg-blue-50 text-blue-700 ring-blue-200";
  }

  if (status === "REFUNDED") {
    return "bg-slate-100 text-slate-700 ring-slate-200";
  }

  if (status === "REFUND_PENDING") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-rose-50 text-rose-700 ring-rose-200";
}

function metricCard(label: string, value: string, description: string) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
    </div>
  );
}

function isStaleReady(payment: AdminPaymentItem, staleReadyCutoff: string) {
  return payment.status === "READY" && payment.createdAt < staleReadyCutoff;
}

function filterPayments(
  payments: AdminPaymentItem[],
  filter: PaymentFilter,
  staleReadyCutoff: string,
): AdminPaymentItem[] {
  switch (filter) {
    case "ready":
      return payments.filter((payment) => payment.status === "READY");
    case "stale-ready":
      return payments.filter((payment) =>
        isStaleReady(payment, staleReadyCutoff),
      );
    case "failed":
      return payments.filter((payment) => payment.status === "FAILED");
    case "cancelled":
      return payments.filter((payment) => payment.status === "CANCELLED");
    case "refunded":
      return payments.filter((payment) => payment.status === "REFUNDED");
    case "refund-pending":
      return payments.filter((payment) => payment.status === "REFUND_PENDING");
    default:
      return payments;
  }
}

export default async function AdminPaymentsPage({
  searchParams,
}: AdminPaymentsPageProps) {
  const resolvedSearchParams = await searchParams;
  const activeFilter = normalizeFilter(resolvedSearchParams?.filter);
  const payments = await getAdminPayments();
  const staleReadyCutoff = getStaleReadyPaymentCutoff();
  const staleReadyPayments = payments.filter((payment) =>
    isStaleReady(payment, staleReadyCutoff),
  );
  const visiblePayments = filterPayments(
    payments,
    activeFilter,
    staleReadyCutoff,
  );
  const filters: Array<{ id: PaymentFilter; count: number }> = [
    { id: "all", count: payments.length },
    {
      id: "ready",
      count: payments.filter((payment) => payment.status === "READY").length,
    },
    { id: "stale-ready", count: staleReadyPayments.length },
    {
      id: "failed",
      count: payments.filter((payment) => payment.status === "FAILED").length,
    },
    {
      id: "cancelled",
      count: payments.filter((payment) => payment.status === "CANCELLED")
        .length,
    },
    {
      id: "refunded",
      count: payments.filter((payment) => payment.status === "REFUNDED").length,
    },
    {
      id: "refund-pending",
      count: payments.filter((payment) => payment.status === "REFUND_PENDING")
        .length,
    },
  ];

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-700">
            Payments
          </p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
            Payment Ledger
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            최근 200개 payment row를 기준으로 결제 대기, 실패, 취소, 환불 확인
            필요 상태를 추적합니다.
          </p>
        </div>
        <form action={cleanupStaleReadyPaymentsAction}>
          <button
            type="submit"
            className="rounded-full bg-cyan-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-cyan-500"
          >
            만료 READY 정리
          </button>
        </form>
      </header>

      <div className="grid gap-4 xl:grid-cols-4">
        {metricCard(
          "Stale READY",
          String(staleReadyPayments.length),
          "30분 이상 승인 없이 남은 결제",
        )}
        {metricCard(
          "Failed",
          String(filters.find((filter) => filter.id === "failed")?.count ?? 0),
          "결제 승인 실패",
        )}
        {metricCard(
          "Cancelled",
          String(
            filters.find((filter) => filter.id === "cancelled")?.count ?? 0,
          ),
          "사용자/운영 취소",
        )}
        {metricCard(
          "Refund pending",
          String(
            filters.find((filter) => filter.id === "refund-pending")?.count ??
              0,
          ),
          "수동 환불 확인 필요",
        )}
      </div>

      <nav className="flex flex-wrap gap-2">
        {filters.map((filter) => {
          const isActive = activeFilter === filter.id;

          return (
            <Link
              key={filter.id}
              href={filterHref(filter.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 transition ${
                isActive
                  ? "bg-cyan-600 text-white ring-cyan-600"
                  : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-100"
              }`}
            >
              {filterLabel(filter.id)} ({filter.count})
            </Link>
          );
        })}
      </nav>

      <div className="rounded-3xl border border-cyan-200 bg-cyan-50 p-4 text-sm leading-6 text-slate-700">
        <p>
          <span className="font-semibold text-cyan-600">만료 READY 정리</span>는
          결제창 진입 후 30분 이상 승인되지 않은 대기 결제를 운영 취소로
          바꿉니다.{" "}
          <span className="font-semibold text-amber-700">환불 완료 처리</span>는
          결제사 대시보드에서 실제 환불을 확인한 뒤에만 눌러야 합니다.
        </p>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1120px] w-full border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="px-4 py-4">Purpose</th>
              <th className="px-4 py-4">Provider</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4 text-right">Amount</th>
              <th className="px-4 py-4">Created</th>
              <th className="px-4 py-4">Updated</th>
              <th className="px-4 py-4">Reservation</th>
              <th className="px-4 py-4">Issue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {visiblePayments.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-slate-600"
                >
                  현재 필터에 해당하는 payment row가 없습니다.
                </td>
              </tr>
            ) : (
              visiblePayments.map((payment) => {
                const stale = isStaleReady(payment, staleReadyCutoff);

                return (
                  <tr
                    key={payment.id}
                    className={`text-slate-800 ${
                      stale || payment.status === "REFUND_PENDING"
                        ? "bg-amber-50 ring-1 ring-inset ring-amber-200"
                        : ""
                    }`}
                  >
                    <td className="px-4 py-4">
                      <p className="font-semibold">{payment.purpose}</p>
                      <p className="mt-1 font-mono text-xs text-slate-500">
                        {payment.id}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      {payment.provider} / {payment.method}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusClass(
                          payment.status,
                        )}`}
                      >
                        {stale ? "STALE_READY" : payment.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-slate-950">
                      {formatAdminCurrency(payment.amount)}
                    </td>
                    <td className="px-4 py-4">
                      {formatAdminDateTime(payment.createdAt)}
                    </td>
                    <td className="px-4 py-4">
                      {formatAdminDateTime(payment.updatedAt)}
                    </td>
                    <td className="max-w-44 truncate px-4 py-4 font-mono text-xs">
                      {payment.reservationId ? (
                        <Link
                          href={`/admin/reservations/${payment.reservationId}`}
                          className="text-cyan-700 hover:text-cyan-600"
                        >
                          {payment.reservationId}
                        </Link>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="max-w-64 px-4 py-4 text-xs text-slate-600">
                      {payment.failureCode ? (
                        <>
                          <p className="font-semibold text-slate-700">
                            {payment.failureCode}
                          </p>
                          <p className="mt-1 line-clamp-2">
                            {payment.failureMessage}
                          </p>
                        </>
                      ) : stale ? (
                        "30분 이상 READY 상태입니다."
                      ) : payment.status === "REFUNDED" ? (
                        payment.refundedAt ? (
                          <>
                            <p className="font-semibold text-emerald-700">
                              환불 완료
                            </p>
                            <p className="mt-1">
                              {formatAdminDateTime(payment.refundedAt)}
                            </p>
                          </>
                        ) : (
                          "환불 완료 시각이 없습니다."
                        )
                      ) : (
                        "-"
                      )}
                      {payment.status === "REFUND_PENDING" ? (
                        <form
                          action={confirmManualRefundAction}
                          className="mt-3"
                        >
                          <p className="mb-2 text-[11px] leading-4 text-amber-700">
                            Toss/결제사 환불 확인 후 처리
                          </p>
                          <input
                            type="hidden"
                            name="paymentId"
                            value={payment.id}
                          />
                          <button
                            type="submit"
                            className="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-400"
                          >
                            환불 완료 처리
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
