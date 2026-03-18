"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import type { CreateReviewPayload } from "@/src/domain/types";
import { extractApiErrorMessage } from "@/src/lib/api-error";

function CompletePageContent() {
  const searchParams = useSearchParams();

  const reservationId = searchParams.get("reservationId") ?? "";
  const garageName = searchParams.get("garageName") ?? "강남 셀프정비소";
  const carLabel = searchParams.get("carLabel") ?? "아반떼 CN7";
  const workTitle = searchParams.get("workTitle") ?? "엔진오일 교환";
  const totalPrice = Number(searchParams.get("totalPrice") ?? "15000");
  const extraFee = Number(searchParams.get("extraFee") ?? "0");

  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewSaved, setReviewSaved] = useState(false);
  const [reviewError, setReviewError] = useState("");

  const total = totalPrice + extraFee;

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
    try {
      const payload: CreateReviewPayload = {
        reservationId,
        rating,
        comment: reviewText.trim() || undefined,
      };

      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        setReviewError(extractApiErrorMessage(data, "리뷰 저장에 실패했습니다."));
        return;
      }

      setReviewSaved(true);
    } catch {
      setReviewError("리뷰 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSubmittingReview(false);
    }
  }

  return (
    <section className="pb-24 pt-6">
      <div className="mb-4 text-center">
        <p className="text-6xl text-emerald-600">✓</p>
        <h1 className="text-4xl font-semibold text-zinc-900">이용 완료</h1>
        <p className="mt-2 text-lg text-zinc-500">정비가 마무리되었습니다.</p>
      </div>

      <div className="rounded-2xl bg-zinc-100 p-4">
        <h2 className="text-xl font-semibold text-zinc-900">이용 요약</h2>
        <p className="mt-3 flex justify-between text-base text-zinc-700"><span>작업</span><span>{workTitle}</span></p>
        <p className="mt-2 flex justify-between text-base text-zinc-700"><span>업장</span><span>{garageName}</span></p>
        <p className="mt-2 flex justify-between text-base text-zinc-700"><span>차량</span><span>{carLabel}</span></p>
      </div>

      <div className="mt-4 rounded-2xl bg-zinc-100 p-4">
        <h2 className="text-xl font-semibold text-zinc-900">결제 요약</h2>
        <p className="mt-3 flex justify-between text-base text-zinc-700"><span>기본 요금</span><span>{totalPrice.toLocaleString("ko-KR")}원</span></p>
        <p className="mt-2 flex justify-between text-base text-zinc-700"><span>추가 요금</span><span>{extraFee.toLocaleString("ko-KR")}원</span></p>
        <div className="my-3 border-t border-zinc-300" />
        <p className="flex justify-between text-2xl font-semibold text-zinc-900"><span>총 결제</span><span className="text-blue-600">{total.toLocaleString("ko-KR")}원</span></p>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-2xl font-semibold text-zinc-900">리뷰를 남겨주세요</h2>

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
                disabled={reviewSaved}
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
          disabled={reviewSaved}
        />

        {reviewError ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{reviewError}</p> : null}
        {reviewSaved ? <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">리뷰 저장이 완료되었습니다.</p> : null}

        <button
          type="button"
          onClick={handleSubmitReview}
          disabled={isSubmittingReview || reviewSaved}
          className="mt-3 h-11 w-full rounded-xl bg-zinc-900 text-base font-semibold text-white disabled:bg-zinc-200 disabled:text-zinc-500"
        >
          {reviewSaved ? "리뷰 제출 완료" : isSubmittingReview ? "제출 중..." : "리뷰 제출"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" className="rounded-2xl bg-zinc-100 py-3 text-lg font-medium text-zinc-700">영수증</button>
        <Link href="/" className="rounded-2xl bg-blue-600 py-3 text-center text-lg font-semibold text-white">
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
