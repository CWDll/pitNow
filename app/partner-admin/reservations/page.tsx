import { PartnerAdminDashboard } from "../_components/partner-admin-dashboard";

export default async function PartnerAdminReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  return <PartnerAdminDashboard view="reservations" initialDate={date} />;
}
