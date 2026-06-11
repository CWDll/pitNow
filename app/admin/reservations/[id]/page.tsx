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
    return "bg-blue-400/15 text-blue-200 ring-blue-300/30";
  }

  if (status === "CHECKED_IN" || status === "IN_USE") {
    return "bg-cyan-400/15 text-cyan-200 ring-cyan-300/30";
  }

  if (status === "COMPLETED") {
    return "bg-emerald-400/15 text-emerald-200 ring-emerald-300/30";
  }

  return "bg-slate-400/15 text-slate-200 ring-slate-300/30";
}

function typeLabel(type: AdminReservationType): string {
  return type === "SELF_SERVICE" ? "Self Service" : "Shop Service";
}

function EvidenceImage(props: { label: string; url: string | null }) {
  const { label, url } = props;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            className="h-36 w-full rounded-xl object-cover ring-1 ring-white/10"
          />
        </a>
      ) : (
        <div className="flex h-36 items-center justify-center rounded-xl bg-slate-950 text-sm text-slate-500 ring-1 ring-white/10">
          No evidence
        </div>
      )}
    </div>
  );
}

function ChecklistItem(props: { label: string; checked: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white/[0.04] px-4 py-3">
      <span className="text-slate-300">{props.label}</span>
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

export default async function AdminReservationDetailPage(props: PageProps) {
  const { id } = await props.params;
  const detail = await getAdminReservationDetail(id);

  if (!detail) {
    notFound();
  }

  const { reservation, checkin, checkout, statusLogs, review, evidenceIssues } =
    detail;

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/reservations"
            className="text-sm font-semibold text-cyan-300 hover:text-cyan-200"
          >
            ← Reservations
          </Link>
          <p className="mt-5 text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">
            Reservation Detail
          </p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white">
            Evidence Drill-down
          </h2>
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
          ["Partner", reservation.partnerName],
          ["Type", typeLabel(reservation.reservationType)],
          ["Vehicle", reservation.vehicleLabel],
          ["Total", formatAdminCurrency(checkout?.totalSettlement ?? reservation.totalPrice)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-3xl border border-white/10 bg-slate-900 p-5"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {label}
            </p>
            <p className="mt-3 text-xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>

      {reservation.status === "CONFIRMED" ? (
        <CancelReservationForm reservationId={reservation.id} />
      ) : reservation.status === "CANCELLED" ? (
        <div className="rounded-3xl border border-slate-400/20 bg-slate-400/10 p-5 text-sm text-slate-300">
          이 예약은 이미 취소되었습니다. 상태 전환 로그에서 취소 사유를 확인할 수 있습니다.
        </div>
      ) : null}

      <section
        className={`rounded-3xl border p-5 ${
          evidenceIssues.length === 0
            ? "border-emerald-300/20 bg-emerald-300/10"
            : "border-amber-300/20 bg-amber-300/10"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p
              className={`text-sm font-semibold uppercase tracking-[0.2em] ${
                evidenceIssues.length === 0
                  ? "text-emerald-200"
                  : "text-amber-200"
              }`}
            >
              Evidence status
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              {evidenceIssues.length === 0
                ? "증적 완료"
                : `검토 필요 ${evidenceIssues.length}건`}
            </h3>
          </div>
          <span
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              evidenceIssues.length === 0
                ? "bg-emerald-300 text-slate-950"
                : "bg-amber-300 text-slate-950"
            }`}
          >
            {evidenceIssues.length === 0 ? "Complete" : "Review"}
          </span>
        </div>
        {evidenceIssues.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {evidenceIssues.map((issue) => (
              <span
                key={issue}
                className="rounded-full bg-slate-950/60 px-3 py-1 text-xs font-semibold text-amber-100 ring-1 ring-amber-200/20"
              >
                {issue}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <section className="rounded-3xl border border-white/10 bg-slate-900 p-6">
          <h3 className="text-2xl font-semibold text-white">Reservation</h3>
          <dl className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
            <div>
              <dt className="text-slate-500">Bay</dt>
              <dd className="mt-1 text-white">{reservation.bayName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Created</dt>
              <dd className="mt-1 text-white">
                {formatAdminDateTime(reservation.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Start</dt>
              <dd className="mt-1 text-white">
                {formatAdminDateTime(reservation.startTime)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">End</dt>
              <dd className="mt-1 text-white">
                {formatAdminDateTime(reservation.endTime)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Blocked Until</dt>
              <dd className="mt-1 text-white">
                {formatAdminDateTime(reservation.blockedUntil)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Base Reservation Price</dt>
              <dd className="mt-1 text-white">
                {formatAdminCurrency(reservation.totalPrice)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900 p-6">
          <h3 className="text-2xl font-semibold text-white">Settlement</h3>
          {checkout ? (
            <dl className="mt-5 space-y-3 text-sm text-slate-300">
              <div className="flex justify-between">
                <dt>Base</dt>
                <dd className="text-white">
                  {formatAdminCurrency(checkout.basePrice)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Extra</dt>
                <dd className="text-white">
                  {formatAdminCurrency(checkout.extraFee)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Helper verify</dt>
                <dd className="text-white">
                  {formatAdminCurrency(checkout.helperVerifyFee)}
                </dd>
              </div>
              <div className="border-t border-white/10 pt-3">
                <div className="flex justify-between text-xl font-semibold">
                  <dt className="text-white">Total</dt>
                  <dd className="text-cyan-200">
                    {formatAdminCurrency(checkout.totalSettlement)}
                  </dd>
                </div>
              </div>
              <div className="pt-2 text-xs text-slate-500">
                Completed {formatAdminDateTime(checkout.completedAt)}
              </div>
            </dl>
          ) : (
            <p className="mt-5 rounded-2xl bg-white/[0.04] p-4 text-sm text-slate-400">
              체크아웃 정산 row가 아직 없습니다.
            </p>
          )}
        </section>
      </div>

      <section className="rounded-3xl border border-white/10 bg-slate-900 p-6">
        <h3 className="text-2xl font-semibold text-white">Check-in Evidence</h3>
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

      <section className="rounded-3xl border border-white/10 bg-slate-900 p-6">
        <h3 className="text-2xl font-semibold text-white">Checkout Evidence</h3>
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

      <section className="rounded-3xl border border-white/10 bg-slate-900 p-6">
        <h3 className="text-2xl font-semibold text-white">Customer Review</h3>
        {review ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xl font-semibold text-white">
                <RatingStars rating={review.rating} />{" "}
                <span className="ml-2 text-base text-slate-300">
                  {review.rating}/5
                </span>
              </p>
              <p className="text-xs text-slate-500">
                {formatAdminDateTime(review.createdAt)}
              </p>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-300">
              {review.comment || "코멘트 없이 별점만 남긴 리뷰입니다."}
            </p>
          </div>
        ) : (
          <p className="mt-5 rounded-2xl bg-white/[0.04] p-4 text-sm text-slate-400">
            아직 작성된 리뷰가 없습니다.
          </p>
        )}
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-900 p-6">
        <h3 className="text-2xl font-semibold text-white">Status Timeline</h3>
        <div className="mt-5 space-y-3">
          {statusLogs.length === 0 ? (
            <p className="rounded-2xl bg-white/[0.04] p-4 text-sm text-slate-400">
              상태 전환 로그가 없습니다.
            </p>
          ) : (
            statusLogs.map((log) => (
              <article
                key={log.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-mono text-sm text-white">
                    {log.fromStatus ?? "NULL"} → {log.toStatus}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatAdminDateTime(log.createdAt)}
                  </p>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  {log.actorType}
                  {log.actorUserId ? ` · ${log.actorUserId}` : ""}
                  {log.reason ? ` · ${log.reason}` : ""}
                </p>
                {Object.keys(log.metadata).length > 0 ? (
                  <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-400">
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
