import Link from "next/link";
import { notFound } from "next/navigation";

import {
  formatMinutesLabel,
  getGarageById,
  getGarageShopPackages,
  selfWorkOptions,
} from "@/app/(user)/_data/mock-garages";
import { hasSupabaseEnv, supabase } from "@/src/lib/supabase";

interface PartnerDetailPageProps {
  params: Promise<{ id: string }>;
}

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

function formatPrice(price: number): string {
  return `${price.toLocaleString("ko-KR")}원`;
}

function renderStars(rating: number): string {
  const safe = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(safe) + "☆".repeat(5 - safe);
}

async function getRecentReviewsByPartnerId(partnerId: string): Promise<ReviewRow[]> {
  if (!hasSupabaseEnv) {
    return [];
  }

  const { data, error } = await supabase
    .from("reviews")
    .select("id, rating, comment, created_at")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(3)
    .returns<ReviewRow[]>();

  if (error) {
    console.error("REVIEW LOOKUP ERROR:", error);
    return [];
  }

  return data ?? [];
}

export default async function PartnerDetailPage({ params }: PartnerDetailPageProps) {
  const { id } = await params;
  const garage = getGarageById(id);

  if (!garage) {
    notFound();
  }

  const reviews = await getRecentReviewsByPartnerId(garage.id);
  const packages = getGarageShopPackages(garage.id);
  const averageRating =
    reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : garage.rating;

  return (
    <section className="pb-28">
      <div className="-mx-4 mb-4 h-48 rounded-b-[2rem] bg-[linear-gradient(135deg,#dbeafe_0%,#f8fafc_45%,#fde68a_100%)]" />

      <div className="space-y-2">
        <h1 className="text-4xl font-semibold text-zinc-900">{garage.name}</h1>
        <p className="text-lg text-zinc-700">
          {averageRating.toFixed(1)} · 리뷰 {reviews.length > 0 ? reviews.length : garage.reviewCount}개
        </p>
        <p className="text-lg text-zinc-700">{garage.address}</p>
        <p className="text-lg text-zinc-700">운영시간 {garage.hours}</p>
        <p className="text-lg text-zinc-700">베이 {garage.bayCount}개 · {garage.phone}</p>
      </div>

      <div className="mt-6 grid gap-4">
        <article className="rounded-3xl bg-blue-50 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Self Service</p>
              <h2 className="mt-2 text-2xl font-semibold text-zinc-900">시간 예약 후 직접 정비</h2>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-blue-700">
              {formatPrice(garage.hourlyPrice)}/시간
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-zinc-700">
            기본 1시간부터 시작하고, 추가 예약은 30분 단위로 이어집니다.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {selfWorkOptions.slice(0, 3).map((option) => (
              <span key={option.id} className="rounded-full bg-white px-3 py-1 text-zinc-700">
                {option.title}
              </span>
            ))}
          </div>
          <Link
            href={`/partner/${garage.id}/work?mode=SELF_SERVICE`}
            className="mt-5 flex h-12 items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white"
          >
            셀프 정비 예약
          </Link>
        </article>

        <article className="rounded-3xl bg-amber-50 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Shop Service</p>
              <h2 className="mt-2 text-2xl font-semibold text-zinc-900">패키지 선택 후 전문가에게 맡기기</h2>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-amber-700">
              업체별 가격 공개
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {packages.map((item) => (
              <div key={item.id} className="rounded-2xl bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-zinc-900">{item.name}</p>
                    <p className="mt-1 text-sm text-zinc-600">{item.summary}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-zinc-900">{formatPrice(item.price)}</p>
                    <p className="text-xs text-zinc-500">소요 {formatMinutesLabel(item.durationMinutes)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Link
            href={`/partner/${garage.id}/work?mode=SHOP_SERVICE`}
            className="mt-5 flex h-12 items-center justify-center rounded-2xl bg-zinc-900 text-lg font-semibold text-white"
          >
            전문가 맡기기 예약
          </Link>
        </article>
      </div>

      <div className="mt-6 rounded-3xl bg-zinc-100 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-2xl font-semibold text-zinc-900">최근 리뷰</h3>
          <Link href={`/partner/${garage.id}/reviews`} className="text-sm font-semibold text-blue-600">
            전체보기
          </Link>
        </div>

        {reviews.length === 0 ? (
          <p className="text-base text-zinc-600">아직 등록된 리뷰가 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <article key={review.id} className="rounded-2xl bg-white p-4">
                <p className="text-lg text-amber-500">{renderStars(review.rating)}</p>
                <p className="mt-2 text-sm text-zinc-700">{review.comment || "코멘트 없음"}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
