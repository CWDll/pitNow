import { NextResponse } from "next/server";

import {
  getGarageById,
  getShopPackageById,
  roundUpToBlockMinutes,
} from "@/app/(user)/_data/mock-garages";
import { getSupabaseEnvErrorResponse, hasSupabaseEnv, supabase } from "@/src/lib/supabase";
import type { CreateReservationPayload } from "@/src/domain/types";

const MOCK_USER_ID = "00000000-0000-0000-0000-000000000001";

type ParsedReservation =
  | {
      reservationType: "SELF_SERVICE";
      partnerId: string;
      bayId: string;
      startTime: string;
      durationMinutes: number;
      endTime: string;
      reservedEndTime: string;
      totalPrice: number;
      packageId: null;
      blockedMinutes: number;
    }
  | {
      reservationType: "SHOP_SERVICE";
      partnerId: string;
      bayId: string;
      startTime: string;
      durationMinutes: number;
      endTime: string;
      reservedEndTime: string;
      totalPrice: number;
      packageId: string;
      blockedMinutes: number;
    };

function isIsoDateString(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

function isThirtyMinuteAligned(iso: string): boolean {
  const date = new Date(iso);
  return date.getUTCMinutes() % 30 === 0 && date.getUTCSeconds() === 0;
}

function parseBody(payload: unknown): ParsedReservation | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Partial<CreateReservationPayload> & Record<string, unknown>;

  if (record.reservationType === "SELF_SERVICE") {
    if (
      typeof record.partnerId !== "string" ||
      typeof record.bayId !== "string" ||
      typeof record.startTime !== "string" ||
      typeof record.durationMinutes !== "number"
    ) {
      return null;
    }

    if (
      !record.partnerId.trim() ||
      !record.bayId.trim() ||
      !record.startTime.trim() ||
      !Number.isFinite(record.durationMinutes)
    ) {
      return null;
    }

    if (record.durationMinutes < 60 || record.durationMinutes % 30 !== 0) {
      return null;
    }

    if (!isIsoDateString(record.startTime) || !isThirtyMinuteAligned(record.startTime)) {
      return null;
    }

    const garage = getGarageById(record.partnerId.trim());
    if (!garage) {
      return null;
    }

    const endTime = addMinutes(record.startTime, record.durationMinutes);
    const totalPrice =
      garage.hourlyPrice + Math.max(0, record.durationMinutes - 60) / 30 * Math.floor(garage.hourlyPrice / 2);

    return {
      reservationType: "SELF_SERVICE",
      partnerId: record.partnerId.trim(),
      bayId: record.bayId.trim(),
      startTime: record.startTime.trim(),
      durationMinutes: record.durationMinutes,
      endTime,
      reservedEndTime: endTime,
      totalPrice,
      packageId: null,
      blockedMinutes: record.durationMinutes,
    };
  }

  if (record.reservationType === "SHOP_SERVICE") {
    if (
      typeof record.partnerId !== "string" ||
      typeof record.packageId !== "string" ||
      typeof record.startTime !== "string"
    ) {
      return null;
    }

    if (!record.partnerId.trim() || !record.packageId.trim() || !record.startTime.trim()) {
      return null;
    }

    if (!isIsoDateString(record.startTime) || !isThirtyMinuteAligned(record.startTime)) {
      return null;
    }

    const garage = getGarageById(record.partnerId.trim());
    const selectedPackage = getShopPackageById(record.packageId.trim());

    if (!garage || !selectedPackage) {
      return null;
    }

    const totalPrice = selectedPackage.priceByGarageId[garage.id];
    if (!Number.isFinite(totalPrice)) {
      return null;
    }

    const blockedMinutes = roundUpToBlockMinutes(selectedPackage.durationMinutes);

    return {
      reservationType: "SHOP_SERVICE",
      partnerId: garage.id,
      bayId: garage.bayId,
      startTime: record.startTime.trim(),
      durationMinutes: selectedPackage.durationMinutes,
      endTime: addMinutes(record.startTime, selectedPackage.durationMinutes),
      reservedEndTime: addMinutes(record.startTime, blockedMinutes),
      totalPrice,
      packageId: selectedPackage.id,
      blockedMinutes,
    };
  }

  return null;
}

export async function POST(req: Request) {
  if (!hasSupabaseEnv) {
    return NextResponse.json(getSupabaseEnvErrorResponse(), { status: 503 });
  }

  try {
    const payload: unknown = await req.json();
    const body = parseBody(payload);

    if (!body) {
      return NextResponse.json({ error: "예약 요청 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const { data: bay, error: bayError } = await supabase
      .from("bays")
      .select("id")
      .eq("id", body.bayId)
      .maybeSingle<{ id: string }>();

    if (bayError) {
      console.error("BAY LOOKUP ERROR:", bayError);
      return NextResponse.json({ error: "베이 조회 중 오류가 발생했습니다." }, { status: 500 });
    }

    if (!bay) {
      return NextResponse.json({ error: "유효한 베이 정보를 찾을 수 없습니다." }, { status: 400 });
    }

    const insertPayload = {
      user_id: MOCK_USER_ID,
      partner_id: body.partnerId,
      bay_id: body.bayId,
      reservation_type: body.reservationType,
      package_id: body.packageId,
      start_time: body.startTime,
      end_time: body.endTime,
      reserved_end_time: body.reservedEndTime,
      status: "CONFIRMED",
      total_price: body.totalPrice,
    };

    const { data, error } = await supabase
      .from("reservations")
      .insert(insertPayload)
      .select("id, status")
      .single<{ id: string; status: string }>();

    if (error) {
      console.error("SUPABASE ERROR:", error);

      if (error.code === "23P01") {
        return NextResponse.json({ error: "이미 예약된 시간입니다." }, { status: 400 });
      }

      return NextResponse.json({ error: "예약 생성에 실패했습니다." }, { status: 400 });
    }

    return NextResponse.json({
      ...data,
      reservationType: body.reservationType,
      blockedMinutes: body.blockedMinutes,
      totalPrice: body.totalPrice,
    });
  } catch (error: unknown) {
    console.error("SERVER ERROR:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
