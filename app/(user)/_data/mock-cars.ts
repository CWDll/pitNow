export interface MaintenanceHistoryItem {
  id: string;
  dateLabel: string;
  garageName: string;
  workTitle: string;
  totalPrice: number;
}

export interface CarItem {
  id: string;
  number: string;
  model: string;
  year: number;
  typeLabel: string;
  isActive: boolean;
  history: MaintenanceHistoryItem[];
}

const MOCK_CARS_STORAGE_KEY = "pitnow:mock-cars:v1";

export const initialMockCars: CarItem[] = [
  {
    id: "car-1",
    number: "12가 3456",
    model: "현대 아반떼 CN7",
    year: 2022,
    typeLabel: "SUV",
    isActive: true,
    history: [
      {
        id: "h-1",
        dateLabel: "2026.03.04",
        garageName: "강남 셀프정비소",
        workTitle: "브레이크 패드 교환",
        totalPrice: 1755000,
      },
      {
        id: "h-2",
        dateLabel: "2026.02.28",
        garageName: "강남 셀프정비소",
        workTitle: "엔진오일 교환",
        totalPrice: 15000,
      },
    ],
  },
  {
    id: "car-2",
    number: "24나 8891",
    model: "기아 K5",
    year: 2021,
    typeLabel: "세단",
    isActive: false,
    history: [
      {
        id: "h-3",
        dateLabel: "2026.02.10",
        garageName: "서초 DIY 카센터",
        workTitle: "타이어 로테이션",
        totalPrice: 12000,
      },
    ],
  },
  {
    id: "car-3",
    number: "98더 1144",
    model: "제네시스 GV70",
    year: 2024,
    typeLabel: "SUV",
    isActive: false,
    history: [],
  },
];

export function getInitialActiveCarId(cars: CarItem[]): string {
  return cars.find((car) => car.isActive)?.id ?? cars[0]?.id ?? "";
}

function isCarItem(value: unknown): value is CarItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const car = value as Partial<CarItem>;

  return (
    typeof car.id === "string" &&
    typeof car.number === "string" &&
    typeof car.model === "string" &&
    typeof car.year === "number" &&
    typeof car.typeLabel === "string" &&
    typeof car.isActive === "boolean" &&
    Array.isArray(car.history)
  );
}

export function loadMockCarsFromStorage(): CarItem[] | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(MOCK_CARS_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }

    const cars = parsed.filter(isCarItem);
    return cars.length > 0 ? cars : null;
  } catch {
    return null;
  }
}

export function saveMockCarsToStorage(cars: CarItem[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(MOCK_CARS_STORAGE_KEY, JSON.stringify(cars));
}
