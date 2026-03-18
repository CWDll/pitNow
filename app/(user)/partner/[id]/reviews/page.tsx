import Link from "next/link";
import { notFound } from "next/navigation";

import { hasSupabaseEnv, supabase } from "@/src/lib/supabase";
import { getGarageById } from "../../../_data/mock-garages";

interface PartnerReviewListPageProps {
  params: Promise<{ id: string }>;
}

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
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

async function fetchAllReviewsByBayId(bayId: string): Promise<ReviewRow[]> {
  if (!hasSupabaseEnv) {
    return [];
  }

  const { data: reservations, error: reservationError } = await supabase
    .from("reservations")
    .select("id")
    .eq("bay_id", bayId)
    .limit(500)
    .returns<Array<{ id: string }>>();

  if (reservationError) {
    console.error("RESERVATION LOOKUP ERROR:", reservationError);
    return [];
  }

  const reservationIds = (reservations ?? []).map((item) => item.id);

  if (reservationIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("reviews")
    .select("id, rating, comment, created_at")
    .in("reservation_id", reservationIds)
    .order("created_at", { ascending: false })
    .returns<ReviewRow[]>();

  if (error) {
    console.error("REVIEW LIST LOOKUP ERROR:", error);
    return [];
  }

  return data ?? [];
}

export default async function PartnerReviewListPage({ params }: PartnerReviewListPageProps) {
  const { id } = await params;
  const garage = getGarageById(id);

  if (!garage) {
    notFound();
  }

  const reviews = await fetchAllReviewsByBayId(garage.bayId);
  const average =
    reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : garage.rating;

  return (
    <section className="pb-24">
      <header className="mb-4 flex items-center gap-2">
        <Link href={`/partner/${garage.id}`} className="text-2xl text-zinc-700" aria-label="뒤로가기">
          ←
        </Link>
        <h1 className="text-3xl font-semibold text-zinc-900">전체 후기</h1>
      </header>

      <div className="rounded-2xl bg-zinc-100 p-4">
        <p className="text-xl font-semibold text-zinc-900">{garage.name}</p>
        <p className="mt-2 text-lg text-zinc-700">★ {average.toFixed(1)} · 후기 {reviews.length}개</p>
      </div>

      <div className="mt-4 space-y-3">
        {reviews.length === 0 ? (
          <p className="rounded-2xl border border-zinc-200 bg-white p-4 text-base text-zinc-600">
            등록된 후기가 없습니다.
          </p>
        ) : (
          reviews.map((review) => (
            <article key={review.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="text-lg text-amber-500">{renderStars(review.rating)}</p>
              <p className="mt-1 text-sm text-zinc-500">{formatDate(review.created_at)}</p>
              <p className="mt-2 text-base text-zinc-700">{review.comment || "코멘트 없음"}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
