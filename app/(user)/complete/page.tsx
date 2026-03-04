"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function CompletePage() {
  const searchParams = useSearchParams();

  const garageName = searchParams.get("garageName") ?? "강남 셀프정비소";
  const workTitle = searchParams.get("workTitle") ?? "엔진오일 교환";
  const totalPrice = Number(searchParams.get("totalPrice") ?? "15000");
  const extraFee = Number(searchParams.get("extraFee") ?? "0");

  const [rating, setRating] = useState<number>(0);
  const [reviewText, setReviewText] = useState<string>("");

  const total = totalPrice + extraFee;

  return (
    <section className="pb-24 pt-6">
      <div className="mb-4 text-center">
        <p className="text-6xl text-emerald-600">✓</p>
        <h1 className="text-4xl font-semibold text-zinc-900">이용 완료!</h1>
        <p className="mt-2 text-lg text-zinc-500">수고하셨습니다 🚗</p>
      </div>

      <div className="rounded-2xl bg-zinc-100 p-4">
        <h2 className="text-xl font-semibold text-zinc-900">이용 요약</h2>
        <p className="mt-3 flex justify-between text-base text-zinc-700"><span>작업</span><span>{workTitle}</span></p>
        <p className="mt-2 flex justify-between text-base text-zinc-700"><span>지점</span><span>{garageName}</span></p>
        <p className="mt-2 flex justify-between text-base text-zinc-700"><span>이용 시간</span><span>1시간 15분</span></p>
      </div>

      <div className="mt-4 rounded-2xl bg-zinc-100 p-4">
        <h2 className="text-xl font-semibold text-zinc-900">결제 요약</h2>
        <p className="mt-3 flex justify-between text-base text-zinc-700"><span>기본 요금</span><span>{totalPrice.toLocaleString("ko-KR")}원</span></p>
        <p className="mt-2 flex justify-between text-base text-zinc-700"><span>추가 요금</span><span>{extraFee.toLocaleString("ko-KR")}원</span></p>
        <div className="my-3 border-t border-zinc-300" />
        <p className="flex justify-between text-2xl font-semibold text-zinc-900"><span>총 결제</span><span className="text-blue-600">{total.toLocaleString("ko-KR")}원</span></p>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-2xl font-semibold text-zinc-900">후기를 남겨주세요</h2>

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
          placeholder="한줄 후기를 남겨주세요"
          value={reviewText}
          onChange={(event) => setReviewText(event.target.value)}
        />

        <button
          type="button"
          className="mt-3 h-11 w-full rounded-xl bg-zinc-200 text-base font-semibold text-zinc-600"
        >
          후기 제출
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
