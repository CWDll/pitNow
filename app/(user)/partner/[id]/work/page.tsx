"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { getGarageById, workOptions } from "../../../_data/mock-garages";
import {
  getInitialActiveCarId,
  initialMockCars,
  loadMockCarsFromStorage,
} from "../../../_data/mock-cars";

function levelClass(level: "초급" | "중급"): string {
  return level === "초급"
    ? "bg-emerald-50 text-emerald-600"
    : "bg-amber-50 text-amber-600";
}

export default function PartnerWorkPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [cars] = useState(() => loadMockCarsFromStorage() ?? initialMockCars);
  const [selectedWorkId, setSelectedWorkId] = useState<string>(workOptions[0].id);
  const [selectedCarId, setSelectedCarId] = useState<string>(() =>
    getInitialActiveCarId(loadMockCarsFromStorage() ?? initialMockCars),
  );
  const [isCarPickerOpen, setIsCarPickerOpen] = useState<boolean>(false);
  const shouldScrollCars = cars.length > 3;

  const garage = useMemo(() => getGarageById(params.id), [params.id]);
  const selectedCar = useMemo(
    () => cars.find((car) => car.id === selectedCarId) ?? cars[0],
    [cars, selectedCarId],
  );

  if (!garage) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold text-zinc-900">작업 선택</h1>
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          정비소 정보를 찾을 수 없습니다.
        </p>
      </section>
    );
  }

  return (
    <section className="pb-24">
      <header className="mb-4 flex items-center gap-2">
        <Link href={`/partner/${garage.id}`} className="text-2xl text-zinc-700" aria-label="뒤로가기">
          ←
        </Link>
        <h1 className="text-3xl font-semibold text-zinc-900">작업 선택</h1>
      </header>

      <div className="mb-4 rounded-2xl bg-zinc-100 px-4 py-3">
        <p className="mb-1 block text-xs text-zinc-500">내 차 선택</p>
        <button
          type="button"
          onClick={() => setIsCarPickerOpen(true)}
          className="flex w-full items-center justify-between rounded-xl bg-white px-3 py-3 text-left"
        >
          <span className="text-lg text-zinc-800">
            {selectedCar ? `${selectedCar.model} (${selectedCar.year}) · ${selectedCar.number}` : "차량 없음"}
          </span>
          <span className="text-sm text-zinc-500">선택</span>
        </button>
      </div>

      <div className="space-y-3">
        {workOptions.map((option) => {
          const selected = option.id === selectedWorkId;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelectedWorkId(option.id)}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                selected
                  ? "border-blue-500 bg-blue-50/40"
                  : "border-zinc-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-2xl font-medium text-zinc-900">{option.title}</p>
                {selected ? (
                  <span className="rounded-full bg-blue-600 px-2 py-1 text-xs font-semibold text-white">
                    선택됨
                  </span>
                ) : null}
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className={`rounded-full px-2 py-1 font-medium ${levelClass(option.level)}`}>
                  {option.level}
                </span>
                {option.helperRequired ? (
                  <span className="rounded-full bg-rose-50 px-2 py-1 font-medium text-rose-600">
                    헬퍼 필수
                  </span>
                ) : null}
              </div>

              <p className="mt-2 text-base text-zinc-600">{option.description}</p>
              <p className="mt-1 text-base text-zinc-500">◷ {option.durationLabel}</p>
              {option.helperNote ? (
                <p className="mt-2 text-base font-medium text-amber-600">{option.helperNote}</p>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 bg-white px-4 pb-3 pt-2">
        <button
          type="button"
          disabled={!selectedCar}
          onClick={() =>
            selectedCar
              ? router.push(
                  `/partner/${garage.id}/schedule?workId=${selectedWorkId}&carId=${selectedCar.id}&carLabel=${encodeURIComponent(`${selectedCar.model} (${selectedCar.year})`)}`,
                )
              : null
          }
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white disabled:bg-zinc-300"
        >
          시간 선택
        </button>
      </div>

      {isCarPickerOpen ? (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/35">
          <div className="mb-16 w-full rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900">차량 선택</h3>
              <button
                type="button"
                onClick={() => setIsCarPickerOpen(false)}
                className="text-sm text-zinc-500"
              >
                닫기
              </button>
            </div>
            <div
              className={`space-y-2 ${shouldScrollCars ? "max-h-[240px] overflow-y-auto pr-1" : ""}`}
            >
              {cars.map((car) => {
                const selected = car.id === selectedCarId;

                return (
                  <button
                    key={car.id}
                    type="button"
                    onClick={() => {
                      setSelectedCarId(car.id);
                      setIsCarPickerOpen(false);
                    }}
                    className={`w-full rounded-xl border px-3 py-3 text-left ${
                      selected
                        ? "border-blue-500 bg-blue-50"
                        : "border-zinc-200 bg-white"
                    }`}
                  >
                    <p className="text-base font-semibold text-zinc-900">{car.number}</p>
                    <p className="mt-1 text-sm text-zinc-600">{car.model} ({car.year})</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
