import Link from "next/link";

import {
  formatAdminDateTime,
  getAdminPartnerAuditLogs,
  type AdminPartnerAuditAction,
  type AdminPartnerAuditItem,
  type AdminPartnerAuditTargetType,
} from "../_lib/admin-data";

type AuditFilter = "all" | "bay" | "availability" | "notes";
type AuditRange = "all" | "24h" | "7d" | "30d";

const auditActions: AdminPartnerAuditAction[] = [
  "BAY_ACTIVE_UPDATED",
  "AVAILABILITY_BLOCK_CREATED",
  "AVAILABILITY_BLOCK_UPDATED",
  "AVAILABILITY_BLOCK_DEACTIVATED",
  "AVAILABILITY_BLOCK_REACTIVATED",
  "RESERVATION_NOTE_CREATED",
  "RESERVATION_NOTE_RESOLVED",
  "RESERVATION_NOTE_REOPENED",
];

interface AdminPartnerAuditPageProps {
  searchParams?: Promise<{
    action?: string | string[];
    filter?: string | string[];
    partner?: string | string[];
    q?: string | string[];
    range?: string | string[];
  }>;
}

interface AuditSearchState {
  action: AdminPartnerAuditAction | "all";
  partnerId: string;
  query: string;
  range: AuditRange;
  targetFilter: AuditFilter;
}

function normalizeFilter(value: string | string[] | undefined): AuditFilter {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (rawValue === "bay" || rawValue === "availability" || rawValue === "notes") {
    return rawValue;
  }

  return "all";
}

function normalizeAction(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;

  return auditActions.find((action) => action === rawValue) ?? "all";
}

function normalizeString(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;

  return rawValue?.trim() ?? "";
}

function normalizeRange(value: string | string[] | undefined): AuditRange {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (rawValue === "24h" || rawValue === "7d" || rawValue === "30d") {
    return rawValue;
  }

  return "all";
}

function matchesTargetFilter(log: AdminPartnerAuditItem, filter: AuditFilter) {
  switch (filter) {
    case "bay":
      return log.targetType === "BAY";
    case "availability":
      return log.targetType === "AVAILABILITY_BLOCK";
    case "notes":
      return log.targetType === "RESERVATION_NOTE";
    default:
      return true;
  }
}

function matchesRange(log: AdminPartnerAuditItem, range: AuditRange) {
  if (range === "all") {
    return true;
  }

  const hoursByRange = {
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
  } satisfies Record<Exclude<AuditRange, "all">, number>;
  const cutoff = Date.now() - hoursByRange[range] * 60 * 60 * 1000;

  return new Date(log.createdAt).getTime() >= cutoff;
}

