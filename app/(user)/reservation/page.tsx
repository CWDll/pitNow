import Link from "next/link";

interface ReservationItem {
  id: string;
  garageName: string;
  workTitle: string;
  dateLabel: string;
  bayLabel: string;
  status: "예약확정" | "사용중" | "완료";
}

const upcomingReservations: ReservationItem[] = [
  {
    id: "rsv-1",
    garageName: "강남 셀프정비소",
    workTitle: "엔진오일 교환",
    dateLabel: "2/28(금) 14:00",
    bayLabel: "3번 베이",
    status: "예약확정",
  },
  {
    id: "rsv-2",
    garageName: "서초 DIY 카센터",
    workTitle: "브레이크 패드 교환",
    dateLabel: "오늘 16:30",
    bayLabel: "2번 베이",
    status: "사용중",
  },
];

const pastReservations: ReservationItem[] = [
  {
    id: "rsv-3",
    garageName: "서초 DIY 카센터",
    workTitle: "에어필터 교환",
    dateLabel: "2/15(토) 11:00",
    bayLabel: "4번 베이",
    status: "완료",
  },
];

function statusClass(status: ReservationItem["status"]): string {
  if (status === "예약확정") {
    return "bg-blue-50 text-blue-600";
  }

  if (status === "사용중") {
    return "bg-indigo-50 text-indigo-600";
  }

  return "bg-emerald-50 text-emerald-600";
}

function buildReservationCompleteHref(item: ReservationItem): string {
  const query = new URLSearchParams({
    reservationId: item.id,
    garageName: item.garageName,
    dateLabel: item.dateLabel,
    bayLabel: item.bayLabel,
    workTitle: item.workTitle,
    totalPrice: "15000",
  });

  return `/reservation-complete?${query.toString()}`;
}

function buildInUseHref(item: ReservationItem): string {
  const query = new URLSearchParams({
    reservationId: item.id,
    garageName: item.garageName,
    bayLabel: item.bayLabel,
    workTitle: item.workTitle,
    totalPrice: "15000",
  });

  return `/in-use?${query.toString()}`;
}

function ReservationCard({ item }: { item: ReservationItem }) {
  const cardBody = (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-2xl font-semibold text-zinc-900">{item.garageName}</h3>
          <p className="mt-1 text-lg text-zinc-600">{item.workTitle}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusClass(item.status)}`}>
          {item.status}
        </span>
      </div>

      <p className="mt-4 text-lg text-zinc-500">
        📅 {item.dateLabel} &nbsp;&nbsp; 📍 {item.bayLabel}
      </p>
    </article>
  );

  if (item.status === "예약확정") {
    return (
      <Link href={buildReservationCompleteHref(item)} className="block">
        {cardBody}
      </Link>
    );
  }

  if (item.status === "사용중") {
    return (
      <Link href={buildInUseHref(item)} className="block">
        {cardBody}
      </Link>
    );
  }

  return cardBody;
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
