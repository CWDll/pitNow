"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, ImagePlus, LoaderCircle, X } from "lucide-react";

import type {
  CreateReviewPayload,
  ReservationStatus,
  ReservationType,
} from "@/src/domain/types";
import { extractApiErrorMessage } from "@/src/lib/api-error";
import { authFetch } from "@/src/lib/auth-fetch";
import { requireClientSession } from "@/src/lib/client-auth";
import {
  deletePublicImage,
  uploadPublicImage,
} from "@/src/lib/public-image-upload";

interface ReviewImage {
  path: string;
  url: string;
}

interface PendingReviewImage {
  id: string;
  file: File;
  previewUrl: string;
}

interface ReviewApiError {
  error?: string | { message?: string };
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const typed = payload as ReviewApiError;

  if (typeof typed.error === "string" && typed.error) {
    return typed.error;
  }

  if (
    typed.error &&
    typeof typed.error === "object" &&
    typeof typed.error.message === "string"
  ) {
    return typed.error.message;
  }

  return null;
}

interface ReservationDetail {
  id: string;
  reservationType: ReservationType;
  bookingMode: "SELF" | "PACKAGE";
  partnerId: string;
  garageName: string;
  bayId: string;
  bayLabel: string;
  carId: string;
  carLabel: string;
  startTime: string;
  endTime: string;
  dateLabel: string;
  status: ReservationStatus;
  totalPrice: number;
  workTitle: string;
  taskIds: string;
  taskLabels: string;
  selectedTaskCount: string;
}

interface ReservationDetailResponse {
  success: boolean;
  reservation?: ReservationDetail;
}

interface CheckoutDetail {
  id: string;
  reservationId: string;
  basePrice: number;
  extraFee: number;
  helperVerifyRequested: boolean;
  helperVerifyFee: number;
  totalSettlement: number;
  paidReservationAmount?: number;
  settlementAmountDue?: number;
  settlementPaymentStatus?: string | null;
  completedAt: string;
}

interface CheckoutDetailResponse {
  success: boolean;
  checkout?: CheckoutDetail;
}

