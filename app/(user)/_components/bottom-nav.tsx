"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  CarFront,
  Home,
  UserRound,
  type LucideIcon,
} from "lucide-react";

interface TabItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const tabs: TabItem[] = [
  { href: "/", label: "홈", icon: Home },
  { href: "/guide", label: "가이드", icon: BookOpen },
  { href: "/reservation", label: "예약", icon: CalendarDays },
  { href: "/my-car", label: "내 차", icon: CarFront },
  { href: "/mypage", label: "마이", icon: UserRound },
];

function isActivePath(currentPath: string, tabPath: string): boolean {
  if (tabPath === "/") {
    return currentPath === "/" || currentPath.startsWith("/partner/");
  }

  return currentPath === tabPath || currentPath.startsWith(`${tabPath}/`);
}

export default function BottomNav() {
  const pathname = usePathname();

  if (pathname === "/login") {
    return null;
  }

  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed bottom-0 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 border-t border-slate-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-8px_28px_rgba(15,23,42,0.08)] backdrop-blur"
    >
      <ul className="grid grid-cols-5">
        {tabs.map((tab) => {
          const active = isActivePath(pathname, tab.href);
          const Icon = tab.icon;

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-bold transition ${
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                }`}
              >
                <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
