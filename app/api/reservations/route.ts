import { supabase } from "@/src/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { bayId, startTime, endTime } = body;

    if (!bayId || !startTime || !endTime) {
      return NextResponse.json({ error: "필수값 누락" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("reservations")
      .insert({
        bay_id: bayId,
        start_time: startTime,
        end_time: endTime,
        status: "CONFIRMED",
        total_price: 20000,
      })
      .select();

    if (error) {
      console.error("SUPABASE ERROR:", error);

      if (error.code === "23P01") {
        return NextResponse.json(
          { error: "이미 예약된 시간입니다." },
          { status: 400 },
        );
      }

      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (e: any) {
    console.error("SERVER ERROR:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
