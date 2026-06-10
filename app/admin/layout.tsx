import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { hasAdminAccess } from "@/src/lib/admin-auth";

const navItems = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/reservations", label: "Reservations" },
  { href: "/admin/settlement", label: "Settlement" },
  { href: "/admin/packages", label: "Packages" },
] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const canAccessAdmin = await hasAdminAccess();

  if (!canAccessAdmin) {
    redirect("/admin-login");
  }

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-dvh w-full min-w-[1024px] max-w-[1440px]">
        <aside className="w-64 border-r border-white/10 px-6 py-8">
          <Link href="/admin" className="block">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">
              PitNow
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              Admin
            </h1>
          </Link>

          <nav className="mt-10 space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-2xl px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-10 rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm text-cyan-50">
            Desktop only console. User mobile layout is intentionally not shared.
          </div>

          <Link
            href="/admin/logout"
            className="mt-4 block rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            Logout
          </Link>
        </aside>

        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
