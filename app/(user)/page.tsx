import { HomePartnerExplorer } from "./_components/home-partner-explorer";
import {
  hasSupabaseEnv,
  missingSupabaseEnvMessage,
  supabase,
} from "@/src/lib/supabase";

interface PartnerRow {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
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
  lat: number | null;
  lng: number | null;
  bayCount: number;
  activeBayCount: number;
  averageRating: number | null;
  reviewCount: number;
  cheapestPackagePrice: number | null;
}

async function getHomePartnerCards(): Promise<HomePartnerCard[]> {
  const { data: partners, error: partnerError } = await supabase
    .from("partners")
    .select("id,name,address,lat,lng")
    .returns<PartnerRow[]>();

  if (partnerError || !partners) {
    console.error("HOME PARTNERS LOOKUP ERROR:", partnerError);
    return [];
  }

  const { data: bays, error: bayError } = await supabase
    .from("bays")
    .select("id,partner_id,is_active")
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
  const activeBayCountByPartner = new Map<string, number>();
  for (const bay of bays ?? []) {
    bayCountByPartner.set(
      bay.partner_id,
      (bayCountByPartner.get(bay.partner_id) ?? 0) + 1,
    );

    if (bay.is_active) {
      activeBayCountByPartner.set(
        bay.partner_id,
        (activeBayCountByPartner.get(bay.partner_id) ?? 0) + 1,
      );
    }
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
      lat: partner.lat,
      lng: partner.lng,
      bayCount: bayCountByPartner.get(partner.id) ?? 0,
      activeBayCount: activeBayCountByPartner.get(partner.id) ?? 0,
      averageRating:
        reviewStats && reviewStats.count > 0
          ? reviewStats.sum / reviewStats.count
          : null,
      reviewCount: reviewStats?.count ?? 0,
      cheapestPackagePrice: cheapestPackageByPartner.get(partner.id) ?? null,
    };
  });
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
  const kakaoMapAppKey =
    process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY?.trim() || null;

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

      <HomePartnerExplorer
        partners={partners}
        kakaoMapAppKey={kakaoMapAppKey}
      />
    </section>
  );
}
