import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";

import { ReviewExplorer } from "@/app/(user)/_components/review-explorer";
import { getPartnerProfileById } from "@/src/lib/partners";
import { getPublicReviews } from "@/src/lib/public-reviews";

interface PartnerReviewListPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ from?: string | string[] }>;
}

export default async function PartnerReviewListPage({
  params,
  searchParams,
}: PartnerReviewListPageProps) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const from = Array.isArray(resolvedSearchParams?.from)
    ? resolvedSearchParams.from[0]
    : resolvedSearchParams?.from;
  const garage = await getPartnerProfileById(id);

  if (!garage) {
    notFound();
  }

  const reviews = await getPublicReviews(garage.id);
  const backHref = from === "mypage" ? "/mypage" : `/partner/${garage.id}`;
  const backLabel =
    from === "mypage" ? "마이페이지로 돌아가기" : "정비소 상세로 돌아가기";

  return (
    <section className="-mx-4 min-h-screen bg-slate-50 pb-24">
      <header className="border-b border-slate-200 bg-white px-4 pb-4 pt-5">
        <div className="grid grid-cols-[40px_1fr_40px] items-center">
          <Link
            href={backHref}
            className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm"
            aria-label={backLabel}
            title={backLabel}
          >
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-center text-lg font-black text-slate-950">
            이용 후기
          </h1>
          <span aria-hidden="true" />
        </div>

        <div className="mt-5">
          <p className="text-xs font-bold text-blue-600">PITNOW REVIEWS</p>
          <Link
            href={`/partner/${garage.id}`}
            className="mt-1 inline-flex items-center gap-1 text-[24px] font-black leading-tight text-slate-950"
          >
            {garage.name}
            <span aria-hidden="true" className="text-lg text-slate-400">›</span>
          </Link>
          <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold leading-5 text-slate-500">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-blue-600" />
            {garage.address}
          </p>
        </div>
      </header>
      <ReviewExplorer reviews={reviews} />
    </section>
  );
}
