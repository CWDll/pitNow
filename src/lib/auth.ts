import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createSupabaseClient, supabase, supabaseAdmin } from "@/src/lib/supabase";

const DEFAULT_DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

export interface RequestUserContext {
  userId: string;
  accessToken: string | null;
  client: SupabaseClient;
  source: "supabase" | "dev";
}

export interface AuthErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

function authError(status: number, code: string, message: string) {
  return NextResponse.json<AuthErrorBody>(
    {
      success: false,
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

export function getDevelopmentUserId(): string | null {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  if (process.env.PITNOW_DISABLE_DEV_AUTH_FALLBACK === "true") {
    return null;
  }

  return process.env.PITNOW_DEV_USER_ID ?? DEFAULT_DEV_USER_ID;
}

function getBearerToken(req: Request): string | null {
  const authorization = req.headers.get("authorization");

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token?.trim()) {
    return null;
  }

  return token.trim();
}

export async function requireRequestUser(
  req: Request,
): Promise<
  | { ok: true; auth: RequestUserContext }
  | { ok: false; response: NextResponse<AuthErrorBody> }
> {
  const accessToken = getBearerToken(req);

  if (accessToken) {
    const client = createSupabaseClient(accessToken);
    const { data, error } = await client.auth.getUser(accessToken);

    if (error || !data.user) {
      return {
        ok: false,
        response: authError(
          401,
          "INVALID_AUTH_TOKEN",
          "로그인 세션을 확인할 수 없습니다.",
        ),
      };
    }

    return {
      ok: true,
      auth: {
        userId: data.user.id,
        accessToken,
        client,
        source: "supabase",
      },
    };
  }

  const devUserId = getDevelopmentUserId();

  if (devUserId) {
    return {
      ok: true,
      auth: {
        userId: devUserId,
        accessToken: null,
        client: supabaseAdmin ?? supabase,
        source: "dev",
      },
    };
  }

  return {
    ok: false,
    response: authError(
      401,
      "AUTH_REQUIRED",
      "로그인이 필요한 요청입니다.",
    ),
  };
}
