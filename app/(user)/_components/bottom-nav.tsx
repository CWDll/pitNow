"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface TabItem {
  href: string;
  label: string;
}

const tabs: TabItem[] = [
  { href: "/", label: "홈" },
  { href: "/guide", label: "가이드" },
  { href: "/reservation", label: "예약" },
  { href: "/my-car", label: "내 차" },
  { href: "/mypage", label: "마이" },
];

function isActivePath(currentPath: string, tabPath: string): boolean {
  if (tabPath === "/") {
    return currentPath === "/" || currentPath.startsWith("/partner/");
  }

  return currentPath === tabPath || currentPath.startsWith(`${tabPath}/`);
}

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 border-t border-zinc-200 bg-white">
      <ul className="grid grid-cols-5">
        {tabs.map((tab) => {
          const active = isActivePath(pathname, tab.href);

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={`flex h-16 items-center justify-center text-xs font-medium ${
                  active ? "text-black" : "text-zinc-400"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
