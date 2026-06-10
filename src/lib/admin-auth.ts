import { cookies } from "next/headers";

export const ADMIN_ACCESS_COOKIE = "pitnow_admin_access";

export function hasConfiguredAdminToken(): boolean {
  return Boolean(process.env.PITNOW_ADMIN_ACCESS_TOKEN);
}

export function isValidAdminToken(token: string): boolean {
  const configuredToken = process.env.PITNOW_ADMIN_ACCESS_TOKEN;
  return Boolean(configuredToken) && token === configuredToken;
}

export async function hasAdminAccess(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_ACCESS_COOKIE)?.value;

  if (!token) {
    return false;
  }

  return isValidAdminToken(token);
}
