"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import {
  formatMinutesLabel,
  selfMaintenanceTaskOptions,
} from "../../../_data/mock-garages";
import {
  getInitialActiveCarId,
  initialMockCars,
  loadMockCarsFromStorage,
} from "@/app/(user)/_data/mock-cars";
import type { PartnerShopPackage } from "@/src/domain/shop-package";
import type { ReservationType } from "@/src/domain/types";

function levelClass(level: "초급" | "중급"): string {
  return level === "초급"
    ? "bg-emerald-50 text-emerald-600"
    : "bg-amber-50 text-amber-600";
}


interface PartnerPackagesResponse {
  success: boolean;
  packages?: PartnerShopPackage[];
}

interface PartnerInfo {
  id: string;
  name: string;
  address: string;
  hours: string;
  phone: string;
  hourlyPrice: number;
  bayIds: string[];
  bayCount: number;
}

interface PartnerResponse {
  success: boolean;
  partner?: PartnerInfo;
}


function parseMode(value: string | null): ReservationType {
  return value === "SHOP_SERVICE" ? "SHOP_SERVICE" : "SELF_SERVICE";
}


function PartnerWorkPageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = parseMode(searchParams.get("mode"));
  const initialBookingMode =
    initialMode === "SHOP_SERVICE" ? "PACKAGE" : "SELF";

  const [cars] = useState(() => loadMockCarsFromStorage() ?? initialMockCars);
  const [bookingMode, setBookingMode] = useState<"SELF" | "PACKAGE">(
    initialBookingMode,
  );
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([
    selfMaintenanceTaskOptions[0].id,
  ]);
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");
  const [selectedCarId, setSelectedCarId] = useState<string>(() =>
    getInitialActiveCarId(loadMockCarsFromStorage() ?? initialMockCars),
  );
  const [isCarPickerOpen, setIsCarPickerOpen] = useState(false);
  const [garage, setGarage] = useState<PartnerInfo | null>(null);
  const [packages, setPackages] = useState<PartnerShopPackage[]>([]);

  const selectedCar = useMemo(
    () => cars.find((car) => car.id === selectedCarId) ?? cars[0],
    [cars, selectedCarId],
  );
  const resolvedSelectedPackageId =
    selectedPackageId || packages[0]?.id || "";
  const shouldScrollCars = cars.length > 3;

  useEffect(() => {
    let isCancelled = false;

    async function loadPartner() {
      try {
        const response = await fetch(`/api/partners/${params.id}`, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok || isCancelled) {
          return;
        }

        const payload = (await response.json()) as PartnerResponse;

        if (!payload.success || !payload.partner || isCancelled) {
          return;
        }

        setGarage(payload.partner);
      } catch (error) {
        console.error("WORK PARTNER LOAD ERROR:", error);
      }
    }

    void loadPartner();

    return () => {
      isCancelled = true;
    };
  }, [params.id]);

  useEffect(() => {
    let isCancelled = false;

    async function loadPackages() {
      if (!garage?.id) {
        return;
      }

      try {
        const response = await fetch(
          `/api/partner-packages?partnerId=${encodeURIComponent(garage.id)}`,
          {
            method: "GET",
            cache: "no-store",
          },
        );

        if (!response.ok || isCancelled) {
          return;
        }

        const payload = (await response.json()) as PartnerPackagesResponse;

        if (
          !payload.success ||
          !Array.isArray(payload.packages) ||
          isCancelled
        ) {
          return;
        }

        setPackages(payload.packages);
      } catch (error) {
        console.error("WORK PACKAGE LOAD ERROR:", error);
      }
    }

    void loadPackages();

    return () => {
      isCancelled = true;
    };
  }, [garage?.id]);

  if (!garage) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold text-zinc-900">예약 방식 선택</h1>
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          정비소 정보를 불러오는 중입니다.
        </p>
      </section>
    );
  }

  return (
    <section className="pb-24">
      <header className="mb-4 flex items-center gap-2">
        <Link
          href={`/partner/${garage.id}`}
          className="text-2xl text-zinc-700"
          aria-label="뒤로가기"
        >
          ←
        </Link>
        <h1 className="text-3xl font-semibold text-zinc-900">예약 방식 선택</h1>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setBookingMode("SELF")}
          className={`rounded-2xl px-3 py-3 text-sm font-semibold ${
            bookingMode === "SELF"
              ? "bg-blue-600 text-white"
              : "bg-zinc-100 text-zinc-700"
          }`}
        >
          시간제 예약
        </button>
        <button
          type="button"
          onClick={() => setBookingMode("PACKAGE")}
          className={`rounded-2xl px-3 py-3 text-sm font-semibold ${
            bookingMode === "PACKAGE"
              ? "bg-blue-600 text-white"
              : "bg-zinc-100 text-zinc-700"
          }`}
        >
          패키지 예약
        </button>
      </div>

      {bookingMode === "SELF" ? (
        <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          법적으로 허용된 셀프 정비 작업만 선택할 수 있습니다.
        </p>
      ) : null}

      <div className="mb-4 rounded-2xl bg-zinc-100 px-4 py-3">
        <p className="mb-1 block text-xs text-zinc-500">내 차 선택</p>
        <button
          type="button"
          onClick={() => setIsCarPickerOpen(true)}
          className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left"
        >
          <span className="text-lg text-zinc-800">
            {selectedCar
              ? `${selectedCar.model} (${selectedCar.year}) · ${selectedCar.number}`
              : "차량 없음"}
          </span>
          <span className="text-sm text-zinc-500">변경</span>
        </button>
      </div>

      <div className="space-y-3">
        {bookingMode === "SELF" ? (
          selfMaintenanceTaskOptions.map((option) => {
            const selected = selectedTaskIds.includes(option.id);

            return (
              <button
                key={option.id}
                type="button"
                onClick={() =>
                  setSelectedTaskIds((prev) =>
                    prev.includes(option.id)
                      ? prev.filter((id) => id !== option.id)
                      : [...prev, option.id],
                  )
                }
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  selected
                    ? "border-blue-500 bg-blue-50/40"
                    : "border-zinc-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-2xl font-medium text-zinc-900">
                    {option.title}
                  </p>
                  {selected ? (
                    <span className="rounded-full bg-blue-600 px-2 py-1 text-xs font-semibold text-white">
                      선택됨
                    </span>
                  ) : null}
                </div>

                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span
                    className={`rounded-full px-2 py-1 font-medium ${levelClass(option.level)}`}
                  >
                    {option.level}
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium text-zinc-600">
                    검수 가산{" "}
                    {option.helperVerifyUnitFee.toLocaleString("ko-KR")}원
                  </span>
                </div>

                <p className="mt-2 text-base text-zinc-600">
                  {option.description}
                </p>
              </button>
            );
          })
        ) : packages.length === 0 ? (
          <p className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-base text-zinc-600">
            현재 노출 가능한 패키지가 없습니다.
          </p>
        ) : (
          packages.map((item) => {
            const selected = resolvedSelectedPackageId === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedPackageId(item.id)}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  selected
                    ? "border-blue-500 bg-blue-50/40"
                    : "border-zinc-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-2xl font-medium text-zinc-900">
                      {item.name}
                    </p>
                    <p className="mt-1 text-base text-zinc-600">
                      {item.summary}
                    </p>
                  </div>
                  {selected ? (
                    <span className="rounded-full bg-blue-600 px-2 py-1 text-xs font-semibold text-white">
                      선택됨
                    </span>
                  ) : null}
                </div>

                <p className="mt-2 text-base text-zinc-500">
                  ◷ 소요 {formatMinutesLabel(item.durationMinutes)}
                </p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">
                  {item.price.toLocaleString("ko-KR")}원
                </p>
              </button>
            );
          })
        )}
      </div>

      <div className="fixed bottom-16 left-1/2 z-40 w-full max-w-107.5 -translate-x-1/2 bg-white px-4 pb-3 pt-2">
        <button
          type="button"
          disabled={
            !selectedCar ||
            (bookingMode === "SELF" && selectedTaskIds.length === 0) ||
            (bookingMode === "PACKAGE" && !resolvedSelectedPackageId)
          }
          onClick={() =>
            selectedCar
              ? router.push(
                  `/partner/${garage.id}/schedule?mode=${bookingMode === "PACKAGE" ? "SHOP_SERVICE" : "SELF_SERVICE"}&bookingMode=${bookingMode}&taskIds=${encodeURIComponent(
                    selectedTaskIds.join(","),
                  )}&taskLabels=${encodeURIComponent(
                    selfMaintenanceTaskOptions
                      .filter((task) => selectedTaskIds.includes(task.id))
                      .map((task) => task.title)
                      .join(", "),
                  )}&packageId=${encodeURIComponent(resolvedSelectedPackageId)}&packageTitle=${encodeURIComponent(
                    packages.find((item) => item.id === resolvedSelectedPackageId)
                      ?.name ?? "패키지",
                  )}&packageMinutes=${encodeURIComponent(
                    String(
                      packages.find((item) => item.id === resolvedSelectedPackageId)
                        ?.durationMinutes ?? 60,
                    ),
                  )}&packagePrice=${encodeURIComponent(
                    String(
                      packages.find((item) => item.id === resolvedSelectedPackageId)
                        ?.price ?? 0,
                    ),
                  )}&carId=${selectedCar.id}&carLabel=${encodeURIComponent(`${selectedCar.model} (${selectedCar.year})`)}`,
                )
              : null
          }
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white disabled:bg-zinc-300"
        >
          {bookingMode === "SELF" ? "시간 선택으로 이동" : "시간 선택으로 이동"}
        </button>
      </div>

      {isCarPickerOpen ? (
        <div className="fixed inset-0 z-80 flex items-end bg-black/35">
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
              className={`space-y-2 ${shouldScrollCars ? "max-h-60 overflow-y-auto pr-1" : ""}`}
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
                    <p className="text-base font-semibold text-zinc-900">
                      {car.number}
                    </p>
                    <p className="mt-1 text-sm text-zinc-600">
                      {car.model} ({car.year})
                    </p>
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

export default function PartnerWorkPage() {
  return (
    <Suspense fallback={<section className="pb-24" />}>
      <PartnerWorkPageContent />
    </Suspense>
  );
}
