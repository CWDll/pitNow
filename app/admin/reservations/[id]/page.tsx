import Link from "next/link";
import { notFound } from "next/navigation";

import {
  formatAdminCurrency,
  formatAdminDateTime,
  getAdminReservationDetail,
  type AdminReservationStatus,
  type AdminReservationType,
} from "../../_lib/admin-data";
import CancelReservationForm from "./cancel-reservation-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

function statusClass(status: AdminReservationStatus): string {
  if (status === "CONFIRMED") {
    return "bg-blue-50 text-blue-700 ring-blue-200";
  }

  if (status === "CHECKED_IN" || status === "IN_USE") {
    return "bg-cyan-50 text-cyan-700 ring-cyan-200";
  }

  if (status === "COMPLETED") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function typeLabel(type: AdminReservationType): string {
  return type === "SELF_SERVICE" ? "셀프 정비" : "정비 맡기기";
}

function EvidenceImage(props: { label: string; url: string | null }) {
  const { label, url } = props;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            className="h-36 w-full rounded-xl object-cover ring-1 ring-slate-200"
          />
        </a>
      ) : (
        <div className="flex h-36 items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500 ring-1 ring-slate-200">
          증적 없음
        </div>
      )}
    </div>
  );
}

function ChecklistItem(props: { label: string; checked: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-100 px-4 py-3">
      <span className="text-slate-700">{props.label}</span>
      <span
        className={
          props.checked
            ? "text-sm font-semibold text-emerald-300"
            : "text-sm font-semibold text-rose-300"
        }
      >
        {props.checked ? "완료" : "미완료"}
      </span>
    </div>
  );
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="tracking-widest text-amber-300">
      {"★".repeat(rating)}
      <span className="text-slate-700">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

function partnerNoteLabel(type: "NOTE" | "ISSUE" | "DELAY" | "NO_SHOW") {
  switch (type) {
    case "ISSUE":
      return "이슈";
    case "DELAY":
      return "지연";
    case "NO_SHOW":
      return "노쇼";
    case "NOTE":
      return "메모";
    default:
      return type;
  }
}

function partnerNoteClass(type: "NOTE" | "ISSUE" | "DELAY" | "NO_SHOW") {
  switch (type) {
    case "ISSUE":
      return "bg-rose-50 text-rose-700 ring-rose-200";
    case "DELAY":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "NO_SHOW":
      return "bg-slate-100 text-slate-700 ring-slate-200";
    case "NOTE":
      return "bg-cyan-50 text-cyan-700 ring-cyan-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    RESERVATION_NOTE_CREATED: "현장 메모 생성",
    RESERVATION_NOTE_REOPENED: "현장 메모 재오픈",
    RESERVATION_NOTE_RESOLVED: "현장 메모 해결",
  };
  return labels[action] ?? action;
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

function hasObjectValues(value: Record<string, unknown>) {
  return Object.keys(value).length > 0;
}

export default async function AdminReservationDetailPage(props: PageProps) {
  const { id } = await props.params;
  const detail = await getAdminReservationDetail(id);

  if (!detail) {
    notFound();
  }

  const {
    reservation,
    customer,
    checkin,
    checkout,
    payments,
    partnerNotes,
    partnerAuditLogs,
    statusLogs,
    review,
    evidenceIssues,
  } = detail;
  const unresolvedPartnerNotes = partnerNotes.filter(
    (note) => !note.isResolved,
  );

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/reservations"
            className="text-sm font-semibold text-cyan-700 hover:text-cyan-600"
          >
            ← 예약 목록
          </Link>
          <p className="mt-5 text-sm font-semibold uppercase tracking-[0.28em] text-cyan-700">
            예약 상세
          </p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
            예약 및 증적 확인
          </h2>
          {evidenceIssues.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {evidenceIssues.map((issue) => (
                <span
                  key={issue}
                  className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200"
                >
                  {issue}
                </span>
              ))}
            </div>
          ) : (
            <span className="mt-3 inline-flex rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
              증적 완료
            </span>
          )}
          <p className="mt-2 max-w-3xl break-all font-mono text-xs text-slate-500">
            {reservation.id}
          </p>
        </div>
        <span
          className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 ${statusClass(
            reservation.status,
          )}`}
        >
          {reservation.status}
        </span>
      </header>

      <div className="grid gap-4 xl:grid-cols-4">
        {[
          ["정비소", reservation.partnerName],
          ["예약 방식", typeLabel(reservation.reservationType)],
          ["차량", reservation.vehicleLabel],
          [
            "총 금액",
            formatAdminCurrency(
              checkout?.totalSettlement ?? reservation.totalPrice,
            ),
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {label}
            </p>
            <p className="mt-3 text-xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      {reservation.status === "CONFIRMED" ? (
        <CancelReservationForm reservationId={reservation.id} />
      ) : reservation.status === "CANCELLED" ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm">
          이 예약은 이미 취소되었습니다. 상태 전환 로그에서 취소 사유를 확인할
          수 있습니다.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-2xl font-semibold text-slate-950">예약 정보</h3>
          <dl className="mt-5 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
            <div>
              <dt className="text-slate-500">베이</dt>
              <dd className="mt-1 text-slate-950">{reservation.bayName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">예약 생성</dt>
              <dd className="mt-1 text-slate-950">
                {formatAdminDateTime(reservation.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">시작</dt>
              <dd className="mt-1 text-slate-950">
                {formatAdminDateTime(reservation.startTime)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">종료</dt>
              <dd className="mt-1 text-slate-950">
                {formatAdminDateTime(reservation.endTime)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">예약 결제 금액</dt>
              <dd className="mt-1 text-slate-950">
                {formatAdminCurrency(reservation.totalPrice)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">예약자</dt>
              <dd className="mt-1 text-slate-950">{customer.name}</dd>
            </div>
            <div>
              <dt className="text-slate-500">이메일</dt>
              <dd className="mt-1 break-all text-slate-950">
                {customer.email}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">연락처</dt>
              <dd className="mt-1 text-slate-950">{customer.phone}</dd>
            </div>
            <div>
              <dt className="text-slate-500">사용자 ID</dt>
              <dd className="mt-1 break-all font-mono text-xs text-slate-600">
                {customer.id}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-2xl font-semibold text-slate-950">정산 내역</h3>
          {checkout ? (
            <dl className="mt-5 space-y-3 text-sm text-slate-700">
              <div className="flex justify-between">
                <dt>기본 금액</dt>
                <dd className="text-slate-950">
                  {formatAdminCurrency(checkout.basePrice)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>추가 요금</dt>
                <dd className="text-slate-950">
                  {formatAdminCurrency(checkout.extraFee)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>카 마스터 검수</dt>
                <dd className="text-slate-950">
                  {formatAdminCurrency(checkout.helperVerifyFee)}
                </dd>
              </div>
              <div className="border-t border-slate-200 pt-3">
                <div className="flex justify-between text-xl font-semibold">
                  <dt className="text-slate-950">총 정산</dt>
                  <dd className="text-cyan-700">
                    {formatAdminCurrency(checkout.totalSettlement)}
                  </dd>
                </div>
              </div>
              <div className="pt-2 text-xs text-slate-500">
                정산 완료 {formatAdminDateTime(checkout.completedAt)}
              </div>
              <div className="border-t border-slate-200 pt-3">
                <div className="flex justify-between">
                  <dt>예약 시 결제</dt>
                  <dd className="text-slate-950">
                    {formatAdminCurrency(reservation.totalPrice)}
                  </dd>
                </div>
                <div className="mt-2 flex justify-between">
                  <dt>추가 결제</dt>
                  <dd className="text-rose-700">
                    {formatAdminCurrency(
                      Math.max(
                        0,
                        checkout.totalSettlement - reservation.totalPrice,
                      ),
                    )}
                  </dd>
                </div>
              </div>
            </dl>
          ) : (
            <p className="mt-5 rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">
              체크아웃 정산 row가 아직 없습니다.
            </p>
          )}
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-2xl font-semibold text-slate-950">
          결제 거래 내역
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          예약 선결제와 체크아웃 사후정산 결제 상태를 함께 확인합니다.
        </p>
        {payments.length === 0 ? (
          <p className="mt-5 rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">
            결제 row가 없습니다.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">결제 구분</th>
                  <th className="px-4 py-3">결제사</th>
                  <th className="px-4 py-3">수단</th>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3 text-right">금액</th>
                  <th className="px-4 py-3">승인 시각</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {payments.map((payment) => (
                  <tr key={payment.id} className="text-slate-800">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-950">
                        {payment.purpose === "RESERVATION"
                          ? "예약 결제"
                          : "추가 정산 결제"}
                      </p>
                      <p className="mt-1 break-all font-mono text-[11px] text-slate-500">
                        {payment.id}
                      </p>
                    </td>
                    <td className="px-4 py-3">{payment.provider}</td>
                    <td className="px-4 py-3">{payment.method}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                          payment.status === "RESERVATION_CONFIRMED" ||
                          payment.status === "SETTLEMENT_CONFIRMED"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : payment.status === "READY" ||
                                payment.status === "APPROVED"
                              ? "bg-amber-50 text-amber-700 ring-amber-200"
                              : "bg-slate-100 text-slate-700 ring-slate-200"
                        }`}
                      >
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-950">
                      {formatAdminCurrency(payment.amount)}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {payment.approvedAt
                        ? formatAdminDateTime(payment.approvedAt)
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        className={`rounded-3xl border p-6 ${
          unresolvedPartnerNotes.length > 0
            ? "border-rose-200 bg-rose-50"
            : "border-slate-200 bg-white shadow-sm"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-2xl font-semibold text-slate-950">
              파트너 현장 메모
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              정비소 운영자가 남긴 현장 메모, 이슈, 지연, 노쇼 기록입니다.
            </p>
          </div>
          <span
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              unresolvedPartnerNotes.length > 0
                ? "bg-rose-300 text-slate-950"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            {unresolvedPartnerNotes.length > 0
              ? `미해결 ${unresolvedPartnerNotes.length}`
              : "미해결 이슈 없음"}
          </span>
        </div>

        {partnerNotes.length === 0 ? (
          <p className="mt-5 rounded-2xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
            정비소 측 현장 기록이 없습니다.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {partnerNotes.map((note) => (
              <article
                key={note.id}
                className={`rounded-2xl border p-4 ${
                  note.isResolved
                    ? "border-slate-200 bg-white"
                    : "border-rose-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${partnerNoteClass(
                        note.noteType,
                      )}`}
                    >
                      {partnerNoteLabel(note.noteType)}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        note.isResolved
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      {note.isResolved ? "해결" : "미해결"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {formatAdminDateTime(note.createdAt)}
                  </p>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {note.body}
                </p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                  {note.authorUserId ? (
                    <span className="break-all">
                      작성자 {note.authorUserId}
                    </span>
                  ) : null}
                  {note.resolvedAt ? (
                    <span>
                      해결 {formatAdminDateTime(note.resolvedAt)}
                      {note.resolvedBy ? ` · ${note.resolvedBy}` : ""}
                    </span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-2xl font-semibold text-slate-950">
              파트너 운영 변경 이력
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              정비소 운영자가 이 예약과 연결해 수행한 운영 변경 이력입니다.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
            {partnerAuditLogs.length}건
          </span>
        </div>

        {partnerAuditLogs.length === 0 ? (
          <p className="mt-5 rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">
            이 예약에 연결된 partner-admin audit 로그가 없습니다.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {partnerAuditLogs.map((log) => (
              <article
                key={log.id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
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
                        {log.targetType}
                      </span>
                    </div>
                    <p className="mt-3 break-all font-mono text-xs text-slate-500">
                      {log.targetId}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">
                    {formatAdminDateTime(log.createdAt)}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                  {log.actorUserId ? (
                    <span className="break-all">Actor {log.actorUserId}</span>
                  ) : null}
                  <span className="break-all">Audit {log.id}</span>
                </div>
                {hasObjectValues(log.beforeState) ||
                hasObjectValues(log.afterState) ? (
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {hasObjectValues(log.beforeState) ? (
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Before
                        </p>
                        <pre className="overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-200">
                          {JSON.stringify(log.beforeState, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                    {hasObjectValues(log.afterState) ? (
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          After
                        </p>
                        <pre className="overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-200">
                          {JSON.stringify(log.afterState, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {hasObjectValues(log.metadata) ? (
                  <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-200">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-2xl font-semibold text-slate-950">
          Check-in Evidence
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          {checkin
            ? `Checked in ${formatAdminDateTime(checkin.checkedInAt)}`
            : "체크인 증적이 아직 없습니다."}
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <EvidenceImage label="Front" url={checkin?.frontImg ?? null} />
          <EvidenceImage label="Rear" url={checkin?.rearImg ?? null} />
          <EvidenceImage label="Left" url={checkin?.leftImg ?? null} />
          <EvidenceImage label="Right" url={checkin?.rightImg ?? null} />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-2xl font-semibold text-slate-950">
          Checkout Evidence
        </h3>
        <div className="mt-5 grid gap-4 lg:grid-cols-[0.75fr_1fr]">
          <div className="space-y-3">
            <ChecklistItem
              label="공구 반납"
              checked={Boolean(checkout?.toolCheckCompleted)}
            />
            <ChecklistItem
              label="베이 청소"
              checked={Boolean(checkout?.cleaningCompleted)}
            />
            <ChecklistItem
              label="폐유/폐기물 처리"
              checked={Boolean(checkout?.wasteDisposalCompleted)}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <EvidenceImage
              label="Checkout photo 1"
              url={checkout?.checkoutPhoto1 ?? null}
            />
            <EvidenceImage
              label="Checkout photo 2"
              url={checkout?.checkoutPhoto2 ?? null}
            />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-2xl font-semibold text-slate-950">
          Customer Review
        </h3>
        {review ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xl font-semibold text-slate-950">
                <RatingStars rating={review.rating} />{" "}
                <span className="ml-2 text-base text-slate-700">
                  {review.rating}/5
                </span>
              </p>
              <p className="text-xs text-slate-500">
                {formatAdminDateTime(review.createdAt)}
              </p>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {review.comment || "코멘트 없이 별점만 남긴 리뷰입니다."}
            </p>
          </div>
        ) : (
          <p className="mt-5 rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">
            아직 작성된 리뷰가 없습니다.
          </p>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-2xl font-semibold text-slate-950">
          Status Timeline
        </h3>
        <div className="mt-5 space-y-3">
          {statusLogs.length === 0 ? (
            <p className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">
              상태 전환 로그가 없습니다.
            </p>
          ) : (
            statusLogs.map((log) => (
              <article
                key={log.id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-mono text-sm text-slate-950">
                    {log.fromStatus ?? "NULL"} → {log.toStatus}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatAdminDateTime(log.createdAt)}
                  </p>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {log.actorType}
                  {log.actorUserId ? ` · ${log.actorUserId}` : ""}
                  {log.reason ? ` · ${log.reason}` : ""}
                </p>
                {Object.keys(log.metadata).length > 0 ? (
                  <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-200">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>
    </section>
  );
}