function formatUsageDuration(startTime: string, endTime: string): string {
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();

  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return "-";
  }

  const totalMinutes = Math.round((endMs - startMs) / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}시간 ${minutes}분`;
  }

  if (hours > 0) {
    return `${hours}시간`;
  }

  return `${minutes}분`;
}

function CompletePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const reservationId = searchParams.get("reservationId") ?? "";
  const isReservationHistoryEntry = searchParams.get("from") === "reservation";
  const fallbackWorkTitle = searchParams.get("workTitle") ?? "엔진오일 교환";
  const [detail, setDetail] = useState<ReservationDetail>(() => ({
    id: reservationId,
    reservationType:
      searchParams.get("reservationType") === "SHOP_SERVICE"
        ? "SHOP_SERVICE"
        : "SELF_SERVICE",
    bookingMode:
      searchParams.get("bookingMode") === "PACKAGE" ? "PACKAGE" : "SELF",
    partnerId: searchParams.get("partnerId") ?? "",
    garageName: searchParams.get("garageName") ?? "강남 셀프정비소",
    bayId: "",
    bayLabel: searchParams.get("bayLabel") ?? "3번 베이",
    carId: searchParams.get("carId") ?? "",
    carLabel: searchParams.get("carLabel") ?? "현대 아반떼 CN7",
    startTime: searchParams.get("startTime") ?? "",
    endTime: searchParams.get("endTime") ?? "",
    dateLabel: searchParams.get("dateLabel") ?? "",
    status: "COMPLETED",
    totalPrice: Number(searchParams.get("totalPrice") ?? "15000"),
    workTitle: fallbackWorkTitle,
    taskIds: searchParams.get("taskIds") ?? "",
    taskLabels: searchParams.get("taskLabels") ?? fallbackWorkTitle,
    selectedTaskCount: searchParams.get("selectedTaskCount") ?? "1",
  }));
  const [checkout, setCheckout] = useState<CheckoutDetail>(() => ({
    id: "",
    reservationId,
    basePrice: Number(searchParams.get("totalPrice") ?? "15000"),
    extraFee: Number(searchParams.get("extraFee") ?? "0"),
    helperVerifyRequested:
      Number(searchParams.get("helperVerifyFee") ?? "0") > 0,
    helperVerifyFee: Number(searchParams.get("helperVerifyFee") ?? "0"),
    totalSettlement: Number(searchParams.get("totalSettlement") ?? "0"),
    completedAt: "",
  }));
  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(
    Boolean(reservationId),
  );
  const [detailError, setDetailError] = useState("");

  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewSaved, setReviewSaved] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [hasExistingReview, setHasExistingReview] = useState(false);
  const [isLoadingReview, setIsLoadingReview] = useState(true);
  const [reviewImages, setReviewImages] = useState<ReviewImage[]>([]);
  const [pendingReviewImages, setPendingReviewImages] = useState<
    PendingReviewImage[]
  >([]);
  const [deletingImagePath, setDeletingImagePath] = useState("");
  const reviewImageInputRef = useRef<HTMLInputElement>(null);

  const basePrice = Number.isFinite(checkout.basePrice)
    ? checkout.basePrice
    : detail.totalPrice;
  const extraFee = Number.isFinite(checkout.extraFee) ? checkout.extraFee : 0;
  const helperVerifyFee = Number.isFinite(checkout.helperVerifyFee)
    ? checkout.helperVerifyFee
    : 0;
  const total =
    Number.isFinite(checkout.totalSettlement) && checkout.totalSettlement > 0
      ? checkout.totalSettlement
      : basePrice + extraFee + helperVerifyFee;
  const paidReservationAmount = Number.isFinite(checkout.paidReservationAmount)
    ? (checkout.paidReservationAmount ?? detail.totalPrice)
    : detail.totalPrice;
  const settlementAmountDue =
    typeof checkout.settlementAmountDue === "number" &&
    Number.isFinite(checkout.settlementAmountDue)
      ? checkout.settlementAmountDue
      : Math.max(0, total - paidReservationAmount);
  const settlementPaymentStatus = checkout.settlementPaymentStatus ?? null;
  const isSettlementPaid = settlementPaymentStatus === "SETTLEMENT_CONFIRMED";

  useEffect(() => {
    let isCancelled = false;

    async function hydrateCompleteDetail() {
      if (!reservationId) {
        setIsDetailLoading(false);
        return;
      }

      setIsDetailLoading(true);

      try {
        const [reservationResponse, checkoutResponse] = await Promise.all([
          authFetch(`/api/reservations/${reservationId}`, {
            method: "GET",
            cache: "no-store",
          }),
          authFetch(
            `/api/checkouts?reservationId=${encodeURIComponent(reservationId)}`,
            {
              method: "GET",
              cache: "no-store",
            },
          ),
        ]);

        const reservationPayload =
          (await reservationResponse.json()) as ReservationDetailResponse;
        const checkoutPayload =
          (await checkoutResponse.json()) as CheckoutDetailResponse;

        if (isCancelled) {
          return;
        }

        if (
          reservationResponse.ok &&
          reservationPayload.success &&
          reservationPayload.reservation
        ) {
          setDetail(reservationPayload.reservation);
        } else {
          setDetailError(
            extractApiErrorMessage(
              reservationPayload,
              "예약 상세 정보를 불러오지 못했습니다.",
            ),
          );
        }

        if (
          checkoutResponse.ok &&
          checkoutPayload.success &&
          checkoutPayload.checkout
        ) {
          setCheckout(checkoutPayload.checkout);
        } else {
          setDetailError(
            extractApiErrorMessage(
              checkoutPayload,
              "체크아웃 정산 정보를 불러오지 못했습니다.",
            ),
          );
        }
      } catch {
        if (!isCancelled) {
          setDetailError("완료 정보를 불러오지 못했습니다.");
        }
      } finally {
        if (!isCancelled) {
          setIsDetailLoading(false);
        }
      }
    }

    void hydrateCompleteDetail();

    return () => {
      isCancelled = true;
    };
  }, [reservationId]);

  useEffect(() => {
    if (
      !isDetailLoading &&
      checkout.id &&
      reservationId &&
      settlementAmountDue > 0 &&
      !isSettlementPaid
    ) {
      router.replace(
        `/settlement-payment?reservationId=${encodeURIComponent(
          reservationId,
        )}`,
      );
    }
  }, [
    checkout.id,
    isDetailLoading,
    isSettlementPaid,
    reservationId,
    router,
    settlementAmountDue,
  ]);

  async function handleSubmitReview() {
    setReviewError("");

    if (!reservationId) {
      setReviewError("리뷰 작성에 필요한 예약 정보가 없습니다.");
      return;
    }

    if (rating < 1 || rating > 5) {
      setReviewError("별점을 선택해 주세요.");
      return;
    }

    setIsSubmittingReview(true);
    const uploadedImages: ReviewImage[] = [];

    try {
      const hasSession = await requireClientSession();

      if (!hasSession) {
        return;
      }

      for (const pendingImage of pendingReviewImages) {
        const uploaded = await uploadPublicImage({
          endpoint: "/api/review-images",
          file: pendingImage.file,
          fields: { reservationId },
        });
        uploadedImages.push(uploaded);
      }

      const imagePaths = [...reviewImages, ...uploadedImages].map(
        (image) => image.path,
      );
      const payload: CreateReviewPayload = {
        reservationId,
        rating,
        comment: reviewText.trim() || undefined,
        imagePaths,
      };

      const response = await authFetch("/api/reviews", {
        method: hasExistingReview ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        await Promise.allSettled(
          uploadedImages.map((image) =>
            deletePublicImage({
              endpoint: "/api/review-images",
              body: { path: image.path },
            }),
          ),
        );
        setReviewError(
          extractErrorMessage(data) ?? "후기 저장에 실패했습니다.",
        );
        return;
      }

      setHasExistingReview(true);
      setReviewImages((current) => [...current, ...uploadedImages]);
      setPendingReviewImages((current) => {
        current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
        return [];
      });
      setReviewSaved(true);
    } catch (error) {
      await Promise.allSettled(
        uploadedImages.map((image) =>
          deletePublicImage({
            endpoint: "/api/review-images",
            body: { path: image.path },
          }),
        ),
      );
      setReviewError(
        error instanceof Error
          ? error.message
          : "네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setIsSubmittingReview(false);
    }
  }

  useEffect(() => {
    let isCancelled = false;

    async function loadExistingReview() {
      if (!reservationId) {
        if (!isCancelled) {
          setIsLoadingReview(false);
        }
        return;
      }

      try {
        const response = await authFetch(
          `/api/reviews?reservationId=${encodeURIComponent(reservationId)}`,
          {
            method: "GET",
            cache: "no-store",
          },
        );

        const data: unknown = await response.json();

        if (!response.ok || isCancelled) {
          return;
        }

        const review =
          data && typeof data === "object" && "review" in data
            ? (
                data as {
                  review?: {
                    rating?: number;
                    comment?: string | null;
                    images?: ReviewImage[];
                  } | null;
                }
              ).review
            : null;

        if (review) {
          if (typeof review.rating === "number") {
            setRating(review.rating);
          }

          if (typeof review.comment === "string") {
            setReviewText(review.comment);
          }

          setReviewImages(Array.isArray(review.images) ? review.images : []);
          setHasExistingReview(true);
        }
      } catch {
        setReviewError("기존 리뷰를 불러오지 못했습니다.");
      } finally {
        if (!isCancelled) {
          setIsLoadingReview(false);
        }
      }
    }

    void loadExistingReview();

    return () => {
      isCancelled = true;
    };
  }, [reservationId]);

  function handleReviewImageSelection(files: FileList | null) {
    if (!files) {
      return;
    }

    const availableSlots = 4 - reviewImages.length - pendingReviewImages.length;
    const selected = Array.from(files).slice(0, Math.max(0, availableSlots));

    if (selected.length === 0) {
      setReviewError("리뷰 사진은 최대 4장까지 등록할 수 있습니다.");
      return;
    }

    setReviewSaved(false);
    setReviewError("");
    setPendingReviewImages((current) => [
      ...current,
      ...selected.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);

    if (reviewImageInputRef.current) {
      reviewImageInputRef.current.value = "";
    }
  }

  function removePendingReviewImage(id: string) {
    setPendingReviewImages((current) => {
      const target = current.find((image) => image.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((image) => image.id !== id);
    });
    setReviewSaved(false);
  }

  async function removeSavedReviewImage(image: ReviewImage) {
    setDeletingImagePath(image.path);
    setReviewError("");

    try {
      await deletePublicImage({
        endpoint: "/api/review-images",
        body: { path: image.path },
      });
      setReviewImages((current) =>
        current.filter((item) => item.path !== image.path),
      );
      setReviewSaved(false);
    } catch (error) {
      setReviewError(
        error instanceof Error
          ? error.message
          : "리뷰 사진을 삭제하지 못했습니다.",
      );
    } finally {
      setDeletingImagePath("");
    }
  }

  return (
    <section className="pb-24 pt-6">
      {isReservationHistoryEntry ? (
        <Link
          href="/reservation"
          aria-label="예약 내역으로 돌아가기"
          className="mb-4 inline-flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm"
        >
          <ArrowLeft className="size-5" />
        </Link>
      ) : null}
      <div className="mb-4 text-center">
        <p className="text-6xl text-emerald-600">✓</p>
        <h1 className="text-4xl font-semibold text-zinc-900">이용 완료</h1>
        <p className="mt-2 text-lg text-zinc-500">정비가 마무리되었습니다.</p>
      </div>

      <div className="rounded-2xl bg-zinc-100 p-4">
        <h2 className="text-xl font-semibold text-zinc-900">이용 요약</h2>
        <p className="mt-3 flex justify-between text-base text-zinc-700">
          <span>작업</span>
          <span>{detail.taskLabels || detail.workTitle}</span>
        </p>
        <p className="mt-2 flex justify-between text-base text-zinc-700">
          <span>지점</span>
          <span>{detail.garageName}</span>
        </p>
        <p className="mt-2 flex justify-between text-base text-zinc-700">
          <span>차량</span>
          <span>{detail.carLabel}</span>
        </p>
        <p className="mt-2 flex justify-between text-base text-zinc-700">
          <span>날짜/시간</span>
          <span>{detail.dateLabel || "-"}</span>
        </p>
        <p className="mt-2 flex justify-between text-base text-zinc-700">
          <span>이용 시간</span>
          <span>{formatUsageDuration(detail.startTime, detail.endTime)}</span>
        </p>
        <p className="mt-2 flex justify-between text-base text-zinc-700">
          <span>상태</span>
          <span>{isDetailLoading ? "불러오는 중" : detail.status}</span>
        </p>
      </div>

      <div className="mt-4 rounded-2xl bg-zinc-100 p-4">
        <h2 className="text-xl font-semibold text-zinc-900">결제 요약</h2>
        <p className="mt-3 flex justify-between text-base text-zinc-700">
          <span>예약 시 결제</span>
          <span>{paidReservationAmount.toLocaleString("ko-KR")}원</span>
        </p>
        <p className="mt-2 flex justify-between text-base text-zinc-700">
          <span>정산 기준 기본요금</span>
          <span>{basePrice.toLocaleString("ko-KR")}원</span>
        </p>
        <p className="mt-2 flex justify-between text-base text-zinc-700">
          <span>추가 요금</span>
          <span>{extraFee.toLocaleString("ko-KR")}원</span>
        </p>
        <p className="mt-2 flex justify-between text-base text-zinc-700">
          <span>카 마스터 검수</span>
          <span>{helperVerifyFee.toLocaleString("ko-KR")}원</span>
        </p>
        <div className="my-3 border-t border-zinc-300" />
        <p className="flex justify-between text-2xl font-semibold text-zinc-900">
          <span>총 정산</span>
          <span className="text-blue-600">
            {total.toLocaleString("ko-KR")}원
          </span>
        </p>
        <p className="mt-3 flex justify-between text-lg font-semibold">
          <span>
            {isSettlementPaid ? "추가 정산 결제 완료" : "추가 결제 필요"}
          </span>
          <span
            className={isSettlementPaid ? "text-emerald-600" : "text-red-500"}
          >
            {settlementAmountDue.toLocaleString("ko-KR")}원
          </span>
        </p>
      </div>

      {detailError ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {detailError}
        </p>
      ) : null}

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-2xl font-semibold text-zinc-900">
          후기를 남겨주세요
        </h2>

        <div className="mt-3 flex items-center gap-2">
          {Array.from({ length: 5 }).map((_, index) => {
            const starNumber = index + 1;
            const active = starNumber <= rating;

            return (
              <button
                key={starNumber}
                type="button"
                onClick={() => setRating(starNumber)}
                className={`text-4xl leading-none ${active ? "text-amber-400" : "text-zinc-300"}`}
                aria-label={`${starNumber}점 선택`}
              >
                ★
              </button>
            );
          })}
        </div>

        <textarea
          className="mt-3 h-24 w-full rounded-xl bg-zinc-100 p-3 text-sm"
          placeholder="서비스 리뷰를 남겨주세요."
          value={reviewText}
          onChange={(event) => setReviewText(event.target.value)}
        />

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900">사진</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                정비 결과나 매장 이용 모습을 최대 4장까지 남길 수 있습니다.
              </p>
            </div>
            <span className="text-xs font-bold text-slate-500">
              {reviewImages.length + pendingReviewImages.length}/4
            </span>
          </div>

          <input
            ref={reviewImageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            className="sr-only"
            onChange={(event) =>
              handleReviewImageSelection(event.currentTarget.files)
            }
          />

          <div className="mt-3 grid grid-cols-2 gap-2">
            {reviewImages.map((image, index) => (
              <div
                key={image.path}
                className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
              >
                {/* Public review media is intentionally displayed as a direct image. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={`등록된 리뷰 사진 ${index + 1}`}
                  className="size-full object-cover"
                />
                <button
                  type="button"
                  aria-label={`등록된 리뷰 사진 ${index + 1} 삭제`}
                  disabled={deletingImagePath === image.path}
                  onClick={() => void removeSavedReviewImage(image)}
                  className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-slate-950/80 text-white disabled:opacity-60"
                >
                  {deletingImagePath === image.path ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <X className="size-4" />
                  )}
                </button>
              </div>
            ))}

            {pendingReviewImages.map((image, index) => (
              <div
                key={image.id}
                className="relative aspect-square overflow-hidden rounded-lg border border-blue-200 bg-blue-50"
              >
                {/* Browser object URLs are local previews and cannot use next/image. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.previewUrl}
                  alt={`추가할 리뷰 사진 ${index + 1}`}
                  className="size-full object-cover"
                />
                <button
                  type="button"
                  aria-label={`추가할 리뷰 사진 ${index + 1} 삭제`}
                  onClick={() => removePendingReviewImage(image.id)}
                  className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-slate-950/80 text-white"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}

            {reviewImages.length + pendingReviewImages.length < 4 ? (
              <button
                type="button"
                onClick={() => reviewImageInputRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-blue-300 bg-blue-50 text-blue-700"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-white">
                  {reviewImages.length + pendingReviewImages.length === 0 ? (
                    <Camera className="size-5" />
                  ) : (
                    <ImagePlus className="size-5" />
                  )}
                </span>
                <span className="text-xs font-black">사진 추가</span>
              </button>
            ) : null}
          </div>
        </div>

        {isLoadingReview ? (
          <p className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500">
            기존 리뷰를 확인하는 중입니다.
          </p>
        ) : null}
        {hasExistingReview && !reviewSaved ? (
          <p className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
            이미 작성한 리뷰입니다. 수정 후 저장할 수 있습니다.
          </p>
        ) : null}
        {reviewError ? (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {reviewError}
          </p>
        ) : null}
        {reviewSaved ? (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            리뷰 저장이 완료되었습니다.
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleSubmitReview}
          disabled={isSubmittingReview || isLoadingReview}
          className="mt-3 h-11 w-full rounded-xl bg-zinc-900 text-base font-semibold text-white disabled:bg-zinc-200 disabled:text-zinc-500"
        >
          {reviewSaved
            ? "후기 제출 완료"
            : isSubmittingReview
              ? "제출 중..."
              : "후기 제출"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link
          href={`/receipt?reservationId=${encodeURIComponent(reservationId)}`}
          className="rounded-2xl bg-zinc-100 py-3 text-center text-lg font-medium text-zinc-700"
        >
          영수증
        </Link>
        <Link
          href={
            detail.partnerId
              ? `/partner/${encodeURIComponent(detail.partnerId)}`
              : "/"
          }
          className="rounded-2xl bg-blue-600 py-3 text-center text-lg font-semibold text-white"
        >
          다시 예약
        </Link>
      </div>
    </section>
  );
}

export default function CompletePage() {
  return (
    <Suspense fallback={<section className="pb-24" />}>
      <CompletePageContent />
    </Suspense>
  );
}
