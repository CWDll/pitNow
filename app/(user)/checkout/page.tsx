"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChangeEvent, Suspense, useMemo, useState } from "react";

import { extractApiErrorMessage } from "@/src/lib/api-error";

type PaymentMethod = "신용/체크카드" | "카카오페이" | "네이버페이" | "토스페이";

const paymentMethods: PaymentMethod[] = ["신용/체크카드", "카카오페이", "네이버페이", "토스페이"];

function buildMockUrl(reservationId: string, file: File, key: string): string {
  return `mock://checkout/${reservationId}/${key}/${encodeURIComponent(file.name)}`;
}

function handleFileChange(event: ChangeEvent<HTMLInputElement>, setter: (file: File | null) => void) {
  setter(event.target.files?.[0] ?? null);
}

function CheckoutPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const reservationId = searchParams.get("reservationId") ?? "";
  const reservationType = searchParams.get("reservationType") ?? "SELF_SERVICE";
  const partnerId = searchParams.get("partnerId") ?? "";
  const carId = searchParams.get("carId") ?? "";
  const carLabel = searchParams.get("carLabel") ?? "아반떼 CN7";
  const garageName = searchParams.get("garageName") ?? "강남 셀프정비소";
  const workTitle = searchParams.get("workTitle") ?? "엔진오일 교환";
  const totalPrice = Number(searchParams.get("totalPrice") ?? "15000");
  const previewFee = Number(searchParams.get("previewFee") ?? "0");
  const overdueMinutes = Number(searchParams.get("overdueMinutes") ?? "0");

  const [checks, setChecks] = useState<boolean[]>([false, false, false]);
  const [photo1, setPhoto1] = useState<File | null>(null);
  const [photo2, setPhoto2] = useState<File | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState("");

  const additionalFee = useMemo(() => (Number.isFinite(previewFee) && previewFee > 0 ? previewFee : 0), [previewFee]);
  const requiresAdditionalPayment = additionalFee > 0;
  const canSubmitBase = !!reservationId && checks.every(Boolean) && !!photo1 && !!photo2;
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
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    setIsPaid(true);
    setIsPaying(false);
  }

  async function handleComplete() {
    setError("");

    if (!canSubmitBase || !photo1 || !photo2) {
      setError("체크리스트와 사진 2장을 모두 완료해 주세요.");
      return;
    }

    if (requiresAdditionalPayment && !isPaid) {
      setError("추가 요금을 먼저 결제해 주세요.");
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
        setError(extractApiErrorMessage(data, "체크아웃 처리에 실패했습니다."));
        return;
      }

      const extraFee =
        data && typeof data === "object" && "extraFee" in data && typeof (data as { extraFee?: unknown }).extraFee === "number"
          ? (data as { extraFee: number }).extraFee
          : additionalFee;

      const query = new URLSearchParams({
        reservationId,
        reservationType,
        partnerId,
        carId,
        carLabel,
        garageName,
        workTitle,
        totalPrice: String(totalPrice),
        extraFee: String(extraFee),
        checkoutPhoto1: buildMockUrl(reservationId, photo1, "photo1"),
        checkoutPhoto2: buildMockUrl(reservationId, photo2, "photo2"),
      });

      router.push(`/complete?${query.toString()}`);
    } catch {
      setError("체크아웃 처리 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  if (reservationType === "SHOP_SERVICE") {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold text-zinc-900">체크아웃</h1>
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          전문가 맡기기 예약은 이 화면을 사용하지 않습니다.
        </p>
      </section>
    );
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
            <input type="file" accept="image/*" className="hidden" onChange={(event) => handleFileChange(event, setPhoto1)} />
          </label>
          <label className={`flex h-32 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed ${photo2 ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-zinc-300 bg-zinc-100 text-zinc-500"}`}>
            {photo2 ? "사진2 완료" : "사진 2"}
            <input type="file" accept="image/*" className="hidden" onChange={(event) => handleFileChange(event, setPhoto2)} />
          </label>
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-zinc-100 p-4 text-base text-zinc-700">
        <h3 className="mb-2 text-xl font-semibold text-zinc-900">추가 요금 요약</h3>
        <p className="flex justify-between"><span>초과 이용 시간</span><span>{overdueMinutes}분</span></p>
        <p className="mt-2 flex justify-between text-red-500"><span>추가 요금</span><span>{additionalFee.toLocaleString("ko-KR")}원</span></p>
      </div>

      {requiresAdditionalPayment ? (
        <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
          <h3 className="mb-2 text-xl font-semibold text-zinc-900">추가 요금 결제 수단</h3>
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
            {isPaid ? "추가 요금 결제 완료" : isPaying ? "추가 요금 결제 중..." : `${additionalFee.toLocaleString("ko-KR")}원 결제하기`}
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

export default function CheckoutPage() {
  return (
    <Suspense fallback={<section className="pb-24" />}>
      <CheckoutPageContent />
    </Suspense>
  );
}
