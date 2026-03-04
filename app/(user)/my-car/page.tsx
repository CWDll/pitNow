"use client";

import { useEffect, useMemo, useState } from "react";

import { Card, Pill, Screen } from "../_components/mobile-ui";
import {
  CarItem,
  getInitialActiveCarId,
  initialMockCars,
  loadMockCarsFromStorage,
  saveMockCarsToStorage,
} from "../_data/mock-cars";

interface CarFormState {
  number: string;
  model: string;
  year: string;
  typeLabel: string;
}

function formatPrice(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

function buildNewCarId(cars: CarItem[]): string {
  return `car-${cars.length + 1}-${Date.now()}`;
}

export default function MyCarPage() {
  const [cars, setCars] = useState<CarItem[]>(() => {
    const storedCars = loadMockCarsFromStorage();
    return storedCars ?? initialMockCars;
  });
  const [selectedCarId, setSelectedCarId] = useState<string>(() => {
    const storedCars = loadMockCarsFromStorage();
    return getInitialActiveCarId(storedCars ?? initialMockCars);
  });

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
    saveMockCarsToStorage(cars);
  }, [cars]);

  function openAddModal() {
    setNewCar({ number: "", model: "", year: "", typeLabel: "세단" });
    setIsAddModalOpen(true);
  }

  function closeAddModal() {
    setIsAddModalOpen(false);
  }

  function handleAddCar() {
    const number = newCar.number.trim();
    const model = newCar.model.trim();
    const yearNumber = Number(newCar.year.trim());
    const typeLabel = newCar.typeLabel.trim() || "세단";

    if (!number || !model || !Number.isInteger(yearNumber) || yearNumber < 1990 || yearNumber > 2100) {
      return;
    }

    const nextCar: CarItem = {
      id: buildNewCarId(cars),
      number,
      model,
      year: yearNumber,
      typeLabel,
      isActive: false,
      history: [],
    };

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

  function handleDeleteSelectedCar() {
    if (!selectedCar) {
      return;
    }

    if (cars.length <= 1) {
      setIsDeleteModalOpen(false);
      return;
    }

    const nextCars = cars.filter((car) => car.id !== selectedCar.id);
    setCars(nextCars);
    setSelectedCarId(nextCars[0]?.id ?? "");
    setIsDeleteModalOpen(false);
  }

  function makeActive(carId: string) {
    setCars((prev) =>
      prev.map((car) => ({
        ...car,
        isActive: car.id === carId,
      })),
    );
    setSelectedCarId(carId);
  }

  if (!selectedCar) {
    return (
      <Screen title="My Car" subtitle="등록된 차량 정보를 관리하세요.">
        <Card>
          <p className="text-sm text-zinc-600">등록된 차량이 없습니다.</p>
        </Card>
      </Screen>
    );
  }

  return (
    <>
      <Screen title="My Car" subtitle="등록된 차량 정보를 관리하세요.">
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-zinc-900">대표 차량</h2>
            <Pill label="ACTIVE" tone="accent" />
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
                    selected
                      ? "border-blue-500 bg-blue-50"
                      : "border-zinc-200 bg-white"
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
                      className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                        car.isActive
                          ? "bg-black text-white"
                          : "bg-zinc-200 text-zinc-700"
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
        <div className="fixed inset-0 z-[70] flex items-end bg-black/35">
          <div className="w-full rounded-t-3xl bg-white p-4">
            <h4 className="text-lg font-semibold text-zinc-900">차량 추가</h4>
            <div className="mt-3 space-y-2">
              <input
                type="text"
                placeholder="차량 번호 (예: 11가 1234)"
                value={newCar.number}
                onChange={(event) =>
                  setNewCar((prev) => ({ ...prev, number: event.target.value }))
                }
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="모델명 (예: 현대 아반떼 CN7)"
                value={newCar.model}
                onChange={(event) =>
                  setNewCar((prev) => ({ ...prev, model: event.target.value }))
                }
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="연식"
                  value={newCar.year}
                  onChange={(event) =>
                    setNewCar((prev) => ({ ...prev, year: event.target.value }))
                  }
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                />
                <div className="grid grid-cols-3 gap-1 rounded-xl border border-zinc-300 p-1">
                  {["세단", "SUV", "해치백"].map((typeLabel) => {
                    const selected = newCar.typeLabel === typeLabel;

                    return (
                      <button
                        key={typeLabel}
                        type="button"
                        onClick={() => setNewCar((prev) => ({ ...prev, typeLabel }))}
                        className={`rounded-lg px-2 py-2 text-xs font-medium ${
                          selected
                            ? "bg-blue-600 text-white"
                            : "bg-zinc-100 text-zinc-700"
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
                onClick={closeAddModal}
                className="rounded-xl bg-zinc-100 py-2 text-sm font-semibold text-zinc-700"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleAddCar}
                className="rounded-xl bg-blue-600 py-2 text-sm font-semibold text-white"
              >
                추가
              </button>
            </div>
          </div>
        </div>
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
                disabled={cars.length <= 1}
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
