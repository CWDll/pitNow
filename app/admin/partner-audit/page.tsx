import Link from "next/link";

import {
  formatAdminDateTime,
  getAdminPartnerAuditLogs,
  type AdminPartnerAuditItem,
  type AdminPartnerAuditTargetType,
} from "../_lib/admin-data";

type AuditFilter = "all" | "bay" | "availability" | "notes";

interface AdminPartnerAuditPageProps {
  searchParams?: Promise<{
    filter?: string | string[];
  }>;
}

function normalizeFilter(value: string | string[] | undefined): AuditFilter {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (rawValue === "bay" || rawValue === "availability" || rawValue === "notes") {
    return rawValue;
  }

  return "all";
}

function filterAuditLogs(
  logs: AdminPartnerAuditItem[],
  filter: AuditFilter,
): AdminPartnerAuditItem[] {
  switch (filter) {
    case "bay":
      return logs.filter((log) => log.targetType === "BAY");
    case "availability":
      return logs.filter((log) => log.targetType === "AVAILABILITY_BLOCK");
    case "notes":
      return logs.filter((log) => log.targetType === "RESERVATION_NOTE");
    default:
      return logs;
  }
}

function filterHref(filter: AuditFilter): string {
  return filter === "all"
    ? "/admin/partner-audit"
    : `/admin/partner-audit?filter=${filter}`;
}

function filterLabel(filter: AuditFilter): string {
  switch (filter) {
    case "bay":
      return "Bay";
    case "availability":
      return "Availability";
    case "notes":
      return "Notes";
    default:
      return "All";
  }
}

function auditActionLabel(action: string) {
  return action
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function targetTypeLabel(targetType: AdminPartnerAuditTargetType) {
  switch (targetType) {
    case "BAY":
      return "Bay";
    case "AVAILABILITY_BLOCK":
      return "Availability";
    case "RESERVATION_NOTE":
      return "Note";
    default:
      return targetType;
  }
}

function auditActionClass(action: string) {
  if (action.includes("RESOLVED") || action.includes("CREATED")) {
    return "bg-emerald-400/15 text-emerald-200 ring-emerald-300/30";
  }

  if (action.includes("DEACTIVATED") || action.includes("REOPENED")) {
    return "bg-amber-400/15 text-amber-100 ring-amber-300/30";
  }

  return "bg-cyan-400/15 text-cyan-200 ring-cyan-300/30";
}

function hasObjectValues(value: Record<string, unknown>) {
  return Object.keys(value).length > 0;
}

function metricCard(label: string, value: string, description: string) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{description}</p>
    </div>
  );
}

export default async function AdminPartnerAuditPage({
  searchParams,
}: AdminPartnerAuditPageProps) {
  const resolvedSearchParams = await searchParams;
  const activeFilter = normalizeFilter(resolvedSearchParams?.filter);
  const logs = await getAdminPartnerAuditLogs();
  const visibleLogs = filterAuditLogs(logs, activeFilter);
  const filters: Array<{ id: AuditFilter; count: number }> = [
    { id: "all", count: logs.length },
    { id: "bay", count: filterAuditLogs(logs, "bay").length },
    { id: "availability", count: filterAuditLogs(logs, "availability").length },
    { id: "notes", count: filterAuditLogs(logs, "notes").length },
  ];

  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">
          Partner Audit
        </p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white">
          Partner Admin Audit
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          정비소 운영자가 수행한 베이, 예약 차단, 현장 메모 변경 이력을 최근 100건 기준으로 확인합니다.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-4">
        {metricCard("Total", String(logs.length), "최근 audit 조회 범위")}
        {metricCard(
          "Availability",
          String(filterAuditLogs(logs, "availability").length),
          "예약 차단 생성/수정/해제",
        )}
        {metricCard(
          "Notes",
          String(filterAuditLogs(logs, "notes").length),
          "현장 메모 생성/해결/재오픈",
        )}
        {metricCard(
          "Visible",
          String(visibleLogs.length),
          `${filterLabel(activeFilter)} 필터 적용 중`,
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => {
          const isActive = activeFilter === filter.id;

          return (
            <Link
              key={filter.id}
              href={filterHref(filter.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 transition ${
                isActive
                  ? "bg-cyan-300 text-slate-950 ring-cyan-200"
                  : "bg-white/[0.04] text-slate-300 ring-white/10 hover:bg-white/10 hover:text-white"
              }`}
            >
              {filterLabel(filter.id)} ({filter.count})
            </Link>
          );
        })}
      </div>

      <div className="space-y-3">
        {visibleLogs.length === 0 ? (
          <p className="rounded-3xl border border-white/10 bg-slate-900 p-6 text-sm text-slate-400">
            조건에 맞는 partner-admin audit 로그가 없습니다.
          </p>
        ) : (
          visibleLogs.map((log) => (
            <article
              key={log.id}
              className="rounded-3xl border border-white/10 bg-slate-900 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${auditActionClass(
                        log.action,
                      )}`}
                    >
                      {auditActionLabel(log.action)}
                    </span>
                    <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-slate-300 ring-1 ring-white/10">
                      {targetTypeLabel(log.targetType)}
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-semibold text-white">
                    {log.partnerName}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-500">
                    Target {log.targetId}
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  {formatAdminDateTime(log.createdAt)}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
                {log.actorUserId ? (
                  <span className="break-all">Actor {log.actorUserId}</span>
                ) : null}
                {log.reservationId ? (
                  <Link
                    href={`/admin/reservations/${log.reservationId}`}
                    className="break-all text-cyan-300 hover:text-cyan-200"
                  >
                    Reservation {log.reservationId}
                  </Link>
                ) : null}
                <span className="break-all">Audit {log.id}</span>
              </div>

              {hasObjectValues(log.beforeState) || hasObjectValues(log.afterState) ? (
                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  {hasObjectValues(log.beforeState) ? (
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Before
                      </p>
                      <pre className="max-h-56 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-400">
                        {JSON.stringify(log.beforeState, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                  {hasObjectValues(log.afterState) ? (
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        After
                      </p>
                      <pre className="max-h-56 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-400">
                        {JSON.stringify(log.afterState, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {hasObjectValues(log.metadata) ? (
                <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-400">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
