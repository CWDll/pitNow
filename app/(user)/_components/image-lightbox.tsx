"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect } from "react";

export interface LightboxImage {
  src: string;
  alt: string;
}

export function ImageLightbox({
  images,
  activeIndex,
  dialogLabel,
  closeLabel,
  onClose,
  onIndexChange,
}: {
  images: LightboxImage[];
  activeIndex: number | null;
  dialogLabel: string;
  closeLabel: string;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  const isOpen =
    activeIndex !== null && activeIndex >= 0 && activeIndex < images.length;

  useEffect(() => {
    if (!isOpen || activeIndex === null) {
      return;
    }
    const currentIndex = activeIndex;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowLeft" && images.length > 1) {
        onIndexChange((currentIndex - 1 + images.length) % images.length);
      } else if (event.key === "ArrowRight" && images.length > 1) {
        onIndexChange((currentIndex + 1) % images.length);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeIndex,
    images.length,
    isOpen,
    onClose,
    onIndexChange,
  ]);

  if (!isOpen || activeIndex === null) {
    return null;
  }

  const currentIndex = activeIndex;
  const showNavigation = images.length > 1;
  const currentImage = images[currentIndex];

  function move(delta: number) {
    onIndexChange((currentIndex + delta + images.length) % images.length);
  }

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={dialogLabel}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-full w-full max-w-4xl flex-col items-center"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative flex max-h-[85vh] w-full items-center justify-center">
          {/* Public media is intentionally rendered directly. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentImage.src}
            alt={currentImage.alt}
            className="max-h-[85vh] max-w-full rounded-lg bg-white object-contain"
          />

          {showNavigation ? (
            <>
              <button
                type="button"
                onClick={() => move(-1)}
                aria-label="이전 이미지"
                title="이전 이미지"
                className="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-slate-950/75 text-white shadow-lg backdrop-blur"
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                onClick={() => move(1)}
                aria-label="다음 이미지"
                title="다음 이미지"
                className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-slate-950/75 text-white shadow-lg backdrop-blur"
              >
                <ChevronRight className="size-6" />
              </button>
            </>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            title={closeLabel}
            className="absolute right-3 top-3 grid size-10 place-items-center rounded-md bg-slate-950/80 text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        <p className="mt-3 text-center text-sm font-bold text-white">
          {currentIndex + 1} / {images.length}
        </p>
      </div>
    </div>
  );
}
