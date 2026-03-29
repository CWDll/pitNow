import Link from "next/link";
import { notFound } from "next/navigation";

import { supabase } from "@/src/lib/supabase";
import { getGarageById, workOptions } from "../../_data/mock-garages";

interface PartnerDetailPageProps {
  params: Promise<{ id: string }>;
}

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

function levelClass(level: "초급" | "중급"): string {
  return level === "초급"
    ? "bg-blue-50 text-blue-600"
    : "bg-amber-50 text-amber-600";
}

function formatPrice(price: number): string {
  return `${price.toLocaleString("ko-KR")}원`;
}

function renderStars(rating: number): string {
  const safe = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(safe) + "☆".repeat(5 - safe);
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);

  if (Number.isNaN(parsed.getTime())) {
    return "날짜 정보 없음";
  }

  return parsed.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

async function getReviewsByBayId(bayId: string) {
  const { data: reservations, error: reservationError } = await supabase
    .from("reservations")
    .select("id")
    .eq("bay_id", bayId)
    .limit(200)
    .returns<Array<{ id: string }>>();

  if (reservationError) {
    console.error("RESERVATION LOOKUP ERROR:", reservationError);
    return { reviews: [] as ReviewRow[], totalCount: 0 };
  }

  const reservationIds = (reservations ?? []).map((item) => item.id);

  if (reservationIds.length === 0) {
    return { reviews: [] as ReviewRow[], totalCount: 0 };
  }

  const { count, error: countError } = await supabase
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .in("reservation_id", reservationIds);

  if (countError) {
    console.error("REVIEW COUNT ERROR:", countError);
  }

  const { data: reviewRows, error: reviewError } = await supabase
    .from("reviews")
    .select("id, rating, comment, created_at")
    .in("reservation_id", reservationIds)
    .order("created_at", { ascending: false })
    .limit(3)
    .returns<ReviewRow[]>();

  if (reviewError) {
    console.error("REVIEW LOOKUP ERROR:", reviewError);
    return { reviews: [] as ReviewRow[], totalCount: count ?? 0 };
  }

  return {
    reviews: reviewRows ?? [],
    totalCount: count ?? reviewRows?.length ?? 0,
  };
}

export default async function PartnerDetailPage({ params }: PartnerDetailPageProps) {
  const { id } = await params;
  const garage = getGarageById(id);

  if (!garage) {
    notFound();
  }

  const { reviews, totalCount } = await getReviewsByBayId(garage.bayId);
  const averageRating =
    reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : garage.rating;

  return (
    <section className="pb-24">
      <div className="-mx-4 mb-4 flex h-44 items-center justify-center bg-blue-100 text-zinc-500">
        정비소 이미지
      </div>

      <div className="space-y-2">
        <h1 className="text-4xl font-semibold text-zinc-900">{garage.name}</h1>
        <p className="text-lg text-zinc-700">
          ★ {averageRating.toFixed(1)} ({totalCount || garage.reviewCount}개 후기)
        </p>
        <p className="text-lg text-zinc-700">📍 {garage.address}</p>
        <p className="text-lg text-zinc-700">🕒 {garage.hours}</p>
        <p className="text-lg text-zinc-700">🚗 베이 {garage.bayCount}개 · 주차 가능</p>
        <p className="text-lg text-zinc-700">📞 {garage.phone}</p>
      </div>

      <div className="mt-6 space-y-3">
        <h2 className="text-2xl font-semibold text-zinc-900">추천 패키지</h2>
        {workOptions.slice(0, 3).map((option) => (
          <article key={option.id} className="rounded-2xl bg-zinc-100 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-2xl font-medium text-zinc-900">{option.title}</p>
                <p className="mt-1 text-lg text-zinc-600">{option.durationLabel}</p>
              </div>
              <span className="text-xl font-semibold text-blue-600">{formatPrice(garage.hourlyPrice)}</span>
            </div>
            <div className="mt-2 flex gap-2">
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${levelClass(option.level)}`}>
                {option.level}
              </span>
              {option.helperRequired ? (
                <span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-medium text-rose-600">
                  헬퍼 필수
                </span>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <div className="mt-6 rounded-2xl bg-zinc-100 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-2xl font-semibold text-zinc-900">후기</h3>
          <Link href={`/partner/${garage.id}/reviews`} className="text-sm font-semibold text-blue-600">
            전체보기
          </Link>
        </div>

        {reviews.length === 0 ? (
          <p className="text-base text-zinc-600">아직 등록된 후기가 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <article key={review.id} className="rounded-xl bg-white p-3">
                <p className="text-lg text-amber-500">{renderStars(review.rating)}</p>
                <p className="mt-1 text-sm text-zinc-500">{formatDate(review.created_at)}</p>
                <p className="mt-2 text-base text-zinc-700">{review.comment || "코멘트 없음"}</p>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-107.5 -translate-x-1/2 bg-white px-4 pb-3 pt-2">
        <Link
          href={`/partner/${garage.id}/work`}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white"
        >
          예약하기
        </Link>
      </div>
    </section>
  );
}
