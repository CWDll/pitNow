"use client";

import { Expand, X } from "lucide-react";
import { useEffect, useState } from "react";

import {
  convertHeicBlobToJpeg,
  looksLikeHeic,
} from "@/src/lib/heic-image";

interface EvidenceImageProps {
  label: string;
  url: string | null;
}

export default function EvidenceImage({
  label,
  url,
}: EvidenceImageProps) {
  const [displayUrl, setDisplayUrl] = useState(url ?? "");
  const [hasError, setHasError] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    setIsPreviewOpen(false);

    if (!url) {
      setDisplayUrl("");
      setHasError(false);
      setIsConverting(false);
      return;
    }

    if (!looksLikeHeic({ name: url })) {
      setDisplayUrl(url);
      setHasError(false);
      setIsConverting(false);
      return;
    }

    let cancelled = false;
    let objectUrl = "";
    setDisplayUrl("");
    setHasError(false);
    setIsConverting(true);

    async function convertForPreview() {
      try {
        const response = await fetch(url as string);
        if (!response.ok) {
          throw new Error("Evidence image fetch failed");
        }

        const converted = await convertHeicBlobToJpeg(await response.blob());
        objectUrl = URL.createObjectURL(converted);

        if (!cancelled) {
          setDisplayUrl(objectUrl);
        }
      } catch {
        if (!cancelled) {
          setHasError(true);
        }
      } finally {
        if (!cancelled) {
          setIsConverting(false);
        }
      }
    }

    void convertForPreview();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url]);

  if (!url) {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid aspect-video place-items-center bg-slate-100 text-sm font-medium text-slate-500">
          증적 없음
        </div>
        <span className="block border-t border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">
          {label}
        </span>
      </div>
    );
  }

  if (isConverting) {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid aspect-video place-items-center bg-slate-100 px-4 text-center text-sm font-medium text-slate-500">
          HEIC 사진을 불러오는 중입니다.
        </div>
        <span className="block border-t border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">
          {label}
        </span>
      </div>
    );
  }

  if (hasError || !displayUrl) {
    return (
      <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50 shadow-sm">
        <div className="grid aspect-video place-items-center px-4 text-center text-sm font-medium text-amber-800">
          저장 정보는 있지만 실제 사진 파일을 확인할 수 없습니다.
        </div>
        <span className="block border-t border-amber-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
          {label}
        </span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsPreviewOpen(true)}
        className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-left shadow-sm"
        aria-label={`${label} 사진 확대`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={displayUrl}
          alt={`${label} 증적 사진`}
          onError={() => setHasError(true)}
          className="aspect-video w-full object-cover transition group-hover:scale-[1.02]"
        />
        <span className="absolute right-3 top-3 grid size-8 place-items-center rounded-md bg-slate-950/75 text-white opacity-0 transition group-hover:opacity-100">
          <Expand size={16} />
        </span>
        <span className="block border-t border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
          {label}
        </span>
      </button>

      {isPreviewOpen ? (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/80 p-8"
          role="dialog"
          aria-modal="true"
          aria-label={`${label} 사진 상세보기`}
          onClick={() => setIsPreviewOpen(false)}
        >
          <div
            className="relative max-h-full max-w-6xl"
            onClick={(event) => event.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayUrl}
              alt={`${label} 증적 사진 상세보기`}
              className="max-h-[82vh] max-w-full rounded-lg bg-white object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setIsPreviewOpen(false)}
              className="absolute right-3 top-3 grid size-10 place-items-center rounded-md bg-slate-950/80 text-white transition hover:bg-slate-950"
              aria-label="상세보기 닫기"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
