"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, TimerReset } from "lucide-react";

import { supabase } from "@/src/lib/supabase";

interface ActiveReservation {
  id: string;
  status: "CHECKED_IN" | "IN_USE";
}

export default function ActiveReservationBanner() {
  const pathname = usePathname();
  const [reservation, setReservation] = useState<ActiveReservation | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadActiveReservation() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user.id;

        if (!userId) {
          if (!cancelled) setReservation(null);
          return;
        }

        const { data, error } = await supabase
          .from("reservations")
          .select("id,status")
          .eq("user_id", userId)
          .in("status", ["CHECKED_IN", "IN_USE"])
          .order("start_time", { ascending: false })
          .limit(1)
          .maybeSingle<ActiveReservation>();

        if (error) throw error;
        if (!cancelled) setReservation(data ?? null);
      } catch {
        if (!cancelled) setReservation(null);
      }
    }

    void loadActiveReservation();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void loadActiveReservation();
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [pathname]);

  if (!reservation || pathname === "/in-use") {
    return null;
  }

  return (
    <div className="sticky top-0 z-[60] border-b border-blue-200 bg-blue-50/95 px-3 py-2 backdrop-blur">
      <Link
        href={`/in-use?reservationId=${encodeURIComponent(reservation.id)}`}
        className="mx-auto flex min-h-11 items-center gap-3 rounded-xl border border-blue-200 bg-white px-3 text-blue-800 shadow-[0_6px_18px_rgba(37,99,235,0.12)]"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-blue-600 text-white">
          <TimerReset className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-black text-blue-600">이용 중</span>
          <span className="block truncate text-sm font-black">이용 중인 예약으로 가기</span>
        </span>
        <ChevronRight className="size-4 shrink-0" />
      </Link>
    </div>
  );
}
