import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { DashboardShell } from "@/app/_components/dashboard-shell";
import { hasAdminAccess } from "@/src/lib/admin-auth";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const canAccessAdmin = await hasAdminAccess();

  if (!canAccessAdmin) {
    redirect("/admin-login");
  }

  return <DashboardShell variant="admin">{children}</DashboardShell>;
}
