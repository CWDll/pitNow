"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CarFront,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  LoaderCircle,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";

import { formatMinutesLabel } from "../../../_data/mock-garages";
import type { CarItem } from "@/app/(user)/_data/mock-cars";
import type {
  SelfMaintenanceCatalog,
  SelfTaskDifficulty,
} from "@/src/domain/self-maintenance";
import type { PartnerShopPackage } from "@/src/domain/shop-package";
import type { ReservationType } from "@/src/domain/types";
import { supabase } from "@/src/lib/supabase";

function levelClass(level: SelfTaskDifficulty): string {
  return level === "BEGINNER"
    ? "bg-emerald-50 text-emerald-600"
    : "bg-amber-50 text-amber-600";
}

function levelLabel(level: SelfTaskDifficulty): string {
  return level === "BEGINNER" ? "초급" : "중급";
}

interface PartnerPackagesResponse {
  success: boolean;
  packages?: PartnerShopPackage[];
}

interface SelfCatalogResponse {
  success: boolean;
  catalog?: SelfMaintenanceCatalog;
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

interface VehicleRow {
  id: string;
  user_id: string;
  plate_number: string;
  model: string;
  year: number;
  type_label: string;
  vehicle_weight_kg: number | null;
  is_active: boolean;
  created_at: string;
}

function parseMode(value: string | null): ReservationType {
  return value === "SHOP_SERVICE" ? "SHOP_SERVICE" : "SELF_SERVICE";
}

function mapVehicleToCar(row: VehicleRow): CarItem {
  return {
    id: row.id,
    number: row.plate_number,
    model: row.model,
    year: row.year,
    typeLabel: row.type_label,
    vehicleWeightKg: row.vehicle_weight_kg,
    isActive: row.is_active,
    history: [],
  };
}

function getInitialSelectedCarId(cars: CarItem[]): string {
  return cars.find((car) => car.isActive)?.id ?? cars[0]?.id ?? "";
}

function PartnerWorkPageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = parseMode(searchParams.get("mode"));
  const initialBookingMode =
    initialMode === "SHOP_SERVICE" ? "PACKAGE" : "SELF";

  const [cars, setCars] = useState<CarItem[]>([]);
  const [isCarsLoading, setIsCarsLoading] = useState<boolean>(true);
  const [needsLoginForCars, setNeedsLoginForCars] = useState<boolean>(false);
  const [carsErrorMessage, setCarsErrorMessage] = useState<string>("");
  const [bookingMode, setBookingMode] = useState<"SELF" | "PACKAGE">(
    initialBookingMode,
  );
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");
  const [selectedCarId, setSelectedCarId] = useState<string>("");
  const [isCarPickerOpen, setIsCarPickerOpen] = useState(false);
  const [garage, setGarage] = useState<PartnerInfo | null>(null);
  const [packages, setPackages] = useState<PartnerShopPackage[]>([]);
  const [selfCatalog, setSelfCatalog] =
    useState<SelfMaintenanceCatalog | null>(null);
  const [catalogError, setCatalogError] = useState("");

  const selectedCar = useMemo(
    () => cars.find((car) => car.id === selectedCarId) ?? cars[0],
    [cars, selectedCarId],
  );
  const resolvedSelectedPackageId = selectedPackageId || packages[0]?.id || "";
  const shouldScrollCars = cars.length > 3;
  const loginNextPath = encodeURIComponent(
    `/partner/${garage?.id ?? params.id}/work?mode=${initialMode}`,
  );

