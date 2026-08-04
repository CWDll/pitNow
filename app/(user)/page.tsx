import { HomePartnerExplorer } from "./_components/home-partner-explorer";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import {
  hasSupabaseEnv,
  missingSupabaseEnvMessage,
  supabase,
} from "@/src/lib/supabase";
import { getPartnerImages } from "@/src/lib/partner-images";

export const dynamic = "force-dynamic";

interface PartnerRow {
  id: string;
  name: string;
  address: string;
  hourly_price: number | null;
  lat: number | null;
  lng: number | null;
}

interface PartnerServiceModeRow {
  id: string;
  supports_self_service: boolean;
  supports_shop_service: boolean;
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
  hourlyPrice: number | null;
  coverImageUrl: string | null;
  supportsSelfService: boolean;
  supportsShopService: boolean;
}

async function getHomePartnerCards(): Promise<HomePartnerCard[]> {
  const partnerImagesPromise = getPartnerImages();
  const partnerServiceModesPromise = supabase
    .from("partners")
    .select("id,supports_self_service,supports_shop_service")
    .returns<PartnerServiceModeRow[]>();
  const { data: partners, error: partnerError } = await supabase
    .from("partners")
    .select("id,name,address,hourly_price,lat,lng")
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

  const partnerImages = await partnerImagesPromise;
  const { data: partnerServiceModes, error: partnerServiceModesError } =
    await partnerServiceModesPromise;
  if (partnerServiceModesError) {
    console.warn(
      "HOME PARTNER SERVICE MODE LOOKUP FALLBACK:",
      partnerServiceModesError.message,
    );
  }
  const serviceModeByPartner = new Map(
    (partnerServiceModes ?? []).map((partner) => [partner.id, partner]),
  );
  const coverByPartner = new Map<string, string>();
  for (const image of partnerImages) {
    if (image.isCover || !coverByPartner.has(image.partnerId)) {
      coverByPartner.set(image.partnerId, image.url);
    }
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
    const serviceModes = serviceModeByPartner.get(partner.id);

    return {
      id: partner.id,
      name: partner.name,
      address: partner.address,
      hourlyPrice: Number.isFinite(Number(partner.hourly_price))
        ? Number(partner.hourly_price)
        : null,
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
      coverImageUrl: coverByPartner.get(partner.id) ?? null,
      supportsSelfService: serviceModes?.supports_self_service ?? true,
      supportsShopService:
        serviceModes?.supports_shop_service ??
        cheapestPackageByPartner.has(partner.id),
    };
  });
}

export default async function HomePage() {
  if (!hasSupabaseEnv) {
    return (
      <section className="space-y-5 pt-6">
        <header>
          <h1 className="text-3xl font-black text-slate-950">
            <span className="text-blue-600">Pit</span>Now
          </h1>
        </header>
        <div className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-red-700">
            서비스 연결을 확인해 주세요
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {missingSupabaseEnvMessage}
          </p>
        </div>
      </section>
    );
  }

  const partners = await getHomePartnerCards();
  const kakaoMapAppKey =
    process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY?.trim() || null;

  return (
    <section className="space-y-5 pb-2">
      <header className="pt-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-black leading-none text-slate-950">
              <span className="text-blue-600">Pit</span>Now
            </h1>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              내 차에 맞는 정비 공간, 지금 예약
            </p>
          </div>
          <Link
            href="/reservation"
            className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm"
          >
            <CalendarDays className="size-4 text-blue-600" />
            예약 확인
          </Link>
        </div>
      </header>

      <HomePartnerExplorer
        partners={partners}
        kakaoMapAppKey={kakaoMapAppKey}
      />
    </section>
  );
}
