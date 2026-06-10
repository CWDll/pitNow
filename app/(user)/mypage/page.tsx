"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/src/lib/supabase";

import { Card, Line, Pill, Screen } from "../_components/mobile-ui";

export default function MyPage() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const { data } = await supabase.auth.getSession();

      if (mounted) {
        setUser(data.session?.user ?? null);
        setIsLoading(false);
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
    <Screen title="My Page" subtitle="계정 및 이용 내역을 확인하세요.">
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">사용자 정보</h2>
          <Pill label={user ? "로그인" : "게스트"} tone={user ? "accent" : "default"} />
        </div>

        {isLoading ? (
          <>
            <Line widthClass="w-1/3" />
            <Line widthClass="w-2/3" />
          </>
        ) : user ? (
          <div className="space-y-3">
            <div className="rounded-2xl bg-zinc-100 px-4 py-3">
              <p className="text-xs font-medium text-zinc-500">이메일</p>
              <p className="mt-1 break-all text-sm font-semibold text-zinc-900">
                {user.email ?? "이메일 정보 없음"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="h-11 w-full rounded-2xl border border-zinc-300 text-sm font-semibold text-zinc-700 disabled:text-zinc-400"
            >
              {isSigningOut ? "로그아웃 중..." : "로그아웃"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm leading-6 text-zinc-600">
              예약, 체크인 사진, 체크아웃 정산을 계정에 안전하게 연결하려면
              로그인이 필요합니다.
            </p>
            <Link
              href="/login?next=/mypage"
              className="flex h-11 items-center justify-center rounded-2xl bg-zinc-950 text-sm font-semibold text-white"
            >
              로그인 / 회원가입
            </Link>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-900">메뉴</h3>
        <div className="space-y-2">
          {[
            ["예약 내역", "/reservation"],
            ["결제 수단", "/mypage"],
            ["알림 설정", "/mypage"],
            ["고객센터", "/guide"],
          ].map(([item, href]) => (
            <Link
              key={item}
              href={href}
              className="flex items-center justify-between rounded-xl bg-zinc-100 px-3 py-3"
            >
              <span className="text-sm text-zinc-700">{item}</span>
              <span className="text-xs text-zinc-400">&gt;</span>
            </Link>
          ))}
        </div>
      </Card>
    </Screen>
  );
}
