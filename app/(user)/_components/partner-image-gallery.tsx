"use client";

import { Images } from "lucide-react";
import { useRef, useState } from "react";

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
  const [visibleIndex, setVisibleIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
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
      <div
        ref={trackRef}
        data-testid="partner-inline-gallery"
        onScroll={(event) => {
          const track = event.currentTarget;
          const slides = Array.from(track.children) as HTMLElement[];
          const nextIndex = slides.reduce(
            (closestIndex, slide, index) =>
              Math.abs(slide.offsetLeft - track.scrollLeft) <
              Math.abs(slides[closestIndex].offsetLeft - track.scrollLeft)
                ? index
                : closestIndex,
            0,
          );
          setVisibleIndex(nextIndex);
        }}
        className="-mx-4 flex touch-pan-x snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 [scroll-padding-inline:1rem] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((image, index) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setPreviewIndex(index)}
            aria-label={`${partnerName} 사진 ${index + 1} 크게 보기`}
            className="w-[calc(100%-2.5rem)] shrink-0 snap-start overflow-hidden rounded-lg bg-slate-100"
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
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex gap-1.5" aria-hidden="true">
          {images.map((image, index) => (
            <span
              key={image.id}
              className={`h-1.5 rounded-full transition-all ${
                visibleIndex === index
                  ? "w-5 bg-blue-600"
                  : "w-1.5 bg-slate-300"
              }`}
            />
          ))}
        </div>
        <p
          className="text-xs font-bold text-slate-400"
          aria-live="polite"
          data-testid="partner-gallery-position"
        >
          {visibleIndex + 1} / {images.length} · 좌우로 넘겨보기
        </p>
      </div>

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
