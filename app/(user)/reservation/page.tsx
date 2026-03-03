"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { Card, Pill, Screen } from "../_components/mobile-ui";
import type { CreateReservationPayload } from "@/src/domain/types";

const MOCK_BAY_ID = "00000000-0000-0000-0000-000000000001";
const MIN_DURATION_MS = 60 * 60 * 1000;

interface ReservationRowResponse {
  id: string;
}

function toIsoString(localDatetimeValue: string): string | null {
  if (!localDatetimeValue) {
    return null;
  }

  const parsed = new Date(localDatetimeValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function extractReservationId(payload: unknown): string | null {
  if (Array.isArray(payload) && payload.length > 0) {
    const first = payload[0] as Partial<ReservationRowResponse>;
    if (typeof first.id === "string" && first.id) {
      return first.id;
    }
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.id === "string" && record.id) {
      return record.id;
    }
  }

  return null;
}

export default function ReservationPage() {
  const router = useRouter();
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const durationLabel = useMemo(() => {
    if (!startTime || !endTime) {
      return "시간을 선택하세요";
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return "유효한 시간을 선택하세요";
    }

    const diffMs = end.getTime() - start.getTime();
    if (diffMs <= 0) {
      return "종료 시간이 시작 시간보다 이후여야 합니다";
    }

    const hours = diffMs / (1000 * 60 * 60);
    return `예약 시간: ${hours.toFixed(1)}시간`;
  }, [endTime, startTime]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const startIso = toIsoString(startTime);
    const endIso = toIsoString(endTime);

    if (!startIso || !endIso) {
      setError("시작/종료 시간을 모두 올바르게 입력해 주세요.");
      return;
    }

    const startDate = new Date(startIso);
    const endDate = new Date(endIso);
    const durationMs = endDate.getTime() - startDate.getTime();

    if (durationMs <= 0) {
      setError("종료 시간은 시작 시간보다 늦어야 합니다.");
      return;
    }

    if (durationMs < MIN_DURATION_MS) {
      setError("최소 예약 시간은 1시간입니다.");
      return;
    }

    const requestBody: CreateReservationPayload = {
      bayId: MOCK_BAY_ID,
      startTime: startIso,
      endTime: endIso,
    };

    setIsLoading(true);
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        if (data && typeof data === "object" && "error" in data) {
          const serverError = (data as { error?: unknown }).error;
          if (typeof serverError === "string" && serverError) {
            setError(serverError);
            return;
          }
        }

        setError("예약 생성에 실패했습니다. 다시 시도해 주세요.");
        return;
      }

      const reservationId = extractReservationId(data);
      if (!reservationId) {
        setError("예약은 생성되었지만 ID를 확인할 수 없습니다.");
        return;
      }

      router.push(`/checkin?reservationId=${reservationId}`);
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Screen title="Reservation" subtitle="시작/종료 시간을 선택해 예약을 생성하세요.">
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">예약 시간 선택</h2>
          <Pill label="최소 1시간" tone="accent" />
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label htmlFor="start-time" className="text-sm font-medium text-zinc-700">
              시작 시간
            </label>
            <input
              id="start-time"
              type="datetime-local"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-900 outline-none ring-0 transition focus:border-zinc-900"
              required
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="end-time" className="text-sm font-medium text-zinc-700">
              종료 시간
            </label>
            <input
              id="end-time"
              type="datetime-local"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-900 outline-none ring-0 transition focus:border-zinc-900"
              required
              disabled={isLoading}
            />
          </div>

          <div className="rounded-xl bg-zinc-100 px-3 py-2 text-sm text-zinc-700">
            {durationLabel}
          </div>

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {isLoading ? "예약 생성 중..." : "예약하기"}
          </button>
        </form>
      </Card>
    </Screen>
  );
}
