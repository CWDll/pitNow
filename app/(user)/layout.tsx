import type { ReactNode } from "react";

import BottomNav from "./_components/bottom-nav";

interface UserLayoutProps {
  children: ReactNode;
}

export default function UserLayout({ children }: UserLayoutProps) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[430px] bg-zinc-50">
      <main className="min-h-dvh px-4 pb-20 pt-6">{children}</main>
      <BottomNav />
    </div>
  );
}
