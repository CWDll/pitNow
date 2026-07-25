"use client";

import { Images } from "lucide-react";
import { useState } from "react";

import type { PublicPartnerImage } from "@/src/lib/partner-images";

import { ImageLightbox } from "./image-lightbox";

export function PartnerImageGallery({
  images,
  partnerName,
}: {
  images: PublicPartnerImage[];
  partnerName: string;
}) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const lightboxImages = images.map((image, index) => ({
    src: image.url,
    alt: `${partnerName} 시설 사진 ${index + 1} 상세보기`,
  }));

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

      <ImageLightbox
        images={lightboxImages}
        activeIndex={previewIndex}
        dialogLabel={`${partnerName} 사진 상세보기`}
        closeLabel="정비소 사진 닫기"
        onClose={() => setPreviewIndex(null)}
        onIndexChange={setPreviewIndex}
      />
    </>
  );
}
