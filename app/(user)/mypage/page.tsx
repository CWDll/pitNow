"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  BookOpen,
  CalendarDays,
  CarFront,
  ChevronRight,
  LogIn,
  LogOut,
  UserRound,
} from "lucide-react";

import { supabase } from "@/src/lib/supabase";

import { Card, Line, Screen, StatePanel } from "../_components/mobile-ui";

const menuItems = [
  { label: "예약 내역", description: "예정된 예약과 지난 이용", href: "/reservation", icon: CalendarDays },
  { label: "내 차 관리", description: "예약 차량과 정비 이력", href: "/my-car", icon: CarFront },
  { label: "이용 가이드", description: "체크인과 체크아웃 절차", href: "/guide", icon: BookOpen },
];

export default function MyPage() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        const { data } = await supabase.auth.getSession();

        if (mounted) {
          setUser(data.session?.user ?? null);
          setIsLoading(false);
        }
      } catch {
        if (mounted) {
          setUser(null);
          setIsLoading(false);
        }
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    void loadSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    setIsSigningOut(false);
  }

  return (
    <Screen title="마이페이지" subtitle="계정과 PitNow 이용 정보를 관리하세요.">
      {isLoading ? (
        <Card className="space-y-3">
          <Line widthClass="w-1/3" />
          <Line widthClass="w-2/3" />
        </Card>
      ) : user ? (
        <Card className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700">
              <UserRound className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-blue-600">PITNOW MEMBER</p>
              <p className="mt-1 truncate text-sm font-black text-slate-950">
                {user.email ?? "이메일 정보 없음"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 disabled:text-slate-300"
          >
            <LogOut className="size-4" />
            {isSigningOut ? "로그아웃 중..." : "로그아웃"}
          </button>
        </Card>
      ) : (
        <StatePanel
          icon={<UserRound className="size-6" />}
          title="로그인하고 PitNow를 이어서 이용하세요"
          description="예약, 체크인 사진, 체크아웃 정산을 계정에 안전하게 연결합니다."
          action={
            <Link
              href="/login?next=/mypage"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-black text-white"
            >
              <LogIn className="size-4" />
              로그인 / 회원가입
            </Link>
          }
        />
      )}

      <section aria-labelledby="my-menu-title">
        <h2 id="my-menu-title" className="mb-3 text-lg font-black text-slate-950">서비스 메뉴</h2>
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 shadow-sm">
          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center gap-3 py-4"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-slate-900">{item.label}</span>
                <span className="mt-1 block text-xs font-semibold text-slate-500">{item.description}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-slate-400" />
            </Link>
            );
          })}
        </div>
      </section>
    </Screen>
  );
}
