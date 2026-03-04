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

export interface WorkOption {
  id: string;
  title: string;
  level: "초급" | "중급";
  helperRequired?: boolean;
  description: string;
  durationLabel: string;
  helperNote?: string;
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
    address: "서울 강남구 역삼동 123-45",
    hours: "09:00 - 21:00 (연중무휴)",
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
    address: "서울 서초구 서초동 42-10",
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

export function getGarageById(id: string): GarageSummary | null {
  return garageList.find((garage) => garage.id === id) ?? null;
}
