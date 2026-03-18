import Link from "next/link";

interface ReservationItem {
  id: string;
  garageName: string;
  workTitle: string;
  dateLabel: string;
  bayLabel?: string;
  reservationType: "SELF_SERVICE" | "SHOP_SERVICE";
  status: "예약확정" | "이용중" | "완료";
}

const upcomingReservations: ReservationItem[] = [
  {
    id: "rsv-1",
    garageName: "강남 셀프정비소",
    workTitle: "엔진오일 교환",
    dateLabel: "3/18(수) 14:00",
    bayLabel: "3번 베이",
    reservationType: "SELF_SERVICE",
    status: "예약확정",
  },
  {
    id: "rsv-2",
    garageName: "서초 DIY 카센터",
    workTitle: "브레이크 케어 패키지",
    dateLabel: "3/18(수) 16:30",
    reservationType: "SHOP_SERVICE",
    status: "이용중",
  },
];

const pastReservations: ReservationItem[] = [
  {
    id: "rsv-3",
    garageName: "서초 DIY 카센터",
    workTitle: "시즌 케어 패키지",
    dateLabel: "3/11(수) 11:00",
    reservationType: "SHOP_SERVICE",
    status: "완료",
  },
];

function statusClass(status: ReservationItem["status"]): string {
  if (status === "예약확정") {
    return "bg-blue-50 text-blue-600";
  }

  if (status === "이용중") {
    return "bg-indigo-50 text-indigo-600";
  }

  return "bg-emerald-50 text-emerald-600";
}

function modeClass(type: ReservationItem["reservationType"]): string {
  return type === "SELF_SERVICE" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700";
}

function buildReservationHref(item: ReservationItem): string {
  const query = new URLSearchParams({
    reservationId: item.id,
    reservationType: item.reservationType,
    garageName: item.garageName,
    dateLabel: item.dateLabel,
    workTitle: item.workTitle,
    totalPrice: item.reservationType === "SELF_SERVICE" ? "15000" : "49000",
  });

  if (item.bayLabel) {
    query.set("bayLabel", item.bayLabel);
  }

  if (item.status === "예약확정") {
    return `/reservation-complete?${query.toString()}`;
  }

  if (item.status === "이용중") {
    return `/in-use?${query.toString()}`;
  }

  return `/complete?${query.toString()}`;
}

function ReservationCard({ item }: { item: ReservationItem }) {
  return (
    <Link href={buildReservationHref(item)} className="block">
      <article className="rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-2xl font-semibold text-zinc-900">{item.garageName}</h3>
            <p className="mt-1 text-lg text-zinc-600">{item.workTitle}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusClass(item.status)}`}>
            {item.status}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${modeClass(item.reservationType)}`}>
            {item.reservationType === "SELF_SERVICE" ? "셀프 정비" : "전문가 맡기기"}
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

export default function ReservationListPage() {
  return (
    <section className="space-y-6 pb-4">
      <header className="space-y-1">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">내 예약</h1>
      </header>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-zinc-700">다가오는 예약</h2>
        {upcomingReservations.map((item) => (
          <ReservationCard key={item.id} item={item} />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-zinc-700">지난 이용</h2>
        {pastReservations.map((item) => (
          <ReservationCard key={item.id} item={item} />
        ))}
      </section>
    </section>
  );
}
