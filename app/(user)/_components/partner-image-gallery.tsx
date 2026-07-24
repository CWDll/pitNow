"use client";

import { Images, X } from "lucide-react";
import { useState } from "react";

import type { PublicPartnerImage } from "@/src/lib/partner-images";

export function PartnerImageGallery({
  images,
  partnerName,
}: {
  images: PublicPartnerImage[];
  partnerName: string;
}) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  if (images.length === 0) {
    return (
      <div className="grid aspect-[16/9] place-items-center rounded-lg border border-slate-200 bg-slate-100 text-slate-500">
        <div className="text-center">
          <Images className="mx-auto size-6" />
          <p className="mt-2 text-sm font-bold">정비소 사진 준비 중</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {images.map((image, index) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setPreviewIndex(index)}
            aria-label={`${partnerName} 사진 ${index + 1} 크게 보기`}
            className="w-[82%] shrink-0 snap-center overflow-hidden rounded-lg bg-slate-100 first:w-[88%]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt={`${partnerName} 시설 사진 ${index + 1}`}
              className="aspect-[4/3] w-full object-cover"
            />
          </button>
        ))}
      </div>
      <p className="mt-2 text-right text-xs font-bold text-slate-400">
        사진 {images.length}장
      </p>

      {previewIndex !== null ? (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${partnerName} 사진 상세보기`}
          onClick={() => setPreviewIndex(null)}
        >
          <div
            className="relative w-full max-w-4xl"
            onClick={(event) => event.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[previewIndex].url}
              alt={`${partnerName} 시설 사진 ${previewIndex + 1} 상세보기`}
              className="max-h-[85vh] w-full rounded-lg bg-white object-contain"
            />
            <button
              type="button"
              onClick={() => setPreviewIndex(null)}
              aria-label="정비소 사진 닫기"
              className="absolute right-3 top-3 grid size-10 place-items-center rounded-md bg-slate-950/80 text-white"
            >
              <X className="size-5" />
            </button>
            <p className="mt-3 text-center text-sm font-bold text-white">
              {previewIndex + 1} / {images.length}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
