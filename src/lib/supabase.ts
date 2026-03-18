import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key";

export const hasSupabaseEnv =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const missingSupabaseEnvMessage =
  "Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)가 설정되지 않았습니다.";

if (!hasSupabaseEnv && process.env.NODE_ENV !== "production") {
  console.warn(
    "Supabase env vars are missing. Using placeholder values until NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are configured.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function getSupabaseEnvErrorResponse() {
  return {
    success: false as const,
    error: {
      code: "SUPABASE_ENV_MISSING",
      message: missingSupabaseEnvMessage,
    },
  };
}
