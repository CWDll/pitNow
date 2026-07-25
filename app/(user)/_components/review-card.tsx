"use client";

import { Star, UserRound } from "lucide-react";
import { useState } from "react";

import type { PublicReview } from "@/src/lib/public-reviews";

import { ImageLightbox } from "./image-lightbox";

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

function avatarTone(authorId: string) {
  const tones = [
    "bg-blue-100 text-blue-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-cyan-100 text-cyan-700",
  ];
  const code = authorId
    .split("")
    .reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return tones[code % tones.length];
}

export function ReviewCard({
  review,
  compact = false,
  feed = false,
}: {
  review: PublicReview;
  compact?: boolean;
  feed?: boolean;
}) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const lightboxImages = review.imageUrls.map((url, index) => ({
    src: url,
    alt: `리뷰 사진 ${index + 1} 상세보기`,
  }));

  return (
    <article
      className={
        compact || feed
          ? "py-5"
          : "rounded-lg border border-slate-200 bg-white p-4"
      }
    >
      <div className="flex items-center gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-full ${avatarTone(review.authorId)}`}
        >
          <UserRound className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-slate-900">
            {review.nickname}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="flex items-center gap-0.5"
              aria-label={`별점 ${review.rating}점`}
            >
              {Array.from({ length: 5 }).map((_, index) => (
                <Star
                  key={index}
                  className={`size-3.5 ${
                    index + 1 <= review.rating
                      ? "fill-amber-400 text-amber-400"
                      : "fill-slate-100 text-slate-200"
                  }`}
                />
              ))}
            </span>
            <span className="text-[11px] font-bold text-slate-400">
              {review.rating.toFixed(1)}
            </span>
          </div>
        </div>
        <time className="shrink-0 text-[11px] font-semibold text-slate-400">
          {formatDate(review.createdAt)}
        </time>
      </div>

      <p className="mt-4 whitespace-pre-wrap text-sm font-medium leading-6 text-slate-700">
        {review.comment || "내용 없이 별점만 남긴 후기입니다."}
      </p>

      {review.imageUrls.length > 0 ? (
        <div
          className={`mt-4 grid gap-2 ${
            review.imageUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"
          }`}
        >
          {review.imageUrls.map((url, index) => (
            <button
              key={url}
              type="button"
              onClick={() => setPreviewIndex(index)}
              aria-label={`리뷰 사진 ${index + 1} 크게 보기`}
              className="overflow-hidden rounded-lg bg-slate-100"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`리뷰 첨부 사진 ${index + 1}`}
                className="aspect-[4/3] w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}

      <ImageLightbox
        images={lightboxImages}
        activeIndex={previewIndex}
        dialogLabel="리뷰 사진 상세보기"
        closeLabel="사진 상세보기 닫기"
        onClose={() => setPreviewIndex(null)}
        onIndexChange={setPreviewIndex}
      />
    </article>
  );
}
