import Link from "next/link";
import { notFound } from "next/navigation";

import { getGarageById, workOptions } from "../../_data/mock-garages";

interface PartnerDetailPageProps {
  params: Promise<{ id: string }>;
}

function levelClass(level: "초급" | "중급"): string {
  return level === "초급"
    ? "bg-blue-50 text-blue-600"
    : "bg-amber-50 text-amber-600";
}

function formatPrice(price: number): string {
  return `${price.toLocaleString("ko-KR")}원`;
}

export default async function PartnerDetailPage({ params }: PartnerDetailPageProps) {
  const { id } = await params;
  const garage = getGarageById(id);

  if (!garage) {
    notFound();
  }

  return (
    <section className="pb-24">
      <div className="-mx-4 mb-4 flex h-44 items-center justify-center bg-blue-100 text-zinc-500">
        정비소 이미지
      </div>

      <div className="space-y-2">
        <h1 className="text-4xl font-semibold text-zinc-900">{garage.name}</h1>
        <p className="text-lg text-zinc-700">★ {garage.rating} ({garage.reviewCount}개 후기)</p>
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
          <button type="button" className="text-sm font-semibold text-blue-600">
            전체보기
          </button>
        </div>
        <p className="text-lg text-zinc-700">★ ★ ★ ★ ☆ 4.8 (128개)</p>
        <p className="mt-2 text-base text-zinc-600">
          &#34;시설이 깨끗하고 공구 상태가 좋아요. 초보자도 쉽게 오일 교환할 수 있었습니다.&#34;
        </p>
      </div>

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 bg-white px-4 pb-3 pt-2">
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
