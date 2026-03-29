import type { ReservationType } from "@/src/domain/types";

const gangnamPartnerId = "11111111-1111-1111-1111-111111111111";
const seochoPartnerId = "22222222-2222-2222-2222-222222222222";

const gangnamBayIds = [
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
  "00000000-0000-0000-0000-000000000003",
  "00000000-0000-0000-0000-000000000004",
  "00000000-0000-0000-0000-000000000005",
  "00000000-0000-0000-0000-000000000006",
] as const;

const seochoBayIds = [
  "00000000-0000-0000-0000-000000000007",
  "00000000-0000-0000-0000-000000000008",
  "00000000-0000-0000-0000-000000000009",
  "00000000-0000-0000-0000-00000000000a",
] as const;

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
  level: "초급" | "중급";
  description: string;
  durationLabel: string;
  helperRequired?: boolean;
  helperNote?: string;
}

export type WorkOption = SelfWorkOption;

export interface ShopPackage {
  id: string;
  name: string;
  summary: string;
  includes: string[];
  durationMinutes: number;
  priceByGarageId: Record<string, number>;
}

export interface SelfMaintenanceTaskOption {
  id: string;
  title: string;
  level: "초급" | "중급";
  description: string;
  helperVerifyUnitFee: number;
}

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
];

export const workOptions: WorkOption[] = [
  {
    id: "engine-oil",
    title: "엔진오일 교환",
    level: "초급",
    description: "오일 드레인 → 필터 교체 → 새 오일 주입",
    durationLabel: "약 1시간",
  },
  {
    id: "brake-pad",
    title: "브레이크 패드 교환",
    level: "중급",
    helperRequired: true,
    description: "캘리퍼 분리 → 패드 교체 → 조립",
    durationLabel: "약 1.5시간",
    helperNote: "안전을 위해 헬퍼가 반드시 동행합니다 (+8,000원)",
  },
  {
    id: "tire-rotation",
    title: "타이어 로테이션",
    level: "초급",
    description: "4개 타이어 위치 교체 (대각선 방식)",
    durationLabel: "약 1시간",
  },
  {
    id: "air-filter",
    title: "에어필터 교환",
    level: "초급",
    description: "에어클리너 박스 열기 → 필터 교체",
    durationLabel: "약 30분",
  },
  {
    id: "wiper",
    title: "와이퍼 블레이드 교체",
    level: "초급",
    description: "기존 와이퍼 분리 → 새 블레이드 장착",
    durationLabel: "약 20분",
  },
];

export const selfWorkOptions: SelfWorkOption[] = [...workOptions];

export const shopPackages: ShopPackage[] = [
  {
    id: "pkg-engine-basic",
    name: "엔진오일 패키지",
    summary: "엔진오일 + 필터 교체",
    includes: ["엔진오일 교체", "오일필터 교체", "기본 점검"],
    durationMinutes: 90,
    priceByGarageId: {
      [gangnamPartnerId]: 69000,
      [seochoPartnerId]: 64000,
    },
  },
  {
    id: "pkg-brake-care",
    name: "브레이크 케어",
    summary: "브레이크 패드/디스크 점검 및 교체",
    includes: ["브레이크 점검", "패드 교체", "제동 테스트"],
    durationMinutes: 120,
    priceByGarageId: {
      [gangnamPartnerId]: 119000,
      [seochoPartnerId]: 109000,
    },
  },
];

export const selfMaintenanceTaskOptions: SelfMaintenanceTaskOption[] = [
  {
    id: "engine-oil",
    title: "엔진오일 교환",
    level: "초급",
    description: "오일 드레인 → 필터 교체 → 새 오일 주입",
    helperVerifyUnitFee: 2000,
  },
  {
    id: "brake-pad",
    title: "브레이크 패드 교환",
    level: "중급",
    description: "캘리퍼 분리 → 패드 교체 → 조립",
    helperVerifyUnitFee: 3000,
  },
  {
    id: "tire-rotation",
    title: "타이어 로테이션",
    level: "초급",
    description: "4개 타이어 위치 교체 (대각선 방식)",
    helperVerifyUnitFee: 2000,
  },
  {
    id: "air-filter",
    title: "에어필터 교환",
    level: "초급",
    description: "에어클리너 박스 열기 → 필터 교체",
    helperVerifyUnitFee: 1500,
  },
  {
    id: "wiper",
    title: "와이퍼 블레이드 교체",
    level: "초급",
    description: "기존 와이퍼 분리 → 새 블레이드 장착",
    helperVerifyUnitFee: 1000,
  },
];

export function getGarageById(id: string): GarageSummary | null {
  return garageList.find((garage) => garage.id === id) ?? null;
}

export function getGarageBayIdByNumber(
  garageId: string,
  bayNumber: number,
): string | null {
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

export function getGarageShopPackages(
  garageId: string,
): Array<ShopPackage & { price: number }> {
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