  useEffect(() => {
    let isCancelled = false;

    async function loadCars() {
      setIsCarsLoading(true);
      setNeedsLoginForCars(false);
      setCarsErrorMessage("");

      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData.session) {
        if (!isCancelled) {
          setCars([]);
          setSelectedCarId("");
          setNeedsLoginForCars(true);
          setIsCarsLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("vehicles")
        .select(
          "id,user_id,plate_number,model,year,type_label,vehicle_weight_kg,is_active,created_at",
        )
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: false });

      if (isCancelled) {
        return;
      }

      if (error) {
        setCars([]);
        setSelectedCarId("");
        setCarsErrorMessage("차량 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setIsCarsLoading(false);
        return;
      }

      const nextCars = ((data ?? []) as VehicleRow[]).map(mapVehicleToCar);
      setCars(nextCars);
      setSelectedCarId(getInitialSelectedCarId(nextCars));
      setIsCarsLoading(false);
    }

    void loadCars();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadSelfCatalog() {
      setCatalogError("");
      try {
        const response = await fetch(
          `/api/self-maintenance-catalog?partnerId=${encodeURIComponent(params.id)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as SelfCatalogResponse;

        if (!response.ok || !payload.success || !payload.catalog) {
          throw new Error("SELF 카탈로그 응답이 올바르지 않습니다.");
        }

        if (!isCancelled) {
          setSelfCatalog(payload.catalog);
          setSelectedTaskIds((current) =>
            current.length > 0
              ? current
              : payload.catalog?.tasks[0]?.code
                ? [payload.catalog.tasks[0].code]
                : [],
          );
        }
      } catch (error) {
        console.error("SELF CATALOG LOAD ERROR:", error);
        if (!isCancelled) {
          setCatalogError(
            "SELF 작업 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
          );
        }
      }
    }

    void loadSelfCatalog();
    return () => {
      isCancelled = true;
    };
  }, [params.id]);

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
      <section className="space-y-5 pt-7">
        <h1 className="text-2xl font-black text-slate-950">예약 방식 선택</h1>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-500 shadow-sm">
          <LoaderCircle className="size-5 animate-spin text-blue-600" />
          정비소 정보를 불러오는 중입니다.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5 pb-28 pt-5">
      <header className="flex items-center gap-3">
        <Link
          href={`/partner/${garage.id}`}
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm"
          aria-label="뒤로가기"
          title="뒤로가기"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-slate-950">예약 방식 선택</h1>
          <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{garage.name}</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => setBookingMode("SELF")}
          aria-pressed={bookingMode === "SELF"}
          className={`flex min-h-13 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black transition ${
            bookingMode === "SELF"
              ? "bg-blue-600 text-white"
              : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          <Wrench className="size-4" />
          시간제 예약
        </button>
        <button
          type="button"
          onClick={() => setBookingMode("PACKAGE")}
          aria-pressed={bookingMode === "PACKAGE"}
          className={`flex min-h-13 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black transition ${
            bookingMode === "PACKAGE"
              ? "bg-emerald-600 text-white"
              : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          <ShieldCheck className="size-4" />
          패키지 예약
        </button>
      </div>

      {bookingMode === "SELF" ? (
        <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs font-semibold leading-5 text-blue-800">
          안전 기준에 따라 허용된 셀프 정비 작업만 선택할 수 있습니다.
        </p>
      ) : null}

      <section aria-labelledby="vehicle-title">
        <div className="mb-3 flex items-end justify-between">
          <h2 id="vehicle-title" className="text-lg font-black text-slate-950">예약 차량</h2>
          <span className="text-xs font-bold text-slate-400">
            {cars.length === 1
              ? "자동 선택"
              : cars.length > 1
                ? `${cars.length}대`
                : "필수"}
          </span>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <button
          type="button"
          onClick={() => (cars.length > 1 ? setIsCarPickerOpen(true) : null)}
          disabled={cars.length <= 1}
          className="flex w-full items-center gap-3 rounded-xl bg-slate-50 p-3 text-left disabled:cursor-default"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-blue-600 shadow-sm">
            <CarFront className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-black text-slate-900">
              {isCarsLoading
                ? "차량 정보를 불러오는 중"
                : selectedCar
                  ? `${selectedCar.model} (${selectedCar.year})`
                  : "예약 차량이 필요합니다"}
            </span>
            <span className="mt-1 block text-xs font-semibold text-slate-500">
              {selectedCar?.number ?? "로그인 후 차량을 선택해 주세요"}
            </span>
          </span>
          {cars.length > 1 ? <ChevronDown className="size-4 text-slate-400" /> : null}
        </button>
        {needsLoginForCars ? (
          <Link
            href={`/login?next=${loginNextPath}`}
            className="mt-3 flex h-10 items-center justify-center rounded-xl bg-slate-950 text-sm font-black text-white"
          >
            로그인하고 계속하기
          </Link>
        ) : carsErrorMessage ? (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{carsErrorMessage}</p>
        ) : !isCarsLoading && cars.length === 0 ? (
          <Link href="/my-car" className="mt-3 flex h-10 items-center justify-center rounded-xl bg-blue-600 text-sm font-black text-white">
            내 차량 등록하기
          </Link>
        ) : null}
        </div>
      </section>

      <section aria-labelledby="work-list-title">
        <div className="mb-3 flex items-end justify-between">
          <h2 id="work-list-title" className="text-lg font-black text-slate-950">
            {bookingMode === "SELF" ? "정비 작업 선택" : "패키지 선택"}
          </h2>
          <span className="text-xs font-bold text-slate-400">
            {bookingMode === "SELF" ? `${selectedTaskIds.length}개 선택` : "1개 선택"}
          </span>
        </div>
        <div className="space-y-3">
        {bookingMode === "SELF" ? (
          catalogError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {catalogError}
            </p>
          ) : !selfCatalog ? (
            <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-10">
              <LoaderCircle className="size-5 animate-spin text-blue-600" />
            </div>
          ) : (
          selfCatalog.tasks.map((option) => {
            const selected = selectedTaskIds.includes(option.code);

            return (
              <button
                key={option.code}
                type="button"
                onClick={() =>
                  setSelectedTaskIds((prev) =>
                    prev.includes(option.code)
                      ? prev.filter((id) => id !== option.code)
                      : [...prev, option.code],
                  )
                }
                aria-pressed={selected}
                className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                  selected
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-base font-black text-slate-900">
                    {option.name}
                  </p>
                  {selected ? (
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-blue-600 text-white">
                      <Check className="size-3.5" />
                    </span>
                  ) : null}
                </div>

                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span
                    className={`rounded-full px-2 py-1 font-medium ${levelClass(option.difficulty)}`}
                  >
                    {levelLabel(option.difficulty)}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-bold text-slate-600">
                    작업 확인 가산{" "}
                    {option.workCheckUnitFee.toLocaleString("ko-KR")}원
                  </span>
                  {!option.workCheckEnabled ? (
                    <span className="rounded-md bg-slate-100 px-2 py-1 font-bold text-slate-500">
                      이 정비소는 작업 확인 미제공
                    </span>
                  ) : null}
                </div>

                <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                  {option.description}
                </p>
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <p className="text-xs font-black text-slate-700">
                    정비사 작업 확인 항목
                  </p>
                  <ul className="mt-2 grid gap-1.5 text-xs font-semibold text-slate-500">
                    {option.checkItems.map((item) => (
                      <li key={item.id} className="flex gap-2">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-blue-600" />
                        {item.label}
                      </li>
                    ))}
                  </ul>
                </div>
              </button>
            );
          }))
        ) : packages.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center">
            <ShieldCheck className="mx-auto size-6 text-slate-400" />
            <p className="mt-3 text-sm font-bold text-slate-600">현재 예약 가능한 패키지가 없습니다.</p>
          </div>
        ) : (
          packages.map((item) => {
            const selected = resolvedSelectedPackageId === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedPackageId(item.id)}
                aria-pressed={selected}
                className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                  selected
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-black text-slate-900">
                      {item.name}
                    </p>
                    <p className="mt-1 text-sm font-medium leading-6 text-slate-600">
                      {item.summary}
                    </p>
                  </div>
                  {selected ? (
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
                      <Check className="size-3.5" />
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="flex items-center gap-1 text-xs font-bold text-slate-500">
                    <Clock3 className="size-3.5" />
                    {formatMinutesLabel(item.durationMinutes)}
                  </p>
                  <p className="text-base font-black text-slate-950">{item.price.toLocaleString("ko-KR")}원</p>
                </div>
              </button>
            );
          })
        )}
        </div>
      </section>

      <div className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
        <button
          type="button"
          disabled={
            isCarsLoading ||
            !selectedCar ||
            (bookingMode === "SELF" && !selfCatalog) ||
            (bookingMode === "SELF" && selectedTaskIds.length === 0) ||
            (bookingMode === "PACKAGE" && !resolvedSelectedPackageId)
          }
          onClick={() =>
            selectedCar
              ? router.push(
                  `/partner/${garage.id}/schedule?mode=${bookingMode === "PACKAGE" ? "SHOP_SERVICE" : "SELF_SERVICE"}&bookingMode=${bookingMode}&taskIds=${encodeURIComponent(
                    selectedTaskIds.join(","),
                  )}&taskLabels=${encodeURIComponent(
                    (selfCatalog?.tasks ?? [])
                      .filter((task) => selectedTaskIds.includes(task.code))
                      .map((task) => task.name)
                      .join(", "),
                  )}&packageId=${encodeURIComponent(resolvedSelectedPackageId)}&packageTitle=${encodeURIComponent(
                    packages.find(
                      (item) => item.id === resolvedSelectedPackageId,
                    )?.name ?? "패키지",
                  )}&packageMinutes=${encodeURIComponent(
                    String(
                      packages.find(
                        (item) => item.id === resolvedSelectedPackageId,
                      )?.durationMinutes ?? 60,
                    ),
                  )}&packagePrice=${encodeURIComponent(
                    String(
                      packages.find(
                        (item) => item.id === resolvedSelectedPackageId,
                      )?.price ?? 0,
                    ),
                  )}&carId=${selectedCar.id}&carLabel=${encodeURIComponent(`${selectedCar.model} (${selectedCar.year})`)}`,
                )
              : null
          }
          className="flex h-12 w-full items-center justify-center gap-1 rounded-xl bg-blue-600 text-sm font-black text-white shadow-sm disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
        >
          시간 선택으로 이동
          <ChevronRight className="size-4" />
        </button>
      </div>

      {isCarPickerOpen && cars.length > 1 ? (
        <div
          className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] top-0 z-80 flex items-end justify-center bg-slate-950/40"
          onClick={() => setIsCarPickerOpen(false)}
        >
          <div
            className="w-full max-w-[430px] rounded-t-2xl bg-white p-4 pb-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900">차량 선택</h3>
              <button
                type="button"
                onClick={() => setIsCarPickerOpen(false)}
                aria-label="차량 선택 닫기"
                title="닫기"
                className="grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-500"
              >
                <X className="size-4" />
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
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <p className="text-sm font-black text-slate-900">
                      {car.number}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
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
