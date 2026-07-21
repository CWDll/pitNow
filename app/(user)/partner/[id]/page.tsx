import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  MapPin,
  Phone,
  ShieldCheck,
  Star,
  Warehouse,
  Wrench,
} from "lucide-react";

import { formatMinutesLabel } from "@/app/(user)/_data/mock-garages";
import { getPartnerShopPackages } from "@/src/lib/partner-packages";
import { getPartnerProfileById } from "@/src/lib/partners";
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

interface SelfTaskRow {
  id: string;
  name: string;
  helper_verify_unit_fee: number;
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

async function getSelfTasks(): Promise<SelfTaskRow[]> {
  if (!hasSupabaseEnv) {
    return [];
  }

  const { data, error } = await supabase
    .from("self_maintenance_tasks")
    .select("id,name,helper_verify_unit_fee")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(3)
    .returns<SelfTaskRow[]>();

  if (error) {
    console.error("SELF TASK LOOKUP ERROR:", error);
    return [];
  }

  return data ?? [];
}

async function getRecentReviewsByPartnerId(
  partnerId: string,
): Promise<ReviewRow[]> {
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

export default async function PartnerDetailPage({
  params,
}: PartnerDetailPageProps) {
  const { id } = await params;
  const garage = await getPartnerProfileById(id);

  if (!garage) {
    notFound();
  }

  const reviews = await getRecentReviewsByPartnerId(garage.id);
  const selfTasks = await getSelfTasks();
  const { packages } = await getPartnerShopPackages(garage.id);
  const averageRating =
    reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : 0;

  return (
    <section className="space-y-6 pb-28">
      <header className="-mx-4 border-b border-slate-200 bg-white px-4 pb-5 pt-5">
        <Link
          href="/"
          aria-label="홈으로 돌아가기"
          title="홈으로 돌아가기"
          className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm"
        >
          <ArrowLeft className="size-5" />
        </Link>

        <div className="mt-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-blue-600">PITNOW PARTNER</p>
            <h1 className="mt-1 text-[26px] font-black leading-tight text-slate-950">
              {garage.name}
            </h1>
            <p className="mt-2 flex items-start gap-1.5 text-sm font-medium leading-6 text-slate-500">
              <MapPin className="mt-1 size-4 shrink-0 text-blue-600" />
              {garage.address}
            </p>
          </div>
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white shadow-sm">
            <Warehouse className="size-6" />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-slate-50 py-3">
          <div className="px-3 text-center">
            <p className="flex items-center justify-center gap-1 text-sm font-black text-slate-900">
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              {averageRating.toFixed(1)}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-slate-400">후기 {reviews.length}</p>
          </div>
          <div className="px-3 text-center">
            <p className="text-sm font-black text-slate-900">{garage.activeBayCount}/{garage.bayCount}</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-400">운영 베이</p>
          </div>
          <div className="px-3 text-center">
            <p className="truncate text-sm font-black text-slate-900">{garage.hours}</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-400">운영 시간</p>
          </div>
        </div>

        <a
          href={`tel:${garage.phone}`}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500"
        >
          <Phone className="size-3.5" />
          {garage.phone}
        </a>
      </header>

      <section aria-labelledby="self-service-title">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-xs font-bold text-blue-600">SELF SERVICE</p>
            <h2 id="self-service-title" className="mt-1 text-xl font-black text-slate-950">
              직접 정비하기
            </h2>
          </div>
          <span className="text-xs font-bold text-slate-400">시간제 베이</span>
        </div>
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <div className="flex items-start gap-3 border-b border-blue-100 bg-blue-50 p-4">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-600 text-white">
              <Wrench className="size-4.5" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">베이와 장비를 직접 사용해요</p>
              <p className="mt-1 text-xs font-medium leading-5 text-slate-600">
                허용된 작업을 선택하고 필요한 시간만큼 예약할 수 있습니다.
              </p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {selfTasks.map((task) => (
              <div key={task.id} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black text-slate-900">
                    {task.name}
                  </p>
                  <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">
                    셀프 허용
                  </span>
                </div>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  검수 가산{" "}
                  {Number(task.helper_verify_unit_fee).toLocaleString("ko-KR")}
                  원
                </p>
              </div>
            ))}

            {selfTasks.length === 0 ? (
              <p className="p-4 text-sm font-medium text-slate-500">
                현재 등록된 셀프 정비 작업이 없습니다.
              </p>
            ) : null}
          </div>
          <Link
            href={`/partner/${garage.id}/work?mode=SELF_SERVICE`}
            className="m-4 flex h-11 items-center justify-center gap-1 rounded-xl bg-blue-600 text-sm font-black text-white"
          >
            Self로 예약
            <ChevronRight className="size-4" />
          </Link>
        </article>
      </section>

      <section aria-labelledby="shop-service-title">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-xs font-bold text-emerald-600">SHOP SERVICE</p>
            <h2 id="shop-service-title" className="mt-1 text-xl font-black text-slate-950">
              정비 맡기기
            </h2>
          </div>
          <span className="text-xs font-bold text-slate-400">패키지 예약</span>
        </div>
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <div className="flex items-start gap-3 border-b border-emerald-100 bg-emerald-50 p-4">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white">
              <ShieldCheck className="size-4.5" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">정비소에 차량을 맡겨요</p>
              <p className="mt-1 text-xs font-medium leading-5 text-slate-600">
                작업과 소요 시간이 정해진 패키지를 선택할 수 있습니다.
              </p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {packages.map((item) => (
              <div key={item.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900">
                      {item.name}
                    </p>
                    <p className="mt-1 text-xs font-medium leading-5 text-slate-500">{item.summary}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black text-slate-900">
                      {formatPrice(item.price)}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-400">
                      소요 {formatMinutesLabel(item.durationMinutes)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Link
            href={`/partner/${garage.id}/work?mode=SHOP_SERVICE`}
            className="m-4 flex h-11 items-center justify-center gap-1 rounded-xl bg-emerald-600 text-sm font-black text-white"
          >
            Shop으로 예약
            <ChevronRight className="size-4" />
          </Link>
        </article>
      </section>

      <section aria-labelledby="review-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="review-title" className="text-xl font-black text-slate-950">최근 후기</h2>
          <Link
            href={`/partner/${garage.id}/reviews`}
            className="text-xs font-bold text-blue-600"
          >
            전체보기
          </Link>
        </div>

        {reviews.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center text-sm font-medium text-slate-500">
            아직 등록된 후기가 없습니다.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm">
            {reviews.map((review) => (
              <article key={review.id} className="py-4">
                <p className="text-sm text-amber-500">
                  {renderStars(review.rating)}
                </p>
                <p className="mt-1 text-[11px] font-semibold text-slate-400">
                  {formatDate(review.created_at)}
                </p>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-700">
                  {review.comment || "코멘트 없음"}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
        <Link
          href={`/partner/${garage.id}/work`}
          className="flex h-12 w-full items-center justify-center gap-1 rounded-xl bg-blue-600 text-sm font-black text-white shadow-sm"
        >
          예약하기
          <ChevronRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}