function searchableLogText(log: AdminPartnerAuditItem) {
  return [
    log.id,
    log.partnerId,
    log.partnerName,
    log.actorUserId,
    log.action,
    log.targetType,
    log.targetId,
    log.reservationId,
    JSON.stringify(log.beforeState),
    JSON.stringify(log.afterState),
    JSON.stringify(log.metadata),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filterAuditLogs(
  logs: AdminPartnerAuditItem[],
  state: AuditSearchState,
): AdminPartnerAuditItem[] {
  const query = state.query.toLowerCase();

  return logs.filter((log) => {
    if (!matchesTargetFilter(log, state.targetFilter)) {
      return false;
    }

    if (state.action !== "all" && log.action !== state.action) {
      return false;
    }

    if (state.partnerId && log.partnerId !== state.partnerId) {
      return false;
    }

    if (!matchesRange(log, state.range)) {
      return false;
    }

    if (query && !searchableLogText(log).includes(query)) {
      return false;
    }

    return true;
  });
}

function targetFilterLogs(
  logs: AdminPartnerAuditItem[],
  filter: AuditFilter,
): AdminPartnerAuditItem[] {
  return logs.filter((log) => matchesTargetFilter(log, filter));
}

function buildFilterHref(filter: AuditFilter, state: AuditSearchState): string {
  const params = new URLSearchParams();

  if (filter !== "all") {
    params.set("filter", filter);
  }

  if (state.action !== "all") {
    params.set("action", state.action);
  }

  if (state.partnerId) {
    params.set("partner", state.partnerId);
  }

  if (state.query) {
    params.set("q", state.query);
  }

  if (state.range !== "all") {
    params.set("range", state.range);
  }

  const queryString = params.toString();

  return queryString
    ? `/admin/partner-audit?${queryString}`
    : "/admin/partner-audit";
}

function rangeLabel(range: AuditRange) {
  switch (range) {
    case "24h":
      return "24시간";
    case "7d":
      return "7일";
    case "30d":
      return "30일";
    default:
      return "전체 기간";
  }
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

function getPartnerOptions(logs: AdminPartnerAuditItem[]) {
  return Array.from(
    new Map(logs.map((log) => [log.partnerId, log.partnerName])).entries(),
  ).sort(([, aName], [, bName]) => aName.localeCompare(bName, "ko-KR"));
}

export default async function AdminPartnerAuditPage({
  searchParams,
}: AdminPartnerAuditPageProps) {
  const resolvedSearchParams = await searchParams;
  const searchState: AuditSearchState = {
    action: normalizeAction(resolvedSearchParams?.action),
    partnerId: normalizeString(resolvedSearchParams?.partner),
    query: normalizeString(resolvedSearchParams?.q),
    range: normalizeRange(resolvedSearchParams?.range),
    targetFilter: normalizeFilter(resolvedSearchParams?.filter),
  };
  const logs = await getAdminPartnerAuditLogs();
  const visibleLogs = filterAuditLogs(logs, searchState);
  const partnerOptions = getPartnerOptions(logs);
  const filters: Array<{ id: AuditFilter; count: number }> = [
    { id: "all", count: logs.length },
    { id: "bay", count: targetFilterLogs(logs, "bay").length },
    { id: "availability", count: targetFilterLogs(logs, "availability").length },
    { id: "notes", count: targetFilterLogs(logs, "notes").length },
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
          정비소 운영자가 수행한 베이, 예약 차단, 현장 메모 변경 이력을 최근 100건 기준으로 검색합니다.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-4">
        {metricCard("Total", String(logs.length), "최근 audit 조회 범위")}
        {metricCard(
          "Availability",
          String(targetFilterLogs(logs, "availability").length),
          "예약 차단 생성/수정/해제",
        )}
        {metricCard(
          "Notes",
          String(targetFilterLogs(logs, "notes").length),
          "현장 메모 생성/해결/재오픈",
        )}
        {metricCard(
          "Visible",
          String(visibleLogs.length),
          `${filterLabel(searchState.targetFilter)} / ${rangeLabel(
            searchState.range,
          )}`,
        )}
      </div>

      <form
        action="/admin/partner-audit"
        className="grid gap-4 rounded-3xl border border-white/10 bg-slate-900 p-5 xl:grid-cols-[1.1fr_1fr_1fr_1fr_auto]"
      >
        {searchState.targetFilter !== "all" ? (
          <input type="hidden" name="filter" value={searchState.targetFilter} />
        ) : null}
        <label className="space-y-2 text-sm font-medium text-slate-300">
          <span>Search</span>
          <input
            name="q"
            defaultValue={searchState.query}
            placeholder="예약 ID, target ID, metadata"
            className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300"
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-300">
          <span>Partner</span>
          <select
            name="partner"
            defaultValue={searchState.partnerId}
            className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
          >
            <option value="">All partners</option>
            {partnerOptions.map(([partnerId, partnerName]) => (
              <option key={partnerId} value={partnerId}>
                {partnerName}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-300">
          <span>Action</span>
          <select
            name="action"
            defaultValue={searchState.action}
            className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
          >
            <option value="all">All actions</option>
            {auditActions.map((action) => (
              <option key={action} value={action}>
                {auditActionLabel(action)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-300">
          <span>Range</span>
          <select
            name="range"
            defaultValue={searchState.range}
            className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
          >
            <option value="all">All time</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
          >
            Filter
          </button>
          <Link
            href="/admin/partner-audit"
            className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            Reset
          </Link>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => {
          const isActive = searchState.targetFilter === filter.id;

          return (
            <Link
              key={filter.id}
              href={buildFilterHref(filter.id, searchState)}
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
