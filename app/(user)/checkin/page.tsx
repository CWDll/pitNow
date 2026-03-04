"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { CheckInPayload } from "@/src/domain/types";

type PhotoField = "frontImg" | "rearImg" | "leftImg" | "rightImg";

const photoLabels: Record<PhotoField, string> = {
  frontImg: "전면",
  rearImg: "후면",
  leftImg: "좌측",
  rightImg: "우측",
};

interface ApiErrorShape {
  error?: string | { message?: string };
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const typed = payload as ApiErrorShape;

  if (typeof typed.error === "string" && typed.error) {
    return typed.error;
  }

  if (typed.error && typeof typed.error === "object" && typeof typed.error.message === "string") {
    return typed.error.message;
  }

  return null;
}

function buildMockUrl(reservationId: string, field: PhotoField, file: File): string {
  return `mock://checkin/${reservationId}/${field}/${encodeURIComponent(file.name)}`;
}

export default function CheckinPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const reservationId = searchParams.get("reservationId")?.trim() ?? "";
  const partnerId = searchParams.get("partnerId") ?? "";
  const garageName = searchParams.get("garageName") ?? "강남 셀프정비소";
  const bayLabel = searchParams.get("bayLabel") ?? "3번 베이";
  const startTime = searchParams.get("startTime") ?? "";
  const endTime = searchParams.get("endTime") ?? "";
  const totalPrice = searchParams.get("totalPrice") ?? "15000";
  const workTitle = searchParams.get("workTitle") ?? "엔진오일 교환";

  const [qrScanned, setQrScanned] = useState<boolean>(false);
  const [frontImgFile, setFrontImgFile] = useState<File | null>(null);
  const [rearImgFile, setRearImgFile] = useState<File | null>(null);
  const [leftImgFile, setLeftImgFile] = useState<File | null>(null);
  const [rightImgFile, setRightImgFile] = useState<File | null>(null);

  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const missingReservationId = reservationId.length === 0;

  const allPhotosSelected =
    frontImgFile !== null &&
    rearImgFile !== null &&
    leftImgFile !== null &&
    rightImgFile !== null;

  const canSubmit = qrScanned && allPhotosSelected && !missingReservationId;

  const tiles: Array<{ field: PhotoField; file: File | null }> = useMemo(
    () => [
      { field: "frontImg", file: frontImgFile },
      { field: "rearImg", file: rearImgFile },
      { field: "leftImg", file: leftImgFile },
      { field: "rightImg", file: rightImgFile },
    ],
    [frontImgFile, leftImgFile, rearImgFile, rightImgFile],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!canSubmit || !frontImgFile || !rearImgFile || !leftImgFile || !rightImgFile) {
      setError("QR 스캔과 차량 사진 4장을 모두 완료해 주세요.");
      return;
    }

    const payload: CheckInPayload = {
      reservationId,
      frontImg: buildMockUrl(reservationId, "frontImg", frontImgFile),
      rearImg: buildMockUrl(reservationId, "rearImg", rearImgFile),
      leftImg: buildMockUrl(reservationId, "leftImg", leftImgFile),
      rightImg: buildMockUrl(reservationId, "rightImg", rightImgFile),
    };

    setIsLoading(true);
    try {
      const response = await fetch("/api/checkin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        setError(extractErrorMessage(data) ?? "체크인 처리에 실패했습니다.");
        return;
      }

      const query = new URLSearchParams({
        reservationId,
        partnerId,
        garageName,
        bayLabel,
        startTime,
        endTime,
        totalPrice,
        workTitle,
      });
      router.push(`/in-use?${query.toString()}`);
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
        <h1 className="text-3xl font-semibold text-zinc-900">체크인</h1>
      </header>

      {missingReservationId ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          reservationId가 누락되었습니다.
        </p>
      ) : null}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <h2 className="mb-2 text-xl font-semibold">QR 스캔</h2>
          <button
            type="button"
            onClick={() => setQrScanned(true)}
            className={`flex h-36 w-full items-center justify-center rounded-2xl border-2 border-dashed text-lg ${
              qrScanned ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-zinc-300 bg-zinc-100 text-zinc-500"
            }`}
          >
            {qrScanned ? "스캔 완료" : "탭하여 QR 스캔"}
          </button>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold">차량 사진 촬영 (4방향)</h2>
          <div className="grid grid-cols-2 gap-3">
            {tiles.map((tile) => (
              <label
                key={tile.field}
                className={`flex h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-base ${
                  tile.file ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-zinc-300 bg-zinc-100 text-zinc-500"
                }`}
              >
                <span>{tile.file ? "✓" : "📷"}</span>
                <span className="mt-1">{tile.file ? `${photoLabels[tile.field]} 완료` : photoLabels[tile.field]}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const selected = event.target.files?.[0] ?? null;
                    if (tile.field === "frontImg") setFrontImgFile(selected);
                    if (tile.field === "rearImg") setRearImgFile(selected);
                    if (tile.field === "leftImg") setLeftImgFile(selected);
                    if (tile.field === "rightImg") setRightImgFile(selected);
                  }}
                />
              </label>
            ))}
          </div>
        </div>

        {!canSubmit ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            ⚠ 사진 4장 없으면 시작 불가
          </p>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        ) : null}

        <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 bg-white px-4 pb-3 pt-2">
          <button
            type="submit"
            disabled={!canSubmit || isLoading}
            className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white disabled:bg-zinc-300 disabled:text-zinc-500"
          >
            {isLoading ? "처리 중..." : "체크인 완료 (타이머 시작)"}
          </button>
        </div>
      </form>
    </section>
  );
}
