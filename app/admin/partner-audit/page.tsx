import Link from "next/link";
import { AuditChangeList } from "../_components/audit-change-list";

import {
  formatAdminDateTime,
  getAdminPartnerOptions,
  getAdminPartnerAuditLogs,
  type AdminPartnerAuditAction,
  type AdminPartnerAuditItem,
  type AdminPartnerAuditTargetType,
} from "../_lib/admin-data";

type AuditFilter = "all" | "bay" | "availability" | "notes";
type AuditRange = "all" | "24h" | "7d" | "30d";
type AuditLimit = 25 | 50 | 100;

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
    limit?: string | string[];
    page?: string | string[];
    partner?: string | string[];
    q?: string | string[];
    range?: string | string[];
  }>;
}

interface AuditSearchState {
  action: AdminPartnerAuditAction | "all";
  limit: AuditLimit;
  page: number;
  partnerId: string;
  query: string;
  range: AuditRange;
  targetFilter: AuditFilter;
}

function normalizeFilter(value: string | string[] | undefined): AuditFilter {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (
    rawValue === "bay" ||
    rawValue === "availability" ||
    rawValue === "notes"
  ) {
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

function normalizePage(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const page = Number(rawValue);

  return Number.isInteger(page) && page > 0 ? page : 1;
}

function normalizeLimit(value: string | string[] | undefined): AuditLimit {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const limit = Number(rawValue);

  if (limit === 25 || limit === 50 || limit === 100) {
    return limit;
  }

  return 50;
}

function targetFilterToTargetType(
  filter: AuditFilter,
): AdminPartnerAuditTargetType | undefined {
  switch (filter) {
    case "bay":
      return "BAY";
    case "availability":
      return "AVAILABILITY_BLOCK";
    case "notes":
      return "RESERVATION_NOTE";
    default:
      return undefined;
  }
}

function rangeToCreatedAfter(range: AuditRange): string | undefined {
  if (range === "all") {
    return undefined;
  }

  const hoursByRange = {
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
  } satisfies Record<Exclude<AuditRange, "all">, number>;

  return new Date(
    Date.now() - hoursByRange[range] * 60 * 60 * 1000,
  ).toISOString();
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
  const targetType = targetFilterToTargetType(filter);

  return targetType
    ? logs.filter((log) => log.targetType === targetType)
    : logs;
}

function buildAuditHref(
  state: AuditSearchState,
  overrides: Partial<AuditSearchState> = {},
): string {
  const nextState = {
    ...state,
    ...overrides,
  };
  const params = new URLSearchParams();

  if (nextState.targetFilter !== "all") {
    params.set("filter", nextState.targetFilter);
  }

  if (nextState.action !== "all") {
    params.set("action", nextState.action);
  }

  if (nextState.partnerId) {
    params.set("partner", nextState.partnerId);
  }

  if (nextState.query) {
    params.set("q", nextState.query);
  }

  if (nextState.range !== "all") {
    params.set("range", nextState.range);
  }

  if (nextState.limit !== 50) {
    params.set("limit", String(nextState.limit));
  }

  if (nextState.page > 1) {
    params.set("page", String(nextState.page));
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
      return "베이";
    case "availability":
      return "예약 차단";
    case "notes":
      return "현장 메모";
    default:
      return "전체";
  }
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    AVAILABILITY_BLOCK_CREATED: "예약 차단 생성",
    AVAILABILITY_BLOCK_DEACTIVATED: "예약 차단 해제",
    AVAILABILITY_BLOCK_REACTIVATED: "예약 차단 재활성화",
    AVAILABILITY_BLOCK_UPDATED: "예약 차단 수정",
    BAY_ACTIVE_UPDATED: "베이 운영 상태 변경",
    BAY_COMPATIBILITY_UPDATED: "베이 이용 조건 변경",
    RESERVATION_NOTE_CREATED: "현장 메모 생성",
    RESERVATION_NOTE_REOPENED: "현장 메모 재오픈",
    RESERVATION_NOTE_RESOLVED: "현장 메모 해결",
  };
  return labels[action] ?? action;
}

function targetTypeLabel(targetType: AdminPartnerAuditTargetType) {
  switch (targetType) {
    case "BAY":
      return "베이";
    case "AVAILABILITY_BLOCK":
      return "예약 차단";
    case "RESERVATION_NOTE":
      return "현장 메모";
    default:
      return targetType;
  }
}

function auditActionClass(action: string) {
  if (action.includes("RESOLVED") || action.includes("CREATED")) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (action.includes("DEACTIVATED") || action.includes("REOPENED")) {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-cyan-50 text-cyan-700 ring-cyan-200";
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

export default async function AdminPartnerAuditPage({
  searchParams,
}: AdminPartnerAuditPageProps) {
  const resolvedSearchParams = await searchParams;
  const searchState: AuditSearchState = {
    action: normalizeAction(resolvedSearchParams?.action),
    limit: normalizeLimit(resolvedSearchParams?.limit),
    page: normalizePage(resolvedSearchParams?.page),
    partnerId: normalizeString(resolvedSearchParams?.partner),
    query: normalizeString(resolvedSearchParams?.q),
    range: normalizeRange(resolvedSearchParams?.range),
    targetFilter: normalizeFilter(resolvedSearchParams?.filter),
  };
  const [auditResult, partnerOptions] = await Promise.all([
    getAdminPartnerAuditLogs({
      action: searchState.action === "all" ? undefined : searchState.action,
      createdAfter: rangeToCreatedAfter(searchState.range),
      limit: searchState.limit,
      page: searchState.page,
      partnerId: searchState.partnerId || undefined,
      query: searchState.query || undefined,
      targetType: targetFilterToTargetType(searchState.targetFilter),
    }),
    getAdminPartnerOptions(),
  ]);
  const logs = auditResult.logs;
  const visibleLogs = filterAuditLogs(logs, searchState);
  const filters: Array<{ id: AuditFilter; count: number }> = [
    { id: "all", count: logs.length },
    { id: "bay", count: targetFilterLogs(logs, "bay").length },
    {
      id: "availability",
      count: targetFilterLogs(logs, "availability").length,
    },
    { id: "notes", count: targetFilterLogs(logs, "notes").length },
  ];

  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-700">
          파트너 감사
        </p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
          파트너 운영 변경 이력
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          정비소 운영자가 수행한 베이, 예약 차단, 현장 메모 변경 이력을 서버
          검색과 페이지 단위로 조회합니다.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-4">
        {metricCard(
          "전체 결과",
          String(auditResult.totalCount),
          "서버 필터 기준 전체 건수",
        )}
        {metricCard(
          "페이지",
          `${auditResult.page} / ${auditResult.totalPages}`,
          `${auditResult.limit}건씩 조회`,
        )}
        {metricCard("현재 조회", String(logs.length), "현재 페이지 로드 건수")}
        {metricCard(
          "화면 표시",
          String(visibleLogs.length),
          `${filterLabel(searchState.targetFilter)} / ${rangeLabel(
            searchState.range,
          )}`,
        )}
      </div>

      <form
        action="/admin/partner-audit"
        className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:grid-cols-[1.1fr_1fr_1fr_1fr_0.8fr_auto]"
      >
        {searchState.targetFilter !== "all" ? (
          <input type="hidden" name="filter" value={searchState.targetFilter} />
        ) : null}
        <input type="hidden" name="page" value="1" />
        <label className="space-y-2 text-sm font-medium text-slate-700">
          <span>검색어</span>
          <input
            name="q"
            defaultValue={searchState.query}
            placeholder="예약 ID, 대상 ID, 변경 내용"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-cyan-500"
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-700">
          <span>정비소</span>
          <select
            name="partner"
            defaultValue={searchState.partnerId}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-cyan-500"
          >
            <option value="">전체 정비소</option>
            {partnerOptions.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-700">
          <span>작업</span>
          <select
            name="action"
            defaultValue={searchState.action}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-cyan-500"
          >
            <option value="all">전체 작업</option>
            {auditActions.map((action) => (
              <option key={action} value={action}>
                {auditActionLabel(action)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-700">
          <span>기간</span>
          <select
            name="range"
            defaultValue={searchState.range}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-cyan-500"
          >
            <option value="all">전체 기간</option>
            <option value="24h">최근 24시간</option>
            <option value="7d">최근 7일</option>
            <option value="30d">최근 30일</option>
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-700">
          <span>페이지당 표시</span>
          <select
            name="limit"
            defaultValue={searchState.limit}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-cyan-500"
          >
            <option value="25">25건</option>
            <option value="50">50건</option>
            <option value="100">100건</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-2xl bg-cyan-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-cyan-500"
          >
            검색
          </button>
          <Link
            href="/admin/partner-audit"
            className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            초기화
          </Link>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => {
          const isActive = searchState.targetFilter === filter.id;

          return (
            <Link
              key={filter.id}
              href={buildAuditHref(searchState, {
                page: 1,
                targetFilter: filter.id,
              })}
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
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white shadow-sm p-4 text-sm text-slate-600">
        <p>
          현재 {visibleLogs.length}건 표시 · 검색 조건 전체{" "}
          {auditResult.totalCount}건
        </p>
        <div className="flex gap-2">
          <Link
            href={buildAuditHref(searchState, {
              page: Math.max(1, auditResult.page - 1),
            })}
            aria-disabled={auditResult.page <= 1}
            className={`rounded-2xl px-4 py-2 font-semibold ring-1 transition ${
              auditResult.page <= 1
                ? "pointer-events-none bg-slate-50 text-slate-400 ring-slate-100"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-100"
            }`}
          >
            이전
          </Link>
          <Link
            href={buildAuditHref(searchState, {
              page: Math.min(auditResult.totalPages, auditResult.page + 1),
            })}
            aria-disabled={auditResult.page >= auditResult.totalPages}
            className={`rounded-2xl px-4 py-2 font-semibold ring-1 transition ${
              auditResult.page >= auditResult.totalPages
                ? "pointer-events-none bg-slate-50 text-slate-400 ring-slate-100"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-100"
            }`}
          >
            다음
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        {visibleLogs.length === 0 ? (
          <p className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6 text-sm text-slate-600">
            조건에 맞는 partner-admin audit 로그가 없습니다.
          </p>
        ) : (
          visibleLogs.map((log) => (
            <article
              key={log.id}
              className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
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
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                      {targetTypeLabel(log.targetType)}
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-semibold text-slate-950">
                    {log.partnerName}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-500">
                    대상 {log.targetId}
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  {formatAdminDateTime(log.createdAt)}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
                {log.actorUserId ? (
                  <span className="break-all">작업자 {log.actorUserId}</span>
                ) : null}
                {log.reservationId ? (
                  <Link
                    href={`/admin/reservations/${log.reservationId}`}
                    className="break-all text-cyan-700 hover:text-cyan-600"
                  >
                    예약 {log.reservationId}
                  </Link>
                ) : null}
                <span className="break-all">감사 로그 {log.id}</span>
              </div>

              <AuditChangeList
                before={log.beforeState}
                after={log.afterState}
                metadata={log.metadata}
              />
            </article>
          ))
        )}
      </div>
    </section>
  );
}
