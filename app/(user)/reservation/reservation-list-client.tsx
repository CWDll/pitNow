"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";

import { authFetch } from "@/src/lib/auth-fetch";

type ReservationStatus = "CONFIRMED" | "CHECKED_IN" | "IN_USE" | "COMPLETED" | "CANCELLED";
type ReservationType = "SELF_SERVICE" | "SHOP_SERVICE";

export interface ReservationListItem {
  id: string;
  garageName: string;
  workTitle: string;
  dateLabel: string;
  bayLabel?: string;
  reservationType: ReservationType;
  status: ReservationStatus;
  totalPrice: number;
  startTime: string;
  endTime: string;
  blockedMinutes: number;
  carLabel: string;
  settlementAmountDue: number;
  settlementPaidAmount: number;
  settlementPaymentStatus: string | null;
  reservationPaymentStatus: string | null;
  reservationRefundedAt: string | null;
}

type ReservationTab = "upcoming" | "history";

function getStatusLabel(status: ReservationStatus): string {
  switch (status) {
    case "CONFIRMED":
      return "예약 확정";
    case "CHECKED_IN":
    case "IN_USE":
      return "이용중";
    case "COMPLETED":
      return "완료";
    case "CANCELLED":
      return "취소됨";
    default:
      return status;
  }
}

function statusClass(status: ReservationStatus): string {
  if (status === "CONFIRMED") {
    return "bg-blue-50 text-blue-600";
  }

  if (status === "CHECKED_IN" || status === "IN_USE") {
    return "bg-indigo-50 text-indigo-600";
  }

  if (status === "COMPLETED") {
    return "bg-emerald-50 text-emerald-600";
  }

  return "bg-zinc-100 text-zinc-600";
}

function modeClass(type: ReservationType): string {
  return type === "SELF_SERVICE" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700";
}

function getReservationTypeLabel(type: ReservationType): string {
  return type === "SELF_SERVICE" ? "셀프 정비" : "전문가 맡기기";
}

function getUnpaidSettlementAmount(item: ReservationListItem): number {
  if (item.status !== "COMPLETED") {
    return 0;
  }

  return Math.max(0, item.settlementAmountDue - item.settlementPaidAmount);
}

function buildSettlementPaymentHref(item: ReservationListItem): string {
  return `/settlement-payment?reservationId=${item.id}`;
}

function getRefundLabel(status: string | null): string {
  switch (status) {
    case "REFUNDED":
      return "환불 완료";
    case "REFUND_PENDING":
      return "환불 확인 필요";
    case "RESERVATION_CONFIRMED":
      return "결제 완료";
    case "FAILED":
      return "결제 실패";
    case "CANCELLED":
      return "결제 취소";
    default:
      return "결제 내역 없음";
  }
}

function refundClass(status: string | null): string {
  if (status === "REFUNDED") {
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }

  if (status === "REFUND_PENDING") {
    return "border-amber-100 bg-amber-50 text-amber-700";
  }

  return "border-zinc-100 bg-zinc-50 text-zinc-600";
}

