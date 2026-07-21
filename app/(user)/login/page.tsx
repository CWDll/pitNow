"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, LockKeyhole, LogIn, Mail, ShieldCheck } from "lucide-react";

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
      try {
        const { data } = await supabase.auth.getSession();

        if (mounted && data.session) {
          router.replace(nextPath);
        }
      } catch {
        // The form remains available when a stale local session cannot refresh.
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
    } catch {
      setError("인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="min-h-dvh pb-16 pt-5">
      <Link
        href="/"
        aria-label="홈으로 돌아가기"
        title="홈으로 돌아가기"
        className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm"
      >
        <ArrowLeft className="size-5" />
      </Link>

      <header className="mt-7">
        <div className="grid size-12 place-items-center rounded-2xl bg-blue-600 text-white shadow-sm">
          <LockKeyhole className="size-6" />
        </div>
        <p className="mt-5 text-xs font-bold text-blue-600">PITNOW ACCOUNT</p>
        <h1 className="mt-2 text-[26px] font-black leading-9 text-slate-950">
          정비 루프를 이어가려면 로그인해 주세요
        </h1>
        <p className="mt-3 text-sm font-medium leading-6 text-slate-500">
          예약, 체크인 사진, 체크아웃 정산은 계정 기준으로 안전하게
          저장됩니다.
        </p>
      </header>

      <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
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
              aria-pressed={mode === value}
              className={`h-10 rounded-lg text-sm font-bold transition ${
                mode === value
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">이메일</span>
            <div className="relative mt-2">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-base text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
              placeholder="you@example.com"
            />
            </div>
          </label>

          <label className="block">
            <span className="text-sm font-bold text-slate-700">비밀번호</span>
            <div className="relative mt-2">
              <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-base text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
              placeholder="6자 이상"
            />
            </div>
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
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          >
            {mode === "signin" ? <LogIn className="size-4" /> : null}
            {isLoading
              ? "처리 중..."
              : mode === "signin"
                ? "로그인"
                : "회원가입"}
          </button>
        </form>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-100 px-3 py-3 text-xs font-semibold leading-5 text-slate-500">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        로그인 정보는 Supabase Auth를 통해 암호화되어 처리됩니다.
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
