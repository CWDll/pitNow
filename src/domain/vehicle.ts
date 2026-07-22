export const VEHICLE_TYPE_OPTIONS = [
  { value: "경차", label: "경차" },
  { value: "세단", label: "세단" },
  { value: "SUV", label: "SUV" },
  { value: "해치백", label: "해치백" },
  { value: "왜건", label: "왜건" },
  { value: "쿠페", label: "쿠페" },
  { value: "컨버터블", label: "컨버터블" },
  { value: "미니밴/MPV", label: "미니밴 / MPV" },
  { value: "승합차", label: "승합차" },
  { value: "픽업트럭", label: "픽업트럭" },
  { value: "소형 화물차", label: "소형 화물차 (포터 등)" },
  { value: "기타", label: "기타" },
] as const;

export type VehicleType = (typeof VEHICLE_TYPE_OPTIONS)[number]["value"];

const VEHICLE_TYPE_VALUES = new Set<string>(
  VEHICLE_TYPE_OPTIONS.map((option) => option.value),
);

export function isVehicleType(value: unknown): value is VehicleType {
  return typeof value === "string" && VEHICLE_TYPE_VALUES.has(value);
}
