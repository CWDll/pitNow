import Link from "next/link";

import { garageList } from "./_data/mock-garages";

function formatPrice(price: number): string {
  return `${price.toLocaleString("ko-KR")}원/h`;
}

export default function HomePage() {
  return (
    <section className="space-y-4">
      <header className="pt-2">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900">
          <span className="text-blue-600">Pit</span>Now
        </h1>
      </header>

      <div className="rounded-2xl bg-zinc-100 px-4 py-3 text-sm text-zinc-500">
        정비소 검색
      </div>

      <div className="flex gap-2 text-sm">
        <span className="rounded-full bg-zinc-100 px-3 py-2 text-zinc-700">서울 강남구</span>
        <span className="rounded-full bg-zinc-100 px-3 py-2 text-zinc-700">현대 아반떼 CN7</span>
      </div>

      <div className="flex h-44 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500">
        지도 영역
      </div>

      <div className="flex gap-2 text-sm">
        <button type="button" className="rounded-full bg-blue-600 px-4 py-2 font-semibold text-white">
          가장 빠른 슬롯
        </button>
        <button type="button" className="rounded-full border border-zinc-300 px-4 py-2 text-zinc-600">
          가격
        </button>
        <button type="button" className="rounded-full border border-zinc-300 px-4 py-2 text-zinc-600">
          평점
        </button>
        <button type="button" className="rounded-full border border-zinc-300 px-4 py-2 text-zinc-600">
          거리
        </button>
      </div>

      <div className="space-y-3 pb-3">
        {garageList.map((garage) => (
          <article key={garage.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-zinc-900">{garage.name}</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {garage.distanceKm}km · 베이 {garage.bayCount}개
                </p>
              </div>
              <Link
                href={`/partner/${garage.id}`}
                className="text-3xl leading-none text-zinc-400"
                aria-label={`${garage.name} 상세보기`}
              >
                ›
              </Link>
            </div>

            <p className="mt-4 text-sm font-medium text-zinc-800">
              ★ {garage.rating} ({garage.reviewCount})
              <span className="ml-2 text-lg font-semibold">{formatPrice(garage.hourlyPrice)}</span>
            </p>

            <div className="mt-4 flex items-center justify-between">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-600">
                {garage.nextSlot}
              </span>
              <Link
                href={`/partner/${garage.id}`}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
              >
                예약하기
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
