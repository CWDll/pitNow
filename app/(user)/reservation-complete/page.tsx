"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function ReservationCompletePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const reservationId = searchParams.get("reservationId") ?? "";
  const garageName = searchParams.get("garageName") ?? "강남 셀프정비소";
  const dateLabel = searchParams.get("dateLabel") ?? "2/28(금) 14:00 - 15:00";
  const bayLabel = searchParams.get("bayLabel") ?? "3번 베이";
  const startTime = searchParams.get("startTime") ?? "";
  const endTime = searchParams.get("endTime") ?? "";
  const totalPrice = searchParams.get("totalPrice") ?? "15000";
  const workTitle = searchParams.get("workTitle") ?? "엔진오일 교환";

  const query = new URLSearchParams({
    reservationId,
    garageName,
    bayLabel,
    startTime,
    endTime,
    totalPrice,
    workTitle,
  }).toString();

  return (
    <section className="pb-24 pt-6">
      <div className="mb-4 text-center">
        <p className="text-6xl text-emerald-600">✓</p>
        <h1 className="text-4xl font-semibold text-zinc-900">예약 완료!</h1>
        <p className="mt-2 text-lg text-zinc-500">아래 QR 코드로 체크인하세요</p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center">
        <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">
          QR 코드
        </div>
        <p className="mt-3 text-sm text-zinc-500">체크인 시 이 QR 코드를 스캔하세요</p>
      </div>

      <div className="mt-4 rounded-2xl bg-zinc-100 p-4 text-base text-zinc-700">
        <p className="flex justify-between"><span>날짜/시간</span><span>{dateLabel}</span></p>
        <p className="mt-2 flex justify-between"><span>지점</span><span>{garageName}</span></p>
        <p className="mt-2 flex justify-between"><span>베이</span><span>{bayLabel}</span></p>
        <p className="mt-2 flex justify-between"><span>예약 ID</span><span className="max-w-[220px] truncate">{reservationId || "(없음)"}</span></p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" className="rounded-2xl bg-zinc-100 py-3 text-lg font-medium text-zinc-700">길찾기</button>
        <button type="button" className="rounded-2xl bg-zinc-100 py-3 text-lg font-medium text-zinc-700">전화하기</button>
      </div>

      <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-zinc-700">
        <p className="font-semibold text-blue-600">준비물 / 주의사항</p>
        <ul className="mt-2 list-disc pl-5 text-sm">
          <li>작업복 또는 더러워져도 되는 옷</li>
          <li>교체할 엔진오일 (매장 구매 가능)</li>
          <li>예약 시간 10분 전 도착</li>
          <li>차량 보험증 지참</li>
        </ul>
      </div>

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 bg-white px-4 pb-3 pt-2">
        <button
          type="button"
          onClick={() => router.push(`/checkin?${query}`)}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white"
        >
          체크인하러 가기
        </button>
      </div>
    </section>
  );
}
