import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";

import { ReviewExplorer } from "@/app/(user)/_components/review-explorer";
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
  return (
    <section className="-mx-4 min-h-screen bg-slate-50 pb-24">
      <header className="border-b border-slate-200 bg-white px-4 pb-4 pt-5">
        <div className="grid grid-cols-[40px_1fr_40px] items-center">
          <Link
            href={`/partner/${garage.id}`}
            className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm"
            aria-label="정비소 상세로 돌아가기"
            title="정비소 상세로 돌아가기"
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
          <h2 className="mt-1 text-[24px] font-black leading-tight text-slate-950">
            {garage.name}
          </h2>
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
