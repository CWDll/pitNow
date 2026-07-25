"use client";

import { Camera, ChevronDown, MessageSquareText, Star } from "lucide-react";
import { useMemo, useState } from "react";

import type { PublicReview } from "@/src/lib/public-reviews";

import { ImageLightbox } from "./image-lightbox";
import { ReviewCard } from "./review-card";

type ReviewFilter = "ALL" | "PHOTO";
type ReviewSort = "LATEST" | "HIGH_RATING" | "LOW_RATING";

function RatingStars({ rating }: { rating: number }) {
  return (
    <span
      className="flex items-center gap-0.5"
      aria-label={`평균 별점 ${rating.toFixed(1)}점`}
    >
      {Array.from({ length: 5 }).map((_, index) => {
        const filled = index + 1 <= Math.round(rating);
        return (
          <Star
            key={index}
            className={`size-5 ${
              filled
                ? "fill-amber-400 text-amber-400"
                : "fill-slate-100 text-slate-200"
            }`}
          />
        );
      })}
    </span>
  );
}

export function ReviewExplorer({ reviews }: { reviews: PublicReview[] }) {
  const [filter, setFilter] = useState<ReviewFilter>("ALL");
  const [sort, setSort] = useState<ReviewSort>("LATEST");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const average =
    reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : 0;
  const photoReviews = reviews.filter((review) => review.imageUrls.length > 0);
  const photoUrls = reviews.flatMap((review) => review.imageUrls);
  const photoLightboxImages = photoUrls.map((url, index) => ({
    src: url,
    alt: `사진 후기 ${index + 1} 상세보기`,
  }));
  const distribution = Array.from({ length: 5 }, (_, index) => {
    const rating = 5 - index;
    const count = reviews.filter((review) => review.rating === rating).length;
    return {
      rating,
      count,
      percentage: reviews.length > 0 ? (count / reviews.length) * 100 : 0,
    };
  });

  const visibleReviews = useMemo(() => {
    const filtered =
      filter === "PHOTO"
        ? reviews.filter((review) => review.imageUrls.length > 0)
        : [...reviews];

    return filtered.sort((a, b) => {
      if (sort === "HIGH_RATING") {
        return b.rating - a.rating;
      }
      if (sort === "LOW_RATING") {
        return a.rating - b.rating;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [filter, reviews, sort]);

  return (
    <>
      <section
        aria-labelledby="rating-summary-title"
        className="border-b border-slate-200 bg-white px-5 pb-6 pt-5"
      >
        <h2 id="rating-summary-title" className="sr-only">
          리뷰 평점 요약
        </h2>
        <div className="grid grid-cols-[118px_1fr] items-center gap-5">
          <div className="border-r border-slate-200 pr-5 text-center">
            <p className="text-[44px] font-black leading-none text-slate-950">
              {average.toFixed(1)}
            </p>
            <div className="mt-3 flex justify-center">
              <RatingStars rating={average} />
            </div>
            <p className="mt-2 text-xs font-bold text-slate-400">
              후기 {reviews.length}개
            </p>
          </div>

          <div className="space-y-2">
            {distribution.map((item) => (
              <div
                key={item.rating}
                className="grid grid-cols-[14px_1fr_22px] items-center gap-2"
              >
                <span className="text-[11px] font-bold text-slate-500">
                  {item.rating}
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className="block h-full rounded-full bg-amber-400"
                    style={{ width: `${item.percentage}%` }}
                  />
                </span>
                <span className="text-center text-[11px] font-semibold text-slate-400">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {photoUrls.length > 0 ? (
        <section
          aria-labelledby="photo-review-title"
          className="border-b border-slate-200 bg-white py-5"
        >
          <div className="flex items-end justify-between px-5">
            <div>
              <p className="text-xs font-bold text-blue-600">PHOTO REVIEWS</p>
              <h2
                id="photo-review-title"
                className="mt-1 text-lg font-black text-slate-950"
              >
                사진으로 먼저 보기
              </h2>
            </div>
            <span className="text-xs font-bold text-slate-400">
              {photoUrls.length}장
            </span>
          </div>
          <div className="mt-3 flex snap-x gap-2 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {photoUrls.map((url, index) => (
              <button
                key={`${url}-${index}`}
                type="button"
                onClick={() => setPreviewIndex(index)}
                aria-label={`사진 후기 ${index + 1} 크게 보기`}
                className="w-28 shrink-0 snap-start overflow-hidden rounded-lg bg-slate-100"
              >
                {/* Public review media is intentionally rendered directly. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`사진 후기 ${index + 1}`}
                  className="aspect-square w-full object-cover"
                />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setFilter("ALL")}
              aria-pressed={filter === "ALL"}
              className={`h-9 rounded-md px-3 text-xs font-black ${
                filter === "ALL"
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              전체 {reviews.length}
            </button>
            <button
              type="button"
              onClick={() => setFilter("PHOTO")}
              aria-pressed={filter === "PHOTO"}
              className={`flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-black ${
                filter === "PHOTO"
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              <Camera className="size-3.5" />
              사진 {photoReviews.length}
            </button>
          </div>

          <label className="relative">
            <span className="sr-only">리뷰 정렬</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as ReviewSort)}
              className="h-10 appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-bold text-slate-600 outline-none focus:border-blue-500"
            >
              <option value="LATEST">최신순</option>
              <option value="HIGH_RATING">별점 높은순</option>
              <option value="LOW_RATING">별점 낮은순</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-3 size-4 text-slate-400" />
          </label>
        </div>

        {visibleReviews.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-xl bg-slate-100 text-slate-500">
              <MessageSquareText className="size-5" />
            </span>
            <p className="mt-4 text-sm font-black text-slate-800">
              {filter === "PHOTO"
                ? "사진이 포함된 후기가 없습니다."
                : "아직 등록된 후기가 없습니다."}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              이용을 완료한 고객의 솔직한 후기가 표시됩니다.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 px-5">
            {visibleReviews.map((review) => (
              <ReviewCard key={review.id} review={review} feed />
            ))}
          </div>
        )}
      </section>

      <ImageLightbox
        images={photoLightboxImages}
        activeIndex={previewIndex}
        dialogLabel="사진 후기 상세보기"
        closeLabel="사진 후기 닫기"
        onClose={() => setPreviewIndex(null)}
        onIndexChange={setPreviewIndex}
      />
    </>
  );
}
