"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

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
  const [confirmedRisk, setConfirmedRisk] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit =
    reason.trim().length > 0 &&
    confirmedRisk &&
    confirmationText.trim() === "예약 취소";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const normalizedReason = reason.trim();

    if (!normalizedReason) {
      setError("취소 사유를 입력해 주세요.");
      return;
    }

    if (!confirmedRisk) {
      setError("취소 후 환불/운영 영향 안내를 확인해 주세요.");
      return;
    }

    if (confirmationText.trim() !== "예약 취소") {
      setError("확인 문구로 '예약 취소'를 입력해 주세요.");
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
        바뀌고 예약 선결제는 자동 환불 또는 수동 환불 확인 대상으로 전환됩니다.
      </p>
      <div className="mt-4 rounded-2xl border border-amber-200/20 bg-slate-950/60 p-4 text-sm leading-6 text-amber-50/80">
        <p className="font-semibold text-amber-100">취소 전 확인</p>
        <p className="mt-1">
          이 작업은 예약 시간을 즉시 해제하고, 결제 장부와 상태 전환 로그에
          운영 취소 기록을 남깁니다.
        </p>
      </div>
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
      <label className="mt-4 flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-amber-50/90">
        <input
          type="checkbox"
          checked={confirmedRisk}
          onChange={(event) => setConfirmedRisk(event.target.checked)}
          className="mt-1 size-4 accent-amber-300"
        />
        <span>
          취소 후 예약 상태, 결제 환불 상태, 상태 전환 로그가 변경되는 것을
          확인했습니다.
        </span>
      </label>
      <label className="mt-4 block">
        <span className="text-sm font-medium text-amber-50">
          확인 문구 입력
        </span>
        <input
          value={confirmationText}
          onChange={(event) => setConfirmationText(event.target.value)}
          className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm text-white outline-none ring-amber-300/30 focus:ring-4"
          placeholder="예약 취소"
        />
      </label>
      {error ? (
        <p className="mt-3 rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isSubmitting || !canSubmit}
        className="mt-4 h-11 rounded-2xl bg-amber-300 px-5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:bg-slate-700 disabled:text-slate-400"
      >
        {isSubmitting ? "취소 처리 중..." : "예약 취소 처리"}
      </button>
    </form>
  );
}