function formatRefundedAt(value: string | null): string {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildReservationHref(item: ReservationListItem): string {
  const query = new URLSearchParams({
    reservationId: item.id,
    reservationType: item.reservationType,
    garageName: item.garageName,
    dateLabel: item.dateLabel,
    workTitle: item.workTitle,
    totalPrice: String(item.totalPrice),
    startTime: item.startTime,
    endTime: item.endTime,
    blockedMinutes: String(item.blockedMinutes),
    carLabel: item.carLabel,
  });

  if (item.bayLabel) {
    query.set("bayLabel", item.bayLabel);
  }

  if (item.status === "CONFIRMED") {
    return `/reservation-complete?${query.toString()}`;
  }

  if (item.status === "CHECKED_IN" || item.status === "IN_USE") {
    return `/in-use?${query.toString()}`;
  }

  if (getUnpaidSettlementAmount(item) > 0) {
    return buildSettlementPaymentHref(item);
  }

  return `/complete?${query.toString()}`;
}

interface ReservationCardProps {
  item: ReservationListItem;
  onCancelled: (
    reservationId: string,
    refund: {
      paymentStatus?: string;
    } | null,
  ) => void;
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const error = (payload as { error?: unknown }).error;

  if (typeof error === "string") {
    return error;
  }

  if (
    error &&
    typeof error === "object" &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return null;
}

function ReservationCard({ item, onCancelled }: ReservationCardProps) {
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const canCancel = item.status === "CONFIRMED";
  const unpaidSettlementAmount = getUnpaidSettlementAmount(item);
  const hasUnpaidSettlement = unpaidSettlementAmount > 0;
  const statusBadgeClass = hasUnpaidSettlement
    ? "bg-red-50 text-red-600"
    : statusClass(item.status);

  async function handleCancelSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCancelError("");

    const normalizedReason = cancelReason.trim();

    if (!normalizedReason) {
      setCancelError("취소 사유를 입력해 주세요.");
      return;
    }

    setIsCancelling(true);

    try {
      const response = await authFetch(`/api/reservations/${item.id}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: normalizedReason,
        }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        setCancelError(
          extractErrorMessage(payload) ?? "예약 취소에 실패했습니다.",
        );
        return;
      }

      setShowCancelForm(false);
      setCancelReason("");
      onCancelled(
        item.id,
        payload && typeof payload === "object"
          ? ((payload as { refund?: { paymentStatus?: string } }).refund ?? null)
          : null,
      );
    } catch {
      setCancelError("예약 취소 처리 중 네트워크 오류가 발생했습니다.");
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300">
      <Link href={buildReservationHref(item)} className="block">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-2xl font-semibold text-zinc-900">{item.garageName}</h3>
            <p className="mt-1 text-lg text-zinc-600">{item.workTitle}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusBadgeClass}`}>
            {hasUnpaidSettlement ? "정산 미완료" : getStatusLabel(item.status)}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${modeClass(item.reservationType)}`}>
            {getReservationTypeLabel(item.reservationType)}
          </span>
        </div>

        <p className="mt-4 text-lg text-zinc-500">
          {item.dateLabel}
          {item.bayLabel ? ` · ${item.bayLabel}` : ""}
        </p>
      </Link>

      {hasUnpaidSettlement ? (
        <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-600">
            추가 정산 {unpaidSettlementAmount.toLocaleString()}원이 아직 남아있습니다.
          </p>
          <p className="mt-1 text-xs leading-5 text-red-500">
            결제창을 닫았거나 테스트 결제가 중단된 경우 여기서 다시 이어갈 수 있습니다.
          </p>
          <Link
            href={buildSettlementPaymentHref(item)}
            className="mt-3 flex h-11 items-center justify-center rounded-2xl bg-red-500 text-sm font-semibold text-white"
          >
            추가 정산 결제하기
          </Link>
        </div>
      ) : null}

      {item.status === "CANCELLED" ? (
        <div
          className={`mt-4 rounded-2xl border p-4 ${refundClass(
            item.reservationPaymentStatus,
          )}`}
        >
          <p className="text-sm font-semibold">
            {getRefundLabel(item.reservationPaymentStatus)}
          </p>
          <p className="mt-1 text-xs leading-5 opacity-80">
            {item.reservationPaymentStatus === "REFUNDED"
              ? `${formatRefundedAt(item.reservationRefundedAt)} 환불 처리되었습니다.`
              : item.reservationPaymentStatus === "REFUND_PENDING"
                ? "결제사 환불 확인이 필요합니다. 운영자가 확인 후 정리합니다."
                : "취소된 예약의 결제 상태입니다."}
          </p>
        </div>
      ) : null}

      {canCancel ? (
        <div className="mt-4 border-t border-zinc-100 pt-4">
          {!showCancelForm ? (
            <button
              type="button"
              onClick={() => setShowCancelForm(true)}
              className="h-10 rounded-2xl bg-zinc-100 px-4 text-sm font-semibold text-zinc-700"
            >
              예약 취소
            </button>
          ) : (
            <form onSubmit={handleCancelSubmit} className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-zinc-700">
                  취소 사유
                </span>
                <textarea
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  maxLength={500}
                  className="mt-2 min-h-20 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none ring-blue-200 focus:ring-4"
                  placeholder="예: 일정 변경으로 취소"
                />
              </label>
              {cancelError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {cancelError}
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isCancelling}
                  className="h-10 rounded-2xl bg-zinc-950 px-4 text-sm font-semibold text-white disabled:bg-zinc-300 disabled:text-zinc-500"
                >
                  {isCancelling ? "취소 처리 중..." : "취소 확정"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCancelForm(false);
                    setCancelError("");
                  }}
                  className="h-10 rounded-2xl bg-zinc-100 px-4 text-sm font-semibold text-zinc-700"
                >
                  닫기
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </article>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-zinc-200 bg-white px-4 py-6 text-base text-zinc-500">
      {text}
    </p>
  );
}

export default function ReservationListClient(props: {
  upcomingReservations: ReservationListItem[];
  pastReservations: ReservationListItem[];
}) {
  const [upcomingReservations, setUpcomingReservations] = useState(
    props.upcomingReservations,
  );
  const [pastReservations, setPastReservations] = useState(
    props.pastReservations,
  );
  const [activeTab, setActiveTab] = useState<ReservationTab>("upcoming");

  function handleReservationCancelled(
    reservationId: string,
    refund: { paymentStatus?: string } | null,
  ) {
    setUpcomingReservations((current) => {
      const cancelledReservation = current.find((item) => item.id === reservationId);

      if (!cancelledReservation) {
        return current;
      }

      setPastReservations((pastCurrent) => [
        {
          ...cancelledReservation,
          status: "CANCELLED",
          reservationPaymentStatus:
            refund?.paymentStatus ?? cancelledReservation.reservationPaymentStatus,
          reservationRefundedAt:
            refund?.paymentStatus === "REFUNDED"
              ? new Date().toISOString()
              : cancelledReservation.reservationRefundedAt,
        },
        ...pastCurrent,
      ]);

      return current.filter((item) => item.id !== reservationId);
    });
  }

  const tabs: Array<{ id: ReservationTab; label: string; count: number }> = [
    { id: "upcoming", label: "다가오는 예약", count: upcomingReservations.length },
    { id: "history", label: "지난 이용", count: pastReservations.length },
  ];

  const activeItems = activeTab === "upcoming" ? upcomingReservations : pastReservations;

  return (
    <section className="space-y-6 pb-4">
      <header className="space-y-1">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">내 예약</h1>
        <p className="text-sm text-zinc-500">최신 예약이 항상 위에 표시됩니다.</p>
      </header>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-zinc-100 p-1">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          );
        })}
      </div>

      <section className="space-y-3">
        {activeItems.length === 0 ? (
          <EmptyState
            text={
              activeTab === "upcoming"
                ? "아직 잡힌 예약이 없습니다."
                : "아직 완료된 이용 내역이 없습니다."
            }
          />
        ) : (
          activeItems.map((item) => (
            <ReservationCard
              key={item.id}
              item={item}
              onCancelled={handleReservationCancelled}
            />
          ))
        )}
      </section>
    </section>
  );
}
