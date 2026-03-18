import Link from "next/link";

import { garageList, getGarageShopPackages } from "./_data/mock-garages";

function formatPrice(price: number): string {
  return `${price.toLocaleString("ko-KR")}원`;
}

export default function HomePage() {
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
        <span className="rounded-full bg-blue-600 px-4 py-2 font-semibold text-white">가장 빠른 예약</span>
        <span className="rounded-full border border-zinc-300 px-4 py-2 text-zinc-600">가격</span>
        <span className="rounded-full border border-zinc-300 px-4 py-2 text-zinc-600">평점</span>
      </div>

      <div className="space-y-3 pb-3">
        {garageList.map((garage) => {
          const packages = getGarageShopPackages(garage.id);
          const cheapestPackage = packages.reduce<number | null>((min, item) => {
            if (min === null || item.price < min) {
              return item.price;
            }

            return min;
          }, null);

          return (
            <article key={garage.id} className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-zinc-900">{garage.name}</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    {garage.distanceKm}km · 베이 {garage.bayCount}개
                  </p>
                </div>
                <Link
                  href={`/partner/${garage.id}`}
                  className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700"
                >
                  보기
                </Link>
              </div>

              <p className="mt-4 text-sm text-zinc-700">
                평점 {garage.rating} · 리뷰 {garage.reviewCount}개
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-blue-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Self</p>
                  <p className="mt-2 text-sm text-zinc-600">시간대 예약</p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900">{formatPrice(garage.hourlyPrice)}/시간</p>
                </div>
                <div className="rounded-2xl bg-amber-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Shop</p>
                  <p className="mt-2 text-sm text-zinc-600">패키지 맡기기</p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900">
                    {cheapestPackage ? `${formatPrice(cheapestPackage)}부터` : "패키지 준비중"}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                  가장 빠른 예약 {garage.nextSlot}
                </span>
                <Link
                  href={`/partner/${garage.id}`}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  예약하기
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
