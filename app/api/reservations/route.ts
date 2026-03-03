import { supabase } from "@/src/lib/supabase";
import { NextResponse } from "next/server";

const MOCK_USER_ID = "00000000-0000-0000-0000-000000000001";

interface ReservationRequestBody {
  bayId: string;
  startTime: string;
  endTime: string;
}

function parseBody(payload: unknown): ReservationRequestBody | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const { bayId, startTime, endTime } = payload as Record<string, unknown>;
  if (
    typeof bayId !== "string" ||
    typeof startTime !== "string" ||
    typeof endTime !== "string"
  ) {
    return null;
  }

  if (!bayId.trim() || !startTime.trim() || !endTime.trim()) {
    return null;
  }

  return {
    bayId: bayId.trim(),
    startTime: startTime.trim(),
    endTime: endTime.trim(),
  };
}

export async function POST(req: Request) {
  try {
    const payload: unknown = await req.json();
    const body = parseBody(payload);

    if (!body) {
      return NextResponse.json({ error: "필수값 누락" }, { status: 400 });
    }

    const { bayId, startTime, endTime } = body;
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      startDate.getTime() >= endDate.getTime()
    ) {
      return NextResponse.json(
        { error: "시간 형식이 올바르지 않거나 시간 범위가 잘못되었습니다." },
        { status: 400 },
      );
    }

    if (endDate.getTime() - startDate.getTime() < 60 * 60 * 1000) {
      return NextResponse.json(
        { error: "최소 예약 시간은 1시간입니다." },
        { status: 400 },
      );
    }

    const { data: bay, error: bayError } = await supabase
      .from("bays")
      .select("id")
      .eq("id", bayId)
      .maybeSingle<{ id: string }>();

    if (bayError) {
      console.error("BAY LOOKUP ERROR:", bayError);
      return NextResponse.json(
        { error: "베이 조회 중 오류가 발생했습니다." },
        { status: 500 },
      );
    }

    if (!bay) {
      return NextResponse.json(
        { error: "유효하지 않은 bayId 입니다. 존재하는 베이를 선택해 주세요." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("reservations")
      .insert({
        user_id: MOCK_USER_ID,
        bay_id: bayId,
        start_time: startTime,
        end_time: endTime,
        status: "CONFIRMED",
        total_price: 20000,
      })
      .select("id, status")
      .single<{ id: string; status: string }>();

    if (error) {
      console.error("SUPABASE ERROR:", error);

      if (error.code === "23P01") {
        return NextResponse.json(
          { error: "이미 예약된 시간입니다." },
          { status: 400 },
        );
      }

      if (error.code === "23503") {
        return NextResponse.json(
          { error: "유효하지 않은 bayId 입니다. 존재하는 베이를 선택해 주세요." },
          { status: 400 },
        );
      }

      return NextResponse.json({ error: "예약 생성 실패" }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (e: unknown) {
    console.error("SERVER ERROR:", e);
    return NextResponse.json(
      { error: "서버 내부 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
