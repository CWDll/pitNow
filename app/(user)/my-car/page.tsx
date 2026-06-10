"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Card, Pill, Screen } from "../_components/mobile-ui";
import type { CarItem } from "../_data/mock-cars";
import { supabase } from "@/src/lib/supabase";

interface CarFormState {
  number: string;
  model: string;
  year: string;
  typeLabel: string;
}

interface VehicleRow {
  id: string;
  user_id: string;
  plate_number: string;
  model: string;
  year: number;
  type_label: string;
  is_active: boolean;
  created_at: string;
}

function formatPrice(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

function mapVehicleToCar(row: VehicleRow): CarItem {
  return {
    id: row.id,
    number: row.plate_number,
    model: row.model,
    year: row.year,
    typeLabel: row.type_label,
    isActive: row.is_active,
    history: [],
  };
}

function getInitialSelectedCarId(cars: CarItem[]): string {
  return cars.find((car) => car.isActive)?.id ?? cars[0]?.id ?? "";
}

function getVehicleErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505"
  ) {
    return "이미 등록된 차량 번호입니다.";
  }

  return "차량 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export default function MyCarPage() {
  const [cars, setCars] = useState<CarItem[]>([]);
  const [selectedCarId, setSelectedCarId] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);

  const [newCar, setNewCar] = useState<CarFormState>({
    number: "",
    model: "",
    year: "",
    typeLabel: "세단",
  });

  const selectedCar = useMemo(
    () => cars.find((car) => car.id === selectedCarId) ?? cars[0],
    [cars, selectedCarId],
  );

  useEffect(() => {
    let isCancelled = false;

    async function loadVehicles() {
      setIsLoading(true);
      setMessage("");

      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUserId = sessionData.session?.user.id ?? null;

      if (!sessionUserId) {
        if (!isCancelled) {
          setUserId(null);
          setCars([]);
          setSelectedCarId("");
          setIsLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("vehicles")
        .select("id,user_id,plate_number,model,year,type_label,is_active,created_at")
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: false });

      if (isCancelled) {
        return;
      }

      if (error) {
        setUserId(sessionUserId);
        setMessage("차량 목록을 불러오지 못했습니다. Supabase SQL 적용 여부를 확인해 주세요.");
        setIsLoading(false);
        return;
      }

      const nextCars = ((data ?? []) as VehicleRow[]).map(mapVehicleToCar);
      setUserId(sessionUserId);
      setCars(nextCars);
      setSelectedCarId(getInitialSelectedCarId(nextCars));
      setIsLoading(false);
    }

    void loadVehicles();

    return () => {
      isCancelled = true;
    };
  }, []);

  function openAddModal() {
    setNewCar({ number: "", model: "", year: "", typeLabel: "세단" });
    setIsAddModalOpen(true);
  }

  function closeAddModal() {
    setIsAddModalOpen(false);
  }

  async function handleAddCar() {
    if (!userId || isSaving) {
      return;
    }

    const number = newCar.number.trim();
    const model = newCar.model.trim();
    const yearNumber = Number(newCar.year.trim());
    const typeLabel = newCar.typeLabel.trim() || "세단";

    if (!number || !model || !Number.isInteger(yearNumber) || yearNumber < 1990 || yearNumber > 2100) {
      return;
    }

    setIsSaving(true);
    setMessage("");

    const { data, error } = await supabase
      .from("vehicles")
      .insert({
        user_id: userId,
        plate_number: number,
        model,
        year: yearNumber,
        type_label: typeLabel,
        is_active: cars.length === 0,
      })
      .select("id,user_id,plate_number,model,year,type_label,is_active,created_at")
      .single();

    setIsSaving(false);

    if (error) {
      setMessage(getVehicleErrorMessage(error));
      return;
    }

    const nextCar = mapVehicleToCar(data as VehicleRow);
    setCars((prev) => [...prev, nextCar]);
    setSelectedCarId(nextCar.id);
    setIsAddModalOpen(false);
  }

  function openDeleteModal() {
    if (!selectedCar) {
      return;
    }

    setIsDeleteModalOpen(true);
  }

  function closeDeleteModal() {
    setIsDeleteModalOpen(false);
  }

  async function handleDeleteSelectedCar() {
    if (!selectedCar) {
      return;
    }

    if (cars.length <= 1) {
      setIsDeleteModalOpen(false);
      return;
    }

    setIsSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("vehicles")
      .delete()
      .eq("id", selectedCar.id);

    if (error) {
      setIsSaving(false);
      setMessage("차량을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    const nextCars = cars.filter((car) => car.id !== selectedCar.id);
    const nextSelectedCar = nextCars[0];

    if (selectedCar.isActive && nextSelectedCar) {
      const { error: activeError } = await supabase.rpc("set_active_vehicle", {
        p_vehicle_id: nextSelectedCar.id,
      });

      if (activeError) {
        setIsSaving(false);
        setMessage("삭제 후 대표 차량을 다시 설정하지 못했습니다. 차량 목록을 새로고침해 주세요.");
        return;
      }

      nextSelectedCar.isActive = true;
    }

    setCars(nextCars);
    setSelectedCarId(nextSelectedCar?.id ?? "");
    setIsSaving(false);
    setIsDeleteModalOpen(false);
  }

  async function makeActive(carId: string) {
    if (!userId || isSaving) {
      return;
    }

    setIsSaving(true);
    setMessage("");

    const { error } = await supabase.rpc("set_active_vehicle", {
      p_vehicle_id: carId,
    });

    setIsSaving(false);

    if (error) {
      setMessage("대표 차량을 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    setCars((prev) => prev.map((car) => ({ ...car, isActive: car.id === carId })));
    setSelectedCarId(carId);
  }

  if (isLoading) {
    return (
      <Screen title="My Car" subtitle="등록된 차량 정보를 관리하세요.">
        <Card>
          <p className="text-sm text-zinc-600">차량 정보를 불러오는 중입니다.</p>
        </Card>
      </Screen>
    );
  }

  if (!userId) {
    return (
      <Screen title="My Car" subtitle="등록된 차량 정보를 관리하세요.">
        <Card className="space-y-3">
          <h2 className="text-2xl font-semibold text-zinc-900">로그인이 필요합니다</h2>
          <p className="text-sm leading-6 text-zinc-600">
            차량 정보는 계정별로 안전하게 저장됩니다. 로그인 후 내 차량을 등록해 주세요.
          </p>
          <Link
            href="/login?next=/my-car"
            className="block rounded-xl bg-blue-600 py-3 text-center text-sm font-semibold text-white"
          >
            로그인하러 가기
          </Link>
        </Card>
      </Screen>
    );
  }

  if (!selectedCar) {
    return (
      <>
        <Screen title="My Car" subtitle="등록된 차량 정보를 관리하세요.">
          <Card className="space-y-3">
            <h2 className="text-2xl font-semibold text-zinc-900">등록된 차량이 없습니다</h2>
            <p className="text-sm leading-6 text-zinc-600">
              예약 전에 사용할 차량을 먼저 등록해 주세요. 첫 차량은 자동으로 대표 차량이 됩니다.
            </p>
            {message ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {message}
              </p>
            ) : null}
            <button
              type="button"
              onClick={openAddModal}
              className="rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white"
            >
              차량 추가
            </button>
          </Card>
        </Screen>
        {isAddModalOpen ? (
          <AddCarModal
            newCar={newCar}
            isSaving={isSaving}
            onChange={setNewCar}
            onClose={closeAddModal}
            onSubmit={handleAddCar}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <Screen title="My Car" subtitle="등록된 차량 정보를 관리하세요.">
        {message ? (
          <Card>
            <p className="text-sm text-red-600">{message}</p>
          </Card>
        ) : null}

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-zinc-900">대표 차량</h2>
            <Pill label={selectedCar.isActive ? "ACTIVE" : "SELECTED"} tone="accent" />
          </div>

          <div className="rounded-2xl bg-zinc-100 p-4">
            <p className="text-4xl font-semibold tracking-tight text-zinc-900">{selectedCar.number}</p>
            <div className="mt-2 flex items-end justify-between">
              <p className="text-sm text-zinc-500">{selectedCar.model} ({selectedCar.year})</p>
              <p className="text-sm text-zinc-500">{selectedCar.typeLabel}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={openAddModal}
              className="rounded-xl bg-blue-600 py-2 text-sm font-semibold text-white"
            >
              차량 추가
            </button>
            <button
              type="button"
              onClick={openDeleteModal}
              className="rounded-xl border border-red-200 bg-red-50 py-2 text-sm font-semibold text-red-600"
            >
              차량 삭제
            </button>
          </div>
        </Card>

        <Card className="space-y-3">
          <h3 className="text-2xl font-semibold text-zinc-900">차량 목록</h3>
          <div className="space-y-2">
            {cars.map((car) => {
              const selected = car.id === selectedCarId;

              return (
                <article
                  key={car.id}
                  className={`rounded-xl border px-3 py-3 ${
                    selected ? "border-blue-500 bg-blue-50" : "border-zinc-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedCarId(car.id)}
                      className="flex-1 text-left"
                    >
                      <p className="text-base font-semibold text-zinc-900">{car.number}</p>
                      <p className="mt-0.5 text-sm text-zinc-500">{car.model} ({car.year})</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => makeActive(car.id)}
                      disabled={isSaving}
                      className={`rounded-lg px-2 py-1 text-xs font-semibold disabled:opacity-60 ${
                        car.isActive ? "bg-black text-white" : "bg-zinc-200 text-zinc-700"
                      }`}
                    >
                      {car.isActive ? "ACTIVE" : "대표 설정"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-semibold text-zinc-900">정비 이력</h3>
            <span className="text-xs text-zinc-500">선택 차량 기준</span>
          </div>

          {selectedCar.history.length === 0 ? (
            <p className="rounded-xl bg-zinc-100 px-3 py-3 text-sm text-zinc-500">
              아직 정비 이력이 없습니다.
            </p>
          ) : (
            <div className="space-y-2">
              {selectedCar.history.map((history) => (
                <article key={history.id} className="rounded-xl border border-zinc-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">{history.workTitle}</p>
                      <p className="mt-1 text-xs text-zinc-500">{history.garageName}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">{history.dateLabel}</p>
                    </div>
                    <p className="text-sm font-semibold text-blue-600">{formatPrice(history.totalPrice)}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>
      </Screen>

      {isAddModalOpen ? (
        <AddCarModal
          newCar={newCar}
          isSaving={isSaving}
          onChange={setNewCar}
          onClose={closeAddModal}
          onSubmit={handleAddCar}
        />
      ) : null}

      {isDeleteModalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/35">
          <div className="w-full rounded-t-3xl bg-white p-4">
            <h4 className="text-lg font-semibold text-zinc-900">차량 삭제</h4>
            <p className="mt-2 text-sm text-zinc-600">
              {selectedCar.number} 차량을 삭제할까요?
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              마지막 차량은 삭제할 수 없습니다.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="rounded-xl bg-zinc-100 py-2 text-sm font-semibold text-zinc-700"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeleteSelectedCar}
                disabled={cars.length <= 1 || isSaving}
                className="rounded-xl bg-red-600 py-2 text-sm font-semibold text-white disabled:bg-zinc-300"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

interface AddCarModalProps {
  newCar: CarFormState;
  isSaving: boolean;
  onChange: Dispatch<SetStateAction<CarFormState>>;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
}

function AddCarModal({ newCar, isSaving, onChange, onClose, onSubmit }: AddCarModalProps) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-black/35">
      <div className="w-full rounded-t-3xl bg-white p-4">
        <h4 className="text-lg font-semibold text-zinc-900">차량 추가</h4>
        <div className="mt-3 space-y-2">
          <input
            type="text"
            placeholder="차량 번호 (예: 11가 1234)"
            value={newCar.number}
            onChange={(event) => onChange((prev) => ({ ...prev, number: event.target.value }))}
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="모델명 (예: 현대 아반떼 CN7)"
            value={newCar.model}
            onChange={(event) => onChange((prev) => ({ ...prev, model: event.target.value }))}
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              placeholder="연식"
              value={newCar.year}
              onChange={(event) => onChange((prev) => ({ ...prev, year: event.target.value }))}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-zinc-300 p-1">
              {["세단", "SUV", "해치백"].map((typeLabel) => {
                const selected = newCar.typeLabel === typeLabel;

                return (
                  <button
                    key={typeLabel}
                    type="button"
                    onClick={() => onChange((prev) => ({ ...prev, typeLabel }))}
                    className={`rounded-lg px-2 py-2 text-xs font-medium ${
                      selected ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-700"
                    }`}
                  >
                    {typeLabel}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-xl bg-zinc-100 py-2 text-sm font-semibold text-zinc-700 disabled:opacity-60"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSaving}
            className="rounded-xl bg-blue-600 py-2 text-sm font-semibold text-white disabled:bg-zinc-300"
          >
            {isSaving ? "저장 중" : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}
