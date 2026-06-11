"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface CancelReservationFormProps {
  reservationId: string;
}

interface ApiErrorShape {
  error?: string | { message?: string };
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const typed = payload as ApiErrorShape;

  if (typeof typed.error === "string") {
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

export default function CancelReservationForm({
  reservationId,
}: CancelReservationFormProps) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const normalizedReason = reason.trim();

    if (!normalizedReason) {
      setError("취소 사유를 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(
        `/api/admin/reservations/${reservationId}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reason: normalizedReason,
          }),
        },
      );
      const payload: unknown = await response.json();

      if (!response.ok) {
        setError(
          extractErrorMessage(payload) ?? "예약 취소 처리에 실패했습니다.",
        );
        return;
      }

      router.refresh();
    } catch {
      setError("예약 취소 처리 중 네트워크 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5"
    >
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-200">
        Admin action
      </p>
      <h3 className="mt-2 text-2xl font-semibold text-white">예약 취소</h3>
      <p className="mt-2 text-sm leading-6 text-amber-50/80">
        CONFIRMED 예약만 취소할 수 있습니다. 처리 시 상태가 CANCELLED로
        바뀌고 상태 전환 로그에 사유가 저장됩니다.
      </p>
      <label className="mt-4 block">
        <span className="text-sm font-medium text-amber-50">취소 사유</span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none ring-amber-300/30 focus:ring-4"
          placeholder="예: 고객 요청으로 예약 취소"
        />
      </label>
      {error ? (
        <p className="mt-3 rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 h-11 rounded-2xl bg-amber-300 px-5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:bg-slate-700 disabled:text-slate-400"
      >
        {isSubmitting ? "취소 처리 중..." : "예약 취소 처리"}
      </button>
    </form>
  );
}
