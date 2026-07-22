import type { ReactNode } from "react";

import { DashboardShell } from "@/app/_components/dashboard-shell";

export default function PartnerAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <DashboardShell variant="partner">{children}</DashboardShell>;
}
