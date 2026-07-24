"use client";

import { ImagePlus, Images, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { authFetch } from "@/src/lib/auth-fetch";
import { normalizeReservationImage } from "@/src/lib/heic-image";

interface PartnerImage {
  id: string;
  path: string;
  url: string;
  sortOrder: number;
  isCover: boolean;
}

async function readPayload(response: Response) {
  try {
    return (await response.json()) as {
      images?: PartnerImage[];
      image?: PartnerImage;
      error?: { message?: string } | string;
    };
  } catch {
    return {};
  }
}

function errorMessage(
  payload: Awaited<ReturnType<typeof readPayload>>,
  fallback: string,
) {
  if (typeof payload.error === "string") {
    return payload.error;
  }

  return payload.error?.message ?? fallback;
}

export function PartnerImageManager({
  partnerId,
  partnerName,
}: {
  partnerId: string;
  partnerName: string;
}) {
  const [images, setImages] = useState<PartnerImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!partnerId) {
      setImages([]);
      return;
    }

    let mounted = true;

    async function loadImages() {
      setIsLoading(true);
      setError("");
      const query = new URLSearchParams({ partnerId });
      const response = await authFetch(
        `/api/partner-admin/images?${query.toString()}`,
      );
      const payload = await readPayload(response);

      if (!mounted) {
        return;
      }

      if (!response.ok) {
        setImages([]);
        setError(
          errorMessage(payload, "정비소 사진을 불러오지 못했습니다."),
        );
      } else {
        setImages(payload.images ?? []);
      }
      setIsLoading(false);
    }

    void loadImages();
    return () => {
      mounted = false;
    };
  }, [partnerId]);

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0 || !partnerId) {
      return;
    }

    const availableCount = Math.max(0, 8 - images.length);
    const selected = Array.from(files).slice(0, availableCount);

    if (selected.length === 0) {
      setError("정비소 사진은 최대 8장까지 등록할 수 있습니다.");
      return;
    }

    setIsUploading(true);
    setMessage("");
    setError("");

    try {
      const uploaded: PartnerImage[] = [];
      for (const file of selected) {
        const normalized = await normalizeReservationImage(file);
        const formData = new FormData();
        formData.set("partnerId", partnerId);
        formData.set("file", normalized);

        const response = await authFetch("/api/partner-admin/images", {
          method: "POST",
          body: formData,
        });
        const payload = await readPayload(response);

        if (!response.ok || !payload.image) {
          throw new Error(
            errorMessage(payload, "정비소 사진을 업로드하지 못했습니다."),
          );
        }

        uploaded.push(payload.image);
      }

      setImages((current) => [...current, ...uploaded]);
      setMessage(`${uploaded.length}장의 정비소 사진을 등록했습니다.`);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "정비소 사진을 업로드하지 못했습니다.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function makeCover(imageId: string) {
    setUpdatingId(imageId);
    setMessage("");
    setError("");

    const response = await authFetch("/api/partner-admin/images", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerId, imageId }),
    });
    const payload = await readPayload(response);

    if (!response.ok) {
      setError(errorMessage(payload, "대표 사진을 변경하지 못했습니다."));
    } else {
      setImages((current) =>
        current.map((image) => ({
          ...image,
          isCover: image.id === imageId,
        })),
      );
      setMessage("홈에 표시할 대표 사진을 변경했습니다.");
    }

    setUpdatingId("");
  }

  async function deleteImage(imageId: string) {
    setUpdatingId(imageId);
    setMessage("");
    setError("");

    const response = await authFetch("/api/partner-admin/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerId, imageId }),
    });
    const payload = await readPayload(response);

    if (!response.ok) {
      setError(errorMessage(payload, "정비소 사진을 삭제하지 못했습니다."));
    } else {
      setImages((current) => {
        const remaining = current.filter((image) => image.id !== imageId);
        if (remaining.length > 0 && !remaining.some((image) => image.isCover)) {
          return remaining.map((image, index) => ({
            ...image,
            isCover: index === 0,
          }));
        }
        return remaining;
      });
      setMessage("정비소 사진을 삭제했습니다.");
    }

    setUpdatingId("");
  }

  return (
    <section
      id="images"
      className="scroll-mt-24 rounded-lg border border-slate-200 bg-white"
    >
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">정비소 사진</h2>
          <p className="mt-1 text-xs text-slate-500">
            {partnerName}의 작업 공간과 장비 사진을 최대 8장 등록하고 홈 대표
            사진을 지정합니다.
          </p>
        </div>
        <label
          className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white ${
            isUploading || images.length >= 8
              ? "pointer-events-none opacity-50"
              : ""
          }`}
        >
          <ImagePlus className="size-4" />
          {isUploading ? "업로드 중" : "사진 추가"}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              void uploadFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </div>

      <div className="p-4">
        {message ? (
          <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}

        {isLoading ? (
          <p className="py-8 text-center text-sm text-slate-500">
            정비소 사진을 불러오는 중입니다.
          </p>
        ) : images.length === 0 ? (
          <div className="grid min-h-36 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center text-slate-500">
            <div>
              <Images className="mx-auto size-6" />
              <p className="mt-2 text-sm font-semibold">
                아직 등록된 정비소 사진이 없습니다.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {images.map((image, index) => (
              <article
                key={image.id}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={`${partnerName} 정비소 사진 ${index + 1}`}
                    className="aspect-[4/3] w-full object-cover"
                  />
                  {image.isCover ? (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-xs font-bold text-white">
                      <Star className="size-3 fill-current" />
                      대표
                    </span>
                  ) : null}
                </div>
                <div className="grid grid-cols-[1fr_40px] gap-2 p-2">
                  <button
                    type="button"
                    disabled={image.isCover || updatingId === image.id}
                    onClick={() => void makeCover(image.id)}
                    className="h-9 rounded-md border border-slate-200 text-xs font-semibold text-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {image.isCover ? "홈 대표 사진" : "대표로 지정"}
                  </button>
                  <button
                    type="button"
                    disabled={updatingId === image.id}
                    onClick={() => void deleteImage(image.id)}
                    aria-label={`정비소 사진 ${index + 1} 삭제`}
                    title="사진 삭제"
                    className="grid size-9 place-items-center rounded-md border border-red-200 text-red-600 disabled:opacity-40"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
