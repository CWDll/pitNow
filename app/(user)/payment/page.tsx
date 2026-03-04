"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import type { CreateReservationPayload } from "@/src/domain/types";

const paymentMethods = ["신용/체크카드", "카카오페이", "네이버페이", "토스페이"] as const;

function parseReservationId(payload: unknown): string | null {
  if (payload && typeof payload === "object" && "id" in payload) {
    const id = (payload as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }

  if (Array.isArray(payload) && payload[0] && typeof payload[0] === "object") {
    const id = (payload[0] as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }

  return null;
}

export default function PaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [method, setMethod] = useState<(typeof paymentMethods)[number]>("신용/체크카드");
  const [isPaying, setIsPaying] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const garageName = searchParams.get("garageName") ?? "강남 셀프정비소";
  const workId = searchParams.get("workId") ?? "engine-oil";
  const dateLabel = searchParams.get("dateLabel") ?? "2/28(금) 14:00 - 15:00";
  const bayLabel = searchParams.get("bayLabel") ?? "3번 베이";
  const bayId = searchParams.get("bayId") ?? "00000000-0000-0000-0000-000000000001";
  const startTime = searchParams.get("startTime") ?? "";
  const endTime = searchParams.get("endTime") ?? "";
  const totalPrice = Number(searchParams.get("totalPrice") ?? "15000");

  const workTitle = useMemo(() => {
    if (workId === "brake-pad") return "브레이크 패드 교환";
    if (workId === "tire-rotation") return "타이어 로테이션";
    if (workId === "air-filter") return "에어필터 교환";
    if (workId === "wiper") return "와이퍼 블레이드 교체";
    return "엔진오일 교환";
  }, [workId]);

  async function handlePay() {
    setError("");

    if (!startTime || !endTime) {
      setError("시간 정보가 누락되어 결제를 진행할 수 없습니다.");
      return;
    }

    setIsPaying(true);

    try {
      const body: CreateReservationPayload = {
        bayId,
        startTime,
        endTime,
      };

      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          data && typeof data === "object" && "error" in data && typeof (data as { error?: unknown }).error === "string"
            ? ((data as { error: string }).error)
            : "결제 처리 중 예약 생성에 실패했습니다.";
        setError(message);
        return;
      }

      const reservationId = parseReservationId(data);
      if (!reservationId) {
        setError("예약 ID를 확인할 수 없습니다.");
        return;
      }

      const query = new URLSearchParams({
        reservationId,
        garageName,
        workTitle,
        dateLabel,
        bayLabel,
        totalPrice: String(totalPrice),
        startTime,
        endTime,
      });
      router.push(`/reservation-complete?${query.toString()}`);
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsPaying(false);
    }
  }

  return (
    <section className="pb-24">
      <header className="mb-4 flex items-center gap-2">
        <button type="button" onClick={() => router.back()} className="text-2xl text-zinc-700" aria-label="뒤로가기">
          ←
        </button>
        <h1 className="text-3xl font-semibold text-zinc-900">결제</h1>
      </header>

      <div className="rounded-2xl bg-zinc-100 p-4">
        <h2 className="mb-3 text-xl font-semibold">주문 요약</h2>
        <div className="space-y-2 text-base text-zinc-700">
          <p className="flex justify-between"><span>작업</span><span>{workTitle}</span></p>
          <p className="flex justify-between"><span>지점</span><span>{garageName}</span></p>
          <p className="flex justify-between"><span>날짜/시간</span><span>{dateLabel}</span></p>
          <p className="flex justify-between"><span>베이</span><span>{bayLabel}</span></p>
          <p className="flex justify-between"><span>차량</span><span>현대 아반떼 CN7</span></p>
        </div>
        <div className="my-3 border-t border-zinc-300" />
        <p className="flex justify-between text-2xl font-semibold">
          <span>결제 금액</span>
          <span className="text-blue-600">{totalPrice.toLocaleString("ko-KR")}원</span>
        </p>
      </div>

      <div className="mt-5 space-y-2">
        <h2 className="text-xl font-semibold text-zinc-900">결제 수단</h2>
        {paymentMethods.map((item) => {
          const selected = method === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => setMethod(item)}
              className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-lg ${
                selected ? "border-blue-600 bg-blue-50" : "border-zinc-300 bg-white"
              }`}
            >
              <span>{item}</span>
              <span className={`h-5 w-5 rounded-full border ${selected ? "border-blue-600 bg-blue-600" : "border-zinc-300"}`} />
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-700">
        <p className="font-semibold">취소/노쇼 규정</p>
        <ul className="mt-2 list-disc pl-5">
          <li>이용 24시간 전: 전액 환불</li>
          <li>이용 2시간 전: 50% 환불</li>
          <li>노쇼: 환불 불가 + 패널티 부과</li>
        </ul>
      </div>

      {error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 bg-white px-4 pb-3 pt-2">
        <button
          type="button"
          onClick={handlePay}
          disabled={isPaying}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white disabled:bg-zinc-300 disabled:text-zinc-500"
        >
          {isPaying ? "결제 처리 중..." : `${totalPrice.toLocaleString("ko-KR")}원 결제하기`}
        </button>
      </div>
    </section>
  );
}
