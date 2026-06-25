import type { ReactNode } from "react";

export default function PartnerAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-zinc-100 text-zinc-950">
      <div className="mx-auto min-h-dvh w-full max-w-6xl px-5 py-6">
        {children}
      </div>
    </main>
  );
}
