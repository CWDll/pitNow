import type { ReservationType } from "@/src/domain/types";

export interface GarageSummary {
  id: string;
  bayId: string;
  name: string;
  distanceKm: number;
  bayCount: number;
  rating: number;
  reviewCount: number;
  hourlyPrice: number;
  nextSlot: string;
  address: string;
  hours: string;
  phone: string;
}

export interface SelfWorkOption {
  id: string;
  title: string;
  level: "Beginner" | "Intermediate";
  description: string;
  recommendedMinutes: number;
}

export interface ShopPackage {
  id: string;
  name: string;
  summary: string;
  includes: string[];
  durationMinutes: number;
  priceByGarageId: Record<string, number>;
}

export const garageList: GarageSummary[] = [
  {
    id: "gangnam-self",
    bayId: "00000000-0000-0000-0000-000000000001",
    name: "강남 셀프정비소",
    distanceKm: 1.2,
    bayCount: 6,
    rating: 4.8,
    reviewCount: 128,
    hourlyPrice: 15000,
    nextSlot: "오늘 14:00",
    address: "서울 강남구 테헤란로 123",
    hours: "09:00 - 21:00",
    phone: "02-1234-5678",
  },
  {
    id: "seocho-diy",
    bayId: "00000000-0000-0000-0000-000000000002",
    name: "서초 DIY 카센터",
    distanceKm: 2.5,
    bayCount: 4,
    rating: 4.5,
    reviewCount: 87,
    hourlyPrice: 12000,
    nextSlot: "오늘 15:30",
    address: "서울 서초구 반포대로 42",
    hours: "10:00 - 20:00",
    phone: "02-9876-5432",
  },
];

export const selfWorkOptions: SelfWorkOption[] = [
  {
    id: "engine-oil",
    title: "엔진오일 교환",
    level: "Beginner",
    description: "오일 배출, 필터 교체, 신유 주입까지 직접 진행합니다.",
    recommendedMinutes: 60,
  },
  {
    id: "brake-pad",
    title: "브레이크 패드 점검",
    level: "Intermediate",
    description: "캘리퍼 분리와 상태 점검이 필요한 작업입니다.",
    recommendedMinutes: 90,
  },
  {
    id: "tire-rotation",
    title: "타이어 위치 교환",
    level: "Beginner",
    description: "4개 타이어를 교차 배치해 마모를 균등화합니다.",
    recommendedMinutes: 60,
  },
  {
    id: "air-filter",
    title: "에어필터 교체",
    level: "Beginner",
    description: "흡기 필터 교체와 장착 상태를 확인합니다.",
    recommendedMinutes: 30,
  },
];

export const shopPackages: ShopPackage[] = [
  {
    id: "pkg-engine-oil",
    name: "엔진오일 패키지",
    summary: "전문가가 오일 교환과 기본 점검을 수행합니다.",
    includes: ["엔진오일 교환", "오일 필터 확인", "누유 점검"],
    durationMinutes: 40,
    priceByGarageId: {
      "gangnam-self": 49000,
      "seocho-diy": 45000,
    },
  },
  {
    id: "pkg-season-care",
    name: "시즌 케어 패키지",
    summary: "와이퍼, 워셔액, 공기압 등 시즌 필수 항목을 점검합니다.",
    includes: ["와이퍼 점검", "워셔액 보충", "공기압 체크"],
    durationMinutes: 30,
    priceByGarageId: {
      "gangnam-self": 29000,
      "seocho-diy": 25000,
    },
  },
  {
    id: "pkg-brake-check",
    name: "브레이크 케어 패키지",
    summary: "브레이크 상태 확인과 소모품 진단을 진행합니다.",
    includes: ["패드 잔량 점검", "디스크 상태 점검", "기본 정비 리포트"],
    durationMinutes: 70,
    priceByGarageId: {
      "gangnam-self": 69000,
      "seocho-diy": 64000,
    },
  },
];

export function getGarageById(id: string): GarageSummary | null {
  return garageList.find((garage) => garage.id === id) ?? null;
}

export function getSelfWorkById(id: string): SelfWorkOption | null {
  return selfWorkOptions.find((option) => option.id === id) ?? null;
}

export function getShopPackageById(id: string): ShopPackage | null {
  return shopPackages.find((item) => item.id === id) ?? null;
}

export function getGarageShopPackages(garageId: string): Array<ShopPackage & { price: number }> {
  return shopPackages
    .map((item) => ({
      ...item,
      price: item.priceByGarageId[garageId] ?? 0,
    }))
    .filter((item) => item.price > 0);
}

export function getReservationTypeLabel(type: ReservationType): string {
  return type === "SELF_SERVICE" ? "셀프 정비" : "전문가 맡기기";
}

export function roundUpToBlockMinutes(durationMinutes: number): number {
  return Math.ceil(durationMinutes / 30) * 30;
}

export function formatMinutesLabel(durationMinutes: number): string {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}시간 ${minutes}분`;
  }

  if (hours > 0) {
    return `${hours}시간`;
  }

  return `${minutes}분`;
}
