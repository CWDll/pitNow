import type { ReservationType } from "@/src/domain/types";

export interface GarageSummary {
  id: string;
  bayId: string;
  bayIds: string[];
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

const gangnamPartnerId = "11111111-1111-1111-1111-111111111111";
const seochoPartnerId = "a5b54d03-3625-424c-8374-90911e9850f5";
const jamsilPartnerId = "22222222-2222-2222-2222-222222222222";
const mapoPartnerId = "33333333-3333-3333-3333-333333333333";

const gangnamBayIds = [
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000011",
  "00000000-0000-0000-0000-000000000012",
  "00000000-0000-0000-0000-000000000013",
  "00000000-0000-0000-0000-000000000014",
  "00000000-0000-0000-0000-000000000015",
] as const;

const seochoBayIds = [
  "4707f91f-fe36-49d1-9687-6e67cc46784f",
  "00000000-0000-0000-0000-000000000021",
  "00000000-0000-0000-0000-000000000022",
  "00000000-0000-0000-0000-000000000023",
] as const;

const jamsilBayIds = [
  "00000000-0000-0000-0000-000000000031",
  "00000000-0000-0000-0000-000000000032",
  "00000000-0000-0000-0000-000000000033",
  "00000000-0000-0000-0000-000000000034",
  "00000000-0000-0000-0000-000000000035",
] as const;

const mapoBayIds = [
  "00000000-0000-0000-0000-000000000041",
  "00000000-0000-0000-0000-000000000042",
  "00000000-0000-0000-0000-000000000043",
] as const;

export const garageList: GarageSummary[] = [
  {
    id: gangnamPartnerId,
    bayId: gangnamBayIds[0],
    bayIds: [...gangnamBayIds],
    name: "강남 셀프정비소",
    distanceKm: 1.2,
    bayCount: gangnamBayIds.length,
    rating: 4.8,
    reviewCount: 128,
    hourlyPrice: 15000,
    nextSlot: "오늘 14:00",
    address: "서울 강남구 테헤란로 123",
    hours: "09:00 - 21:00",
    phone: "02-1234-5678",
  },
  {
    id: seochoPartnerId,
    bayId: seochoBayIds[0],
    bayIds: [...seochoBayIds],
    name: "서초 DIY 개러지",
    distanceKm: 2.5,
    bayCount: seochoBayIds.length,
    rating: 4.5,
    reviewCount: 87,
    hourlyPrice: 12000,
    nextSlot: "오늘 15:30",
    address: "서울 서초구 반포대로 42",
    hours: "10:00 - 20:00",
    phone: "02-9876-5432",
  },
  {
    id: jamsilPartnerId,
    bayId: jamsilBayIds[0],
    bayIds: [...jamsilBayIds],
    name: "잠실 모빌리티 팩토리",
    distanceKm: 4.1,
    bayCount: jamsilBayIds.length,
    rating: 4.7,
    reviewCount: 64,
    hourlyPrice: 17000,
    nextSlot: "오늘 17:00",
    address: "서울 송파구 올림픽로 221",
    hours: "09:00 - 22:00",
    phone: "02-5555-1200",
  },
  {
    id: mapoPartnerId,
    bayId: mapoBayIds[0],
    bayIds: [...mapoBayIds],
    name: "마포 퀵핏 개러지",
    distanceKm: 5.3,
    bayCount: mapoBayIds.length,
    rating: 4.4,
    reviewCount: 41,
    hourlyPrice: 13000,
    nextSlot: "오늘 18:30",
    address: "서울 마포구 월드컵북로 58",
    hours: "10:00 - 21:00",
    phone: "02-3141-8899",
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
    description: "4개 타이어를 교차 배치해 마모를 고르게 맞춥니다.",
    recommendedMinutes: 60,
  },
  {
    id: "air-filter",
    title: "에어필터 교체",
    level: "Beginner",
    description: "흡기 필터를 교체하고 하우징 상태를 확인합니다.",
    recommendedMinutes: 30,
  },
];

export const shopPackages: ShopPackage[] = [
  {
    id: "pkg-engine-oil",
    name: "엔진오일 패키지",
    summary: "전문가가 오일 교환과 기본 점검을 함께 진행합니다.",
    includes: ["엔진오일 교환", "오일 필터 확인", "누유 점검"],
    durationMinutes: 40,
    priceByGarageId: {
      [gangnamPartnerId]: 49000,
      [seochoPartnerId]: 45000,
      [jamsilPartnerId]: 53000,
      [mapoPartnerId]: 47000,
    },
  },
  {
    id: "pkg-season-care",
    name: "시즌 케어 패키지",
    summary: "와이퍼, 워셔액, 공기압까지 시즌 필수 항목을 점검합니다.",
    includes: ["와이퍼 점검", "워셔액 보충", "공기압 체크"],
    durationMinutes: 30,
    priceByGarageId: {
      [gangnamPartnerId]: 29000,
      [seochoPartnerId]: 25000,
      [jamsilPartnerId]: 32000,
      [mapoPartnerId]: 27000,
    },
  },
  {
    id: "pkg-brake-check",
    name: "브레이크 케어 패키지",
    summary: "브레이크 상태 확인과 마모도 진단을 진행합니다.",
    includes: ["패드 잔량 점검", "디스크 상태 점검", "기본 정비 리포트"],
    durationMinutes: 70,
    priceByGarageId: {
      [gangnamPartnerId]: 69000,
      [seochoPartnerId]: 64000,
      [jamsilPartnerId]: 72000,
      [mapoPartnerId]: 66000,
    },
  },
];

export function getGarageById(id: string): GarageSummary | null {
  return garageList.find((garage) => garage.id === id) ?? null;
}

export function getGarageBayIdByNumber(garageId: string, bayNumber: number): string | null {
  const garage = getGarageById(garageId);
  if (!garage) {
    return null;
  }

  return garage.bayIds[bayNumber - 1] ?? null;
}

export function getGaragePrimaryBayId(garageId: string): string | null {
  return getGarageById(garageId)?.bayId ?? null;
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
