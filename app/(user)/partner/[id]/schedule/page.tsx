"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { getGarageById } from "../../../_data/mock-garages";

const days = [
  { label: "목", day: 27 },
  { label: "금", day: 28 },
  { label: "토", day: 1 },
  { label: "일", day: 2 },
  { label: "월", day: 3 },
  { label: "화", day: 4 },
  { label: "수", day: 5 },
];

const timeSlots = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
  "18:30",
];

const availableTimeSet = new Set([
  "10:30",
  "11:00",
  "11:30",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "17:00",
  "17:30",
  "18:00",
  "18:30",
]);

export default function PartnerSchedulePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const garage = useMemo(() => getGarageById(params.id), [params.id]);

  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [selectedTime, setSelectedTime] = useState<string>("15:30");
  const [selectedBay, setSelectedBay] = useState<number>(3);

  const workId = searchParams.get("workId") ?? "engine-oil";

  function buildStartEndIso(timeValue: string): {
    startIso: string;
    endIso: string;
  } {
    const [hour, minute] = timeValue.split(":").map((value) => Number(value));
    const start = new Date(Date.UTC(2026, 1, 28, hour, minute, 0, 0));
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return {
      startIso: start.toISOString(),
      endIso: end.toISOString(),
    };
  }

  function goSafetyPage() {
    const { startIso, endIso } = buildStartEndIso(selectedTime);
    const query = new URLSearchParams({
      partnerId: garage!.id,
      garageName: garage!.name,
      workId,
      dateLabel: `2/28(금) ${selectedTime} - ${String((Number(selectedTime.slice(0, 2)) + 1) % 24).padStart(2, "0")}:${selectedTime.slice(3, 5)}`,
      bayLabel: `${selectedBay}번 베이`,
      bayId: "00000000-0000-0000-0000-000000000001",
      startTime: startIso,
      endTime: endIso,
      totalPrice: String(garage!.hourlyPrice),
    });
    router.push(`/safety?${query.toString()}`);
  }

  if (!garage) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold text-zinc-900">
          시간 / 베이 선택
        </h1>
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          정비소 정보를 찾을 수 없습니다.
        </p>
      </section>
    );
  }

  return (
    <section className="pb-24">
      <header className="mb-4 flex items-center gap-2">
        <Link
          href={`/partner/${garage.id}/work`}
          className="text-2xl text-zinc-700"
          aria-label="뒤로가기"
        >
          ←
        </Link>
        <h1 className="text-3xl font-semibold text-zinc-900">
          시간 / 베이 선택
        </h1>
      </header>

      <div className="mb-4 flex items-center justify-between px-1">
        <button type="button" className="text-xl text-zinc-500">
          ‹
        </button>
        <p className="text-2xl font-semibold text-zinc-900">2026년 2월</p>
        <button type="button" className="text-xl text-zinc-500">
          ›
        </button>
      </div>

      <div className="mb-6 grid grid-cols-7 gap-2">
        {days.map((item, index) => {
          const active = index === selectedDay;
          return (
            <button
              key={`${item.label}-${item.day}`}
              type="button"
              onClick={() => setSelectedDay(index)}
              className={`rounded-2xl px-2 py-3 text-center ${
                active ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-700"
              }`}
            >
              <p className="text-xs">{item.label}</p>
              <p className="text-2xl font-semibold">{item.day}</p>
            </button>
          );
        })}
      </div>

      <div className="mb-3">
        <h2 className="text-2xl font-semibold text-zinc-900">
          시간 슬롯 (30분 단위)
        </h2>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {timeSlots.map((slot) => {
          const available = availableTimeSet.has(slot);
          const selected = slot === selectedTime;

          return (
            <button
              key={slot}
              type="button"
              disabled={!available}
              onClick={() => setSelectedTime(slot)}
              className={`rounded-xl px-2 py-3 text-base font-medium ${
                !available
                  ? "bg-zinc-100 text-zinc-400"
                  : selected
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-100 text-zinc-800"
              }`}
            >
              {slot}
            </button>
          );
        })}
      </div>

      <div className="mb-3 mt-6">
        <h2 className="text-2xl font-semibold text-zinc-900">베이 선택</h2>
      </div>

      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: garage.bayCount }).map((_, index) => {
          const bayNumber = index + 1;
          const active = bayNumber === selectedBay;

          return (
            <button
              key={bayNumber}
              type="button"
              onClick={() => setSelectedBay(bayNumber)}
              className={`rounded-xl px-2 py-3 text-lg font-medium ${
                active ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-800"
              }`}
            >
              {bayNumber}번
            </button>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl bg-zinc-100 p-4">
        <h3 className="mb-3 text-2xl font-semibold text-zinc-900">요금 요약</h3>
        <div className="space-y-1 text-lg text-zinc-700">
          <div className="flex items-center justify-between">
            <span>기본 1시간</span>
            <span>{garage.hourlyPrice.toLocaleString("ko-KR")}원</span>
          </div>
          <div className="flex items-center justify-between">
            <span>추가 30분 단가</span>
            <span>
              {Math.floor(garage.hourlyPrice / 2).toLocaleString("ko-KR")}원
            </span>
          </div>
          <div className="my-2 border-t border-zinc-300" />
          <div className="flex items-center justify-between text-2xl font-semibold text-zinc-900">
            <span>합계</span>
            <span className="text-blue-600">
              {garage.hourlyPrice.toLocaleString("ko-KR")}원
            </span>
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm text-zinc-500">
        선택됨: {days[selectedDay]?.label} {days[selectedDay]?.day}일 ·{" "}
        {selectedTime} · {selectedBay}번 베이 · {workId}
      </p>

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 bg-white px-4 pb-3 pt-2">
        <button
          type="button"
          onClick={goSafetyPage}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white"
        >
          안전 동의
        </button>
      </div>
    </section>
  );
}
