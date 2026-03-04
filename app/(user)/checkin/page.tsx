"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Card, Pill, Screen } from "../_components/mobile-ui";
import type { CheckInPayload } from "@/src/domain/types";

interface ApiErrorShape {
  error?: {
    message?: string;
  };
}

type PhotoField = "frontImg" | "rearImg" | "leftImg" | "rightImg";

const photoLabels: Record<PhotoField, string> = {
  frontImg: "전면 사진",
  rearImg: "후면 사진",
  leftImg: "좌측 사진",
  rightImg: "우측 사진",
};

function buildMockImageUrl(
  reservationId: string,
  field: PhotoField,
  file: File,
): string {
  const safeName = encodeURIComponent(file.name);
  return `mock://checkin/${reservationId}/${field}/${safeName}`;
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if ("error" in payload && typeof payload.error === "string") {
    return payload.error;
  }

  const typed = payload as ApiErrorShape;
  if (typed.error?.message && typeof typed.error.message === "string") {
    return typed.error.message;
  }

  return null;
}

export default function CheckinPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reservationId = searchParams.get("reservationId")?.trim() ?? "";

  const [frontImgFile, setFrontImgFile] = useState<File | null>(null);
  const [rearImgFile, setRearImgFile] = useState<File | null>(null);
  const [leftImgFile, setLeftImgFile] = useState<File | null>(null);
  const [rightImgFile, setRightImgFile] = useState<File | null>(null);

  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const missingReservationId = useMemo(() => !reservationId, [reservationId]);

  const allSelected =
    frontImgFile !== null &&
    rearImgFile !== null &&
    leftImgFile !== null &&
    rightImgFile !== null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (missingReservationId) {
      setError("reservationId가 없어 체크인을 진행할 수 없습니다.");
      return;
    }

    if (!allSelected || !frontImgFile || !rearImgFile || !leftImgFile || !rightImgFile) {
      setError("전/후/좌/우 사진 4장을 모두 선택해 주세요.");
      return;
    }

    const payload: CheckInPayload = {
      reservationId,
      frontImg: buildMockImageUrl(reservationId, "frontImg", frontImgFile),
      rearImg: buildMockImageUrl(reservationId, "rearImg", rearImgFile),
      leftImg: buildMockImageUrl(reservationId, "leftImg", leftImgFile),
      rightImg: buildMockImageUrl(reservationId, "rightImg", rightImgFile),
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
        const message = extractErrorMessage(data);
        setError(message ?? "체크인에 실패했습니다. 다시 시도해 주세요.");
        return;
      }

      router.push(`/in-use?reservationId=${reservationId}`);
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Screen title="Check-in" subtitle="차량 4면 사진을 등록하고 체크인을 완료하세요.">
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">사진 업로드</h2>
          <Pill label="4장 필수" tone="accent" />
        </div>

        <p className="rounded-xl bg-zinc-100 px-3 py-2 text-xs text-zinc-700">
          reservationId: {reservationId || "(없음)"}
        </p>

        {missingReservationId ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            reservationId가 누락되었습니다. 예약 페이지에서 다시 진입해 주세요.
          </p>
        ) : null}

        <form className="space-y-3" onSubmit={handleSubmit}>
          {(Object.keys(photoLabels) as PhotoField[]).map((field) => (
            <div key={field} className="space-y-1">
              <label className="text-sm font-medium text-zinc-700" htmlFor={field}>
                {photoLabels[field]}
              </label>
              <input
                id={field}
                type="file"
                accept="image/*"
                required
                disabled={isLoading || missingReservationId}
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  if (field === "frontImg") {
                    setFrontImgFile(selected);
                  }
                  if (field === "rearImg") {
                    setRearImgFile(selected);
                  }
                  if (field === "leftImg") {
                    setLeftImgFile(selected);
                  }
                  if (field === "rightImg") {
                    setRightImgFile(selected);
                  }
                }}
                className="block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-xs file:font-medium file:text-white"
              />
            </div>
          ))}

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isLoading || missingReservationId}
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {isLoading ? "체크인 처리 중..." : "체크인 완료"}
          </button>
        </form>
      </Card>
    </Screen>
  );
}
