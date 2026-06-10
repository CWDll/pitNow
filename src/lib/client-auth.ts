import { supabase } from "@/src/lib/supabase";

export function getCurrentPathWithSearch(): string {
  return `${window.location.pathname}${window.location.search}`;
}

export function redirectToLogin(nextPath = getCurrentPathWithSearch()): void {
  const query = new URLSearchParams({ next: nextPath });
  window.location.href = `/login?${query.toString()}`;
}

export async function requireClientSession(): Promise<boolean> {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    redirectToLogin();
    return false;
  }

  return true;
}
