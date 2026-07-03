import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { hasAdminAccess } from "@/src/lib/admin-auth";

const navItems = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/reservations", label: "Reservations" },
  { href: "/admin/settlement", label: "Settlement" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/partner-audit", label: "Partner Audit" },
  { href: "/admin/packages", label: "Packages" },
] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const canAccessAdmin = await hasAdminAccess();

  if (!canAccessAdmin) {
    redirect("/admin-login");
  }

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-950">
      <div className="mx-auto flex min-h-dvh w-full min-w-[1024px] max-w-[1440px]">
        <aside className="w-64 border-r border-slate-200 bg-white px-6 py-8">
          <Link href="/admin" className="block">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-700">
              PitNow
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Admin
            </h1>
          </Link>

          <nav className="mt-10 space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-2xl px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-10 rounded-3xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-900">
            Desktop only console. User mobile layout is intentionally not shared.
          </div>

          <Link
            href="/admin/logout"
            prefetch={false}
            className="mt-4 block rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
          >
            Logout
          </Link>
        </aside>

        <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
