import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ADMIN_ACCESS_COOKIE,
  hasConfiguredAdminToken,
  isValidAdminToken,
} from "@/src/lib/admin-auth";

async function loginAdmin(formData: FormData) {
  "use server";

  const token = String(formData.get("token") ?? "").trim();

  if (!isValidAdminToken(token)) {
    redirect("/admin-login?error=1");
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  redirect("/admin");
}

interface AdminLoginPageProps {
  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function AdminLoginPage({
  searchParams,
}: AdminLoginPageProps) {
  const params = await searchParams;
  const hasError = params.error === "1";
  const isConfigured = hasConfiguredAdminToken();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-6 text-slate-100">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-300">
          PitNow Admin
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">
          관리자 접근 확인
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          관리자 콘솔은 예약/정산 데이터를 조회하므로 별도 접근 토큰이
          필요합니다.
        </p>

        {!isConfigured ? (
          <p className="mt-5 rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            `PITNOW_ADMIN_ACCESS_TOKEN` 환경변수를 먼저 설정해 주세요.
          </p>
        ) : (
          <form action={loginAdmin} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-200">
                Admin token
              </span>
              <input
                name="token"
                type="password"
                autoComplete="current-password"
                className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 text-base text-white outline-none ring-amber-300/40 focus:ring-4"
                placeholder="관리자 접근 토큰"
              />
            </label>

            {hasError ? (
              <p className="rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                토큰이 올바르지 않습니다.
              </p>
            ) : null}

            <button
              type="submit"
              className="h-12 w-full rounded-2xl bg-amber-300 font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Admin 열기
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
