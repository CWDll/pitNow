"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

interface CheckoutApiError {
  error?: string | { message?: string };
}

const paymentMethods = ["신용/체크카드", "카카오페이", "네이버페이", "토스페이"] as const;

type PaymentMethod = (typeof paymentMethods)[number];

function extractError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const typed = payload as CheckoutApiError;
  if (typeof typed.error === "string") {
    return typed.error;
  }

  if (typed.error && typeof typed.error === "object" && typeof typed.error.message === "string") {
    return typed.error.message;
  }

  return null;
}

function buildMockUrl(reservationId: string, file: File, key: string): string {
  return `mock://checkout/${reservationId}/${key}/${encodeURIComponent(file.name)}`;
}

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const reservationId = searchParams.get("reservationId") ?? "";
  const partnerId = searchParams.get("partnerId") ?? "";
  const garageName = searchParams.get("garageName") ?? "강남 셀프정비소";
  const workTitle = searchParams.get("workTitle") ?? "엔진오일 교환";
  const totalPrice = Number(searchParams.get("totalPrice") ?? "15000");
  const previewFee = Number(searchParams.get("previewFee") ?? "0");
  const overdueMinutes = Number(searchParams.get("overdueMinutes") ?? "0");

  const [checks, setChecks] = useState<boolean[]>([false, false, false]);
  const [photo1, setPhoto1] = useState<File | null>(null);
  const [photo2, setPhoto2] = useState<File | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [isPaid, setIsPaid] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPaying, setIsPaying] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const additionalFee = useMemo(() => {
    if (!Number.isFinite(previewFee) || previewFee <= 0) {
      return 0;
    }

    return previewFee;
  }, [previewFee]);

  const requiresAdditionalPayment = additionalFee > 0;

  const canSubmitBase =
    reservationId.length > 0 && checks.every(Boolean) && photo1 !== null && photo2 !== null;
  const canSubmit = canSubmitBase && (!requiresAdditionalPayment || isPaid);

  async function handleMockAdditionalPayment() {
    setError("");

    if (!requiresAdditionalPayment) {
      setIsPaid(true);
      return;
    }

    if (!method) {
      setError("추가 요금 결제 수단을 선택해 주세요.");
      return;
    }

    setIsPaying(true);
    try {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 600);
      });
      setIsPaid(true);
    } finally {
      setIsPaying(false);
    }
  }

  async function handleComplete() {
    setError("");

    if (!canSubmitBase) {
      setError("체크리스트와 사진 2장을 모두 완료해 주세요.");
      return;
    }

    if (requiresAdditionalPayment && !isPaid) {
      setError("추가 요금을 먼저 결제해야 완료할 수 있습니다.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reservationId }),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        setError(extractError(data) ?? "체크아웃 처리에 실패했습니다.");
        return;
      }

      const extraFee =
        data && typeof data === "object" && "extraFee" in data && typeof (data as { extraFee?: unknown }).extraFee === "number"
          ? (data as { extraFee: number }).extraFee
          : additionalFee;

      const query = new URLSearchParams({
        reservationId,
        partnerId,
        garageName,
        workTitle,
        totalPrice: String(totalPrice),
        extraFee: String(extraFee),
        checkoutPhoto1: buildMockUrl(reservationId, photo1, "photo1"),
        checkoutPhoto2: buildMockUrl(reservationId, photo2, "photo2"),
      });

      router.push(`/complete?${query.toString()}`);
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="pb-24">
      <header className="mb-4 flex items-center gap-2">
        <button type="button" onClick={() => router.back()} className="text-2xl text-zinc-700" aria-label="뒤로가기">
          ←
        </button>
        <h1 className="text-3xl font-semibold text-zinc-900">체크아웃</h1>
      </header>

      <div className="space-y-3">
        <h2 className="text-xl font-semibold">정리 체크리스트</h2>
        {["공구 반납 완료", "베이 청소 완료", "폐유/폐기물 처리 완료"].map((item, index) => (
          <label key={item} className="flex items-center gap-3 text-lg text-zinc-800">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={checks[index]}
              onChange={() =>
                setChecks((prev) => {
                  const next = [...prev];
                  next[index] = !next[index];
                  return next;
                })
              }
            />
            <span>{item}</span>
          </label>
        ))}
      </div>

      <div className="mt-5">
        <h2 className="mb-2 text-xl font-semibold">체크아웃 사진</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className={`flex h-32 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed ${photo1 ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-zinc-300 bg-zinc-100 text-zinc-500"}`}>
            {photo1 ? "사진1 완료" : "사진 1"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto1(e.target.files?.[0] ?? null)} />
          </label>
          <label className={`flex h-32 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed ${photo2 ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-zinc-300 bg-zinc-100 text-zinc-500"}`}>
            {photo2 ? "사진2 완료" : "사진 2"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto2(e.target.files?.[0] ?? null)} />
          </label>
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-zinc-100 p-4 text-base text-zinc-700">
        <h3 className="mb-2 text-xl font-semibold text-zinc-900">추가요금 / 패널티</h3>
        <p className="flex justify-between"><span>초과 이용 시간</span><span>{overdueMinutes}분</span></p>
        <p className="mt-2 flex justify-between text-red-500"><span>추가 요금</span><span>{additionalFee.toLocaleString("ko-KR")}원</span></p>
        <div className="my-3 border-t border-zinc-300" />
        <p className="flex justify-between text-xl font-semibold text-zinc-900">
          <span>추가 결제 금액</span>
          <span className="text-red-500">{additionalFee.toLocaleString("ko-KR")}원</span>
        </p>
      </div>

      {requiresAdditionalPayment ? (
        <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
          <h3 className="mb-2 text-xl font-semibold text-zinc-900">추가요금 결제 수단</h3>
          <div className="space-y-2">
            {paymentMethods.map((item) => {
              const selected = method === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setMethod(item);
                    setIsPaid(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left text-base ${
                    selected ? "border-blue-600 bg-blue-50" : "border-zinc-300 bg-white"
                  }`}
                >
                  <span>{item}</span>
                  <span className={`h-5 w-5 rounded-full border ${selected ? "border-blue-600 bg-blue-600" : "border-zinc-300"}`} />
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleMockAdditionalPayment}
            disabled={isPaying || isPaid}
            className="mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 text-base font-semibold text-white disabled:bg-zinc-300 disabled:text-zinc-500"
          >
            {isPaid
              ? "추가요금 결제 완료"
              : isPaying
                ? "추가요금 결제 중..."
                : `${additionalFee.toLocaleString("ko-KR")}원 추가 결제하기`}
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 bg-white px-4 pb-3 pt-2">
        <button
          type="button"
          onClick={handleComplete}
          disabled={!canSubmit || isLoading}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white disabled:bg-zinc-300 disabled:text-zinc-500"
        >
          {isLoading ? "완료 처리 중..." : "완료하기"}
        </button>
      </div>
    </section>
  );
}
