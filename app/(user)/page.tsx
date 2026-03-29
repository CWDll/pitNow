import Link from "next/link";

import {
  hasSupabaseEnv,
  missingSupabaseEnvMessage,
  supabase,
} from "@/src/lib/supabase";

interface PartnerRow {
  id: string;
  name: string;
  address: string;
}

interface BayRow {
  id: string;
  partner_id: string;
  is_active: boolean;
}

interface PartnerPackagePriceRow {
  partner_id: string;
  labor_price: number;
  is_active: boolean;
}

interface ReviewRow {
  partner_id: string;
  rating: number;
}

interface HomePartnerCard {
  id: string;
  name: string;
  address: string;
  bayCount: number;
  averageRating: number | null;
  reviewCount: number;
  cheapestPackagePrice: number | null;
}

async function getHomePartnerCards(): Promise<HomePartnerCard[]> {
  const { data: partners, error: partnerError } = await supabase
    .from("partners")
    .select("id,name,address")
    .returns<PartnerRow[]>();

  if (partnerError || !partners) {
    console.error("HOME PARTNERS LOOKUP ERROR:", partnerError);
    return [];
  }

  const { data: bays, error: bayError } = await supabase
    .from("bays")
    .select("id,partner_id,is_active")
    .eq("is_active", true)
    .returns<BayRow[]>();

  if (bayError) {
    console.error("HOME BAYS LOOKUP ERROR:", bayError);
  }

  const { data: partnerPackagePrices, error: packageError } = await supabase
    .from("partner_package_prices")
    .select("partner_id,labor_price,is_active")
    .eq("is_active", true)
    .returns<PartnerPackagePriceRow[]>();

  if (packageError) {
    console.error("HOME PACKAGE PRICE LOOKUP ERROR:", packageError);
  }

  const { data: reviews, error: reviewError } = await supabase
    .from("reviews")
    .select("partner_id,rating")
    .returns<ReviewRow[]>();

  if (reviewError) {
    console.error("HOME REVIEW LOOKUP ERROR:", reviewError);
  }

  const bayCountByPartner = new Map<string, number>();
  for (const bay of bays ?? []) {
    bayCountByPartner.set(
      bay.partner_id,
      (bayCountByPartner.get(bay.partner_id) ?? 0) + 1,
    );
  }

  const cheapestPackageByPartner = new Map<string, number>();
  for (const item of partnerPackagePrices ?? []) {
    const current = cheapestPackageByPartner.get(item.partner_id);
    if (current === undefined || item.labor_price < current) {
      cheapestPackageByPartner.set(item.partner_id, Number(item.labor_price));
    }
  }

  const reviewStatsByPartner = new Map<
    string,
    { sum: number; count: number }
  >();
  for (const review of reviews ?? []) {
    const current = reviewStatsByPartner.get(review.partner_id) ?? {
      sum: 0,
      count: 0,
    };

    reviewStatsByPartner.set(review.partner_id, {
      sum: current.sum + review.rating,
      count: current.count + 1,
    });
  }

  return partners.map((partner) => {
    const reviewStats = reviewStatsByPartner.get(partner.id);

    return {
      id: partner.id,
      name: partner.name,
      address: partner.address,
      bayCount: bayCountByPartner.get(partner.id) ?? 0,
      averageRating:
        reviewStats && reviewStats.count > 0
          ? reviewStats.sum / reviewStats.count
          : null,
      reviewCount: reviewStats?.count ?? 0,
      cheapestPackagePrice: cheapestPackageByPartner.get(partner.id) ?? null,
    };
  });
}

function formatPrice(price: number): string {
  return `${price.toLocaleString("ko-KR")}원`;
}

export default async function HomePage() {
  if (!hasSupabaseEnv) {
    return (
      <section className="space-y-4">
        <header className="pt-2">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900">
            <span className="text-blue-600">Pit</span>Now
          </h1>
        </header>
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {missingSupabaseEnvMessage}
        </p>
      </section>
    );
  }

  const partners = await getHomePartnerCards();

  return (
    <section className="space-y-4">
      <header className="pt-2">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900">
          <span className="text-blue-600">Pit</span>Now
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          셀프로 정비하거나, 그대로 맡길 수 있는 2-way 예약 서비스
        </p>
      </header>

      <div className="rounded-2xl bg-zinc-100 px-4 py-3 text-sm text-zinc-500">
        강남구, 서초구 기준 가까운 제휴 정비소
      </div>

      <div className="flex gap-2 text-sm">
        <span className="rounded-full bg-blue-600 px-4 py-2 font-semibold text-white">
          가장 빠른 예약
        </span>
        <span className="rounded-full border border-zinc-300 px-4 py-2 text-zinc-600">
          가격
        </span>
        <span className="rounded-full border border-zinc-300 px-4 py-2 text-zinc-600">
          평점
        </span>
      </div>

      <div className="space-y-3 pb-3">
        {partners.map((partner) => {
          const ratingLabel =
            partner.averageRating === null
              ? "-"
              : partner.averageRating.toFixed(1);

          return (
            <article
              key={partner.id}
              className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-zinc-900">
                    {partner.name}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    {partner.address} · 베이 {partner.bayCount}개
                  </p>
                </div>
                <Link
                  href={`/partner/${partner.id}`}
                  className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700"
                >
                  보기
                </Link>
              </div>

              <p className="mt-4 text-sm text-zinc-700">
                평점 {ratingLabel} · 리뷰 {partner.reviewCount}개
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-blue-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
                    Self
                  </p>
                  <p className="mt-2 text-sm text-zinc-600">시간대 예약</p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900">
                    요금 정책 확인
                  </p>
                </div>
                <div className="rounded-2xl bg-amber-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Shop
                  </p>
                  <p className="mt-2 text-sm text-zinc-600">패키지 맡기기</p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900">
                    {partner.cheapestPackagePrice
                      ? `${formatPrice(partner.cheapestPackagePrice)}부터`
                      : "패키지 준비중"}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                  운영 정보는 상세 페이지에서 확인
                </span>
                <Link
                  href={`/partner/${partner.id}`}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  예약하기
                </Link>
              </div>
            </article>
          );
        })}

        {partners.length === 0 ? (
          <p className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
            등록된 제휴 정비소가 없습니다.
          </p>
        ) : null}
      </div>
    </section>
  );
}
