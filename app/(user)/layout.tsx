import type { ReactNode } from "react";

import BottomNav from "./_components/bottom-nav";

interface UserLayoutProps {
  children: ReactNode;
}

export default function UserLayout({ children }: UserLayoutProps) {
  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-[430px] overflow-x-hidden bg-slate-50 text-slate-950 shadow-[0_0_40px_rgba(15,23,42,0.08)] sm:ring-1 sm:ring-slate-200">
      <main className="min-h-dvh px-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
