import Link from "next/link";
import { notFound } from "next/navigation";

import { ReviewCard } from "@/app/(user)/_components/review-card";
import { getPartnerProfileById } from "@/src/lib/partners";
import { getPublicReviews } from "@/src/lib/public-reviews";

interface PartnerReviewListPageProps {
  params: Promise<{ id: string }>;
}

export default async function PartnerReviewListPage({ params }: PartnerReviewListPageProps) {
  const { id } = await params;
  const garage = await getPartnerProfileById(id);

  if (!garage) {
    notFound();
  }

  const reviews = await getPublicReviews(garage.id);
  const average =
    reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : 0;

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
          reviews.map((review) => <ReviewCard key={review.id} review={review} />)
        )}
      </div>
    </section>
  );
}
