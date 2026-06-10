"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { supabase } from "@/src/lib/supabase";

type AuthMode = "signin" | "signup";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/mypage";

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function redirectIfSignedIn() {
      const { data } = await supabase.auth.getSession();

      if (mounted && data.session) {
        router.replace(nextPath);
      }
    }

    void redirectIfSignedIn();

    return () => {
      mounted = false;
    };
  }, [nextPath, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!email.trim() || !password) {
      setError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    if (password.length < 6) {
      setError("비밀번호는 최소 6자 이상이어야 합니다.");
      return;
    }

    setIsLoading(true);

    try {
      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInError) {
          setError(signInError.message || "로그인에 실패했습니다.");
          return;
        }

        router.replace(nextPath);
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (signUpError) {
        setError(signUpError.message || "회원가입에 실패했습니다.");
        return;
      }

      if (data.session) {
        router.replace(nextPath);
        return;
      }

      setMessage(
        "회원가입이 접수되었습니다. Supabase 이메일 확인 설정이 켜져 있다면 메일 인증 후 로그인해 주세요.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="min-h-dvh pb-24 pt-6">
      <div className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
          PitNow Account
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">
          정비 루프를 이어가려면 로그인해 주세요
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          예약, 체크인 사진, 체크아웃 정산은 계정 기준으로 안전하게
          저장됩니다.
        </p>
      </div>

      <div className="mt-5 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-zinc-100 p-1">
          {([
            ["signin", "로그인"],
            ["signup", "회원가입"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                setError("");
                setMessage("");
              }}
              className={`h-11 rounded-xl text-sm font-semibold transition ${
                mode === value
                  ? "bg-zinc-950 text-white shadow-sm"
                  : "text-zinc-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">이메일</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className="mt-2 h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none ring-cyan-200 focus:ring-4"
              placeholder="you@example.com"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">비밀번호</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className="mt-2 h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base outline-none ring-cyan-200 focus:ring-4"
              placeholder="6자 이상"
            />
          </label>

          {error ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </p>
          ) : null}

          {message ? (
            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="h-12 w-full rounded-2xl bg-cyan-400 text-base font-bold text-slate-950 transition hover:bg-cyan-300 disabled:bg-zinc-200 disabled:text-zinc-500"
          >
            {isLoading
              ? "처리 중..."
              : mode === "signin"
                ? "로그인"
                : "회원가입"}
          </button>
        </form>
      </div>
    </section>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<section className="min-h-dvh" />}>
      <LoginPageContent />
    </Suspense>
  );
}
