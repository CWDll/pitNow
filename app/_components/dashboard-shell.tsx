"use client";

import {
  Ban,
  Boxes,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  PackageSearch,
  ReceiptText,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { supabase } from "@/src/lib/supabase";

type DashboardVariant = "admin" | "partner";

interface DashboardShellProps {
  children: ReactNode;
  variant: DashboardVariant;
}

const adminNavItems = [
  { href: "/admin", label: "운영 현황", icon: LayoutDashboard },
  { href: "/admin/reservations", label: "예약 관리", icon: CalendarDays },
  { href: "/admin/settlement", label: "정산 관리", icon: ReceiptText },
  { href: "/admin/payments", label: "결제 관리", icon: CreditCard },
  { href: "/admin/partner-audit", label: "파트너 감사", icon: ShieldCheck },
  { href: "/admin/packages", label: "패키지 관리", icon: PackageSearch },
] as const;

const partnerNavItems = [
  { href: "/partner-admin", label: "운영 현황", icon: LayoutDashboard },
  { href: "/partner-admin#bays", label: "베이 관리", icon: Wrench },
  { href: "/partner-admin#packages", label: "패키지·가격", icon: Boxes },
  { href: "/partner-admin#availability", label: "예약 차단", icon: Ban },
  {
    href: "/partner-admin#reservations",
    label: "예약 현황",
    icon: ClipboardCheck,
  },
] as const;

const sidebarActionClassName =
  "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950";

export function DashboardShell({ children, variant }: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [hash, setHash] = useState("");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [partnerName, setPartnerName] = useState("정비소 운영 콘솔");
  const isAdmin = variant === "admin";
  const navItems = isAdmin ? adminNavItems : partnerNavItems;

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

  useEffect(() => {
    if (isAdmin) {
      return;
    }

    const updatePartnerName = (event: Event) => {
      const detail = (event as CustomEvent<{ partnerName?: string }>).detail;
      setPartnerName(detail?.partnerName?.trim() || "정비소 운영 콘솔");
    };

    window.addEventListener("pitnow:partner-context", updatePartnerName);
    return () =>
      window.removeEventListener("pitnow:partner-context", updatePartnerName);
  }, [isAdmin]);

  const isActive = (href: string) => {
    const [itemPath, itemHash = ""] = href.split("#");

    if (itemHash) {
      return pathname === itemPath && hash === `#${itemHash}`;
    }

    if (href === "/admin" || href === "/partner-admin") {
      return pathname === href && hash === "";
    }

    return pathname.startsWith(href);
  };

  const currentItem =
    navItems.find((item) => isActive(item.href)) ??
    [...navItems]
      .reverse()
      .find((item) => pathname.startsWith(item.href.split("#")[0]));

  async function signOutPartner() {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login?next=/partner-admin");
    router.refresh();
  }

  return (
    <div className="min-h-dvh min-w-[1180px] bg-slate-100 text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-slate-200 bg-white px-4 py-5">
        <Link
          href={isAdmin ? "/admin" : "/partner-admin"}
          className="px-3 py-2"
        >
          <span className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-lg bg-blue-600 text-sm font-black text-white">
              P
            </span>
            <span>
              <span className="block text-lg font-black text-slate-950">
                PitNow
              </span>
              <span className="block text-xs font-semibold text-slate-500">
                {isAdmin ? "Admin Console" : "Partner Console"}
              </span>
            </span>
          </span>
        </Link>

        <nav className="mt-7 space-y-1" aria-label="대시보드 메뉴">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  const nextHash = item.href.includes("#")
                    ? `#${item.href.split("#")[1]}`
                    : "";
                  setHash(nextHash);
                }}
                className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${
                  isAdmin && active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                <Icon size={18} strokeWidth={isAdmin && active ? 2.5 : 2} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-1 border-t border-slate-200 pt-4">
          <Link
            href="/"
            className={sidebarActionClassName}
          >
            <ExternalLink size={17} />
            사용자 앱 열기
          </Link>
          {isAdmin ? (
            <Link
              href="/admin/logout"
              prefetch={false}
              className={sidebarActionClassName}
            >
              <LogOut size={17} />
              로그아웃
            </Link>
          ) : (
            <Link
              href="/login?next=/partner-admin"
              aria-disabled={isSigningOut}
              onClick={(event) => {
                event.preventDefault();
                if (!isSigningOut) {
                  void signOutPartner();
                }
              }}
              className={
                isSigningOut
                  ? `${sidebarActionClassName} pointer-events-none opacity-50`
                  : sidebarActionClassName
              }
            >
              <LogOut size={17} />
              {isSigningOut ? "로그아웃 중" : "로그아웃"}
            </Link>
          )}
        </div>
      </aside>

      <div className="min-h-dvh min-w-0 pl-60">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-7 backdrop-blur">
          <div>
            <p className="text-sm font-bold text-slate-900">
              {isAdmin ? (currentItem?.label ?? "운영 콘솔") : partnerName}
            </p>
            <p className="text-xs text-slate-500">
              {isAdmin
                ? "PitNow 전체 서비스 운영"
                : "예약, 베이, 패키지와 영업 차단을 관리합니다."}
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            운영 중
          </span>
        </header>

        <main className="dashboard-content min-w-0 p-7 [&_.rounded-3xl]:rounded-lg [&_.text-4xl]:text-3xl [&_.text-5xl]:text-3xl">
          {children}
        </main>
      </div>
    </div>
  );
}
