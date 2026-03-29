"use client";

import { useState } from "react";
import Link from "next/link";

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
    carLabel: "등록 차량",
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

  return `/complete?${query.toString()}`;
}

function ReservationCard({ item }: { item: ReservationListItem }) {
  return (
    <Link href={buildReservationHref(item)} className="block">
      <article className="rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-2xl font-semibold text-zinc-900">{item.garageName}</h3>
            <p className="mt-1 text-lg text-zinc-600">{item.workTitle}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusClass(item.status)}`}>
            {getStatusLabel(item.status)}
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
      </article>
    </Link>
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
  const { upcomingReservations, pastReservations } = props;
  const [activeTab, setActiveTab] = useState<ReservationTab>("upcoming");

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
          activeItems.map((item) => <ReservationCard key={item.id} item={item} />)
        )}
      </section>
    </section>
  );
}
