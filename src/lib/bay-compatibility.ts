import type { VehicleType } from "@/src/domain/vehicle";

export type BayCompatibilityCode =
  | "VEHICLE_TYPE_NOT_ALLOWED"
  | "VEHICLE_WEIGHT_REQUIRED"
  | "VEHICLE_WEIGHT_EXCEEDED";

export interface BayCompatibilityInput {
  allowedVehicleTypes: VehicleType[];
  maxVehicleWeightKg: number | null;
  vehicleType: string;
  vehicleWeightKg: number | null;
}

export type BayCompatibilityResult =
  | { compatible: true }
  | {
      compatible: false;
      code: BayCompatibilityCode;
      message: string;
    };

export function checkBayCompatibility({
  allowedVehicleTypes,
  maxVehicleWeightKg,
  vehicleType,
  vehicleWeightKg,
}: BayCompatibilityInput): BayCompatibilityResult {
  if (
    allowedVehicleTypes.length > 0 &&
    !allowedVehicleTypes.includes(vehicleType as VehicleType)
  ) {
    return {
      compatible: false,
      code: "VEHICLE_TYPE_NOT_ALLOWED",
      message: "이 베이는 선택한 차량 유형을 지원하지 않습니다.",
    };
  }

  if (maxVehicleWeightKg !== null && vehicleWeightKg === null) {
    return {
      compatible: false,
      code: "VEHICLE_WEIGHT_REQUIRED",
      message: "차량 중량을 등록해야 이 베이를 예약할 수 있습니다.",
    };
  }

  if (
    maxVehicleWeightKg !== null &&
    vehicleWeightKg !== null &&
    vehicleWeightKg > maxVehicleWeightKg
  ) {
    return {
      compatible: false,
      code: "VEHICLE_WEIGHT_EXCEEDED",
      message: `이 베이는 ${maxVehicleWeightKg.toLocaleString("ko-KR")}kg 이하 차량만 이용할 수 있습니다.`,
    };
  }

  return { compatible: true };
}
