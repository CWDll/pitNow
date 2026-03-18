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
      bayId: null;
      startTime: string;
      durationMinutes: number;
      endTime: string;
      reservedEndTime: string;
      totalPrice: number;
      packageId: string;
      blockedMinutes: number;
    };

interface BayRow {
  id: string;
  partner_id: string;
}

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
      bayId: null,
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

async function insertReservation(params: {
  bayId: string;
  body: ParsedReservation;
}) {
  const { bayId, body } = params;

  return supabase
    .from("reservations")
    .insert({
      user_id: MOCK_USER_ID,
      partner_id: body.partnerId,
      bay_id: bayId,
      reservation_type: body.reservationType,
      package_id: body.packageId,
      start_time: body.startTime,
      end_time: body.endTime,
      reserved_end_time: body.reservedEndTime,
      duration_minutes: body.durationMinutes,
      status: "CONFIRMED",
      total_price: body.totalPrice,
    })
    .select("id, status, bay_id")
    .single<{ id: string; status: string; bay_id: string }>();
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

    const garage = getGarageById(body.partnerId);
    if (!garage) {
      return NextResponse.json({ error: "정비소 정보를 찾을 수 없습니다." }, { status: 400 });
    }

    if (body.reservationType === "SELF_SERVICE") {
      const { data: bay, error: bayError } = await supabase
        .from("bays")
        .select("id, partner_id")
        .eq("id", body.bayId)
        .maybeSingle<BayRow>();

      if (bayError) {
        console.error("BAY LOOKUP ERROR:", bayError);
        return NextResponse.json({ error: "베이 조회 중 오류가 발생했습니다." }, { status: 500 });
      }

      if (!bay || bay.partner_id !== body.partnerId || !garage.bayIds.includes(bay.id)) {
        return NextResponse.json({ error: "선택한 정비소와 베이 정보가 일치하지 않습니다." }, { status: 400 });
      }

      const { data, error } = await insertReservation({
        bayId: body.bayId,
        body,
      });

      if (error) {
        console.error("SUPABASE ERROR:", error);

        if (error.code === "23P01") {
          return NextResponse.json({ error: "이미 예약된 시간입니다." }, { status: 400 });
        }

        return NextResponse.json({ error: "예약 생성에 실패했습니다." }, { status: 400 });
      }

      return NextResponse.json({
        id: data.id,
        status: data.status,
        reservationType: body.reservationType,
        blockedMinutes: body.blockedMinutes,
        totalPrice: body.totalPrice,
        bayId: data.bay_id,
      });
    }

    const { data: partnerBays, error: baysError } = await supabase
      .from("bays")
      .select("id, partner_id")
      .eq("partner_id", body.partnerId)
      .eq("is_active", true)
      .returns<BayRow[]>();

    if (baysError) {
      console.error("PARTNER BAYS LOOKUP ERROR:", baysError);
      return NextResponse.json({ error: "업장 베이 조회 중 오류가 발생했습니다." }, { status: 500 });
    }

    const candidateBayIds = (partnerBays ?? [])
      .map((bay) => bay.id)
      .filter((bayId) => garage.bayIds.includes(bayId));

    if (candidateBayIds.length === 0) {
      return NextResponse.json({ error: "예약 가능한 베이가 없습니다." }, { status: 400 });
    }

    for (const candidateBayId of candidateBayIds) {
      const { data, error } = await insertReservation({
        bayId: candidateBayId,
        body,
      });

      if (!error) {
        return NextResponse.json({
          id: data.id,
          status: data.status,
          reservationType: body.reservationType,
          blockedMinutes: body.blockedMinutes,
          totalPrice: body.totalPrice,
          bayId: data.bay_id,
        });
      }

      if (error.code !== "23P01") {
        console.error("SUPABASE ERROR:", error);
        return NextResponse.json({ error: "예약 생성에 실패했습니다." }, { status: 400 });
      }
    }

    return NextResponse.json({ error: "선택한 시간에 예약 가능한 베이가 없습니다." }, { status: 400 });
  } catch (error: unknown) {
    console.error("SERVER ERROR:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
