import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

interface EnvMap {
  [key: string]: string | undefined;
}

interface E2EUser {
  id: string;
  email: string;
  password: string;
}

interface E2EVehicle {
  id: string;
  label: string;
}

interface E2EReservationSeed {
  partnerId: string;
  partnerName: string;
  bayId: string;
  taskCode: string;
  taskTitle: string;
}

function readDotEnvLocal(): EnvMap {
  try {
    const content = readFileSync(".env.local", "utf8");

    return Object.fromEntries(
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const separatorIndex = line.indexOf("=");
          return separatorIndex === -1
            ? [line, ""]
            : [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
        }),
    );
  } catch {
    return {};
  }
}

export function getE2EEnv(): EnvMap {
  return {
    ...readDotEnvLocal(),
    ...process.env,
  };
}

export function getAdminSupabaseForE2E(): SupabaseClient | null {
  const env = getE2EEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getE2ECredentials() {
  const env = getE2EEnv();

  return {
    email: env.PITNOW_E2E_USER_EMAIL ?? "pitnow-e2e-ui@example.com",
    password: env.PITNOW_E2E_USER_PASSWORD ?? "PitnowE2e!2026",
  };
}

export async function ensureE2EUser(
  db: SupabaseClient,
): Promise<E2EUser> {
  const { email, password } = getE2ECredentials();
  let page = 1;
  let userId: string | null = null;

  while (!userId) {
    const { data, error } = await db.auth.admin.listUsers({
      page,
      perPage: 100,
    });

    if (error) {
      throw error;
    }

    const found = data.users.find((user) => user.email === email);

    if (found) {
      userId = found.id;
      break;
    }

    if (data.users.length < 100) {
      break;
    }

    page += 1;
  }

  if (!userId) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw error ?? new Error("Failed to create E2E auth user");
    }

    userId = data.user.id;
  } else {
    const { error } = await db.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });

    if (error) {
      throw error;
    }
  }

  return {
    id: userId,
    email,
    password,
  };
}

export async function ensureE2EVehicle(params: {
  db: SupabaseClient;
  userId: string;
}): Promise<E2EVehicle> {
  const plateNumber = "E2E 2026";
  const model = "PitNow E2E";
  const year = 2026;
  const typeLabel = "테스트";

  await params.db
    .from("vehicles")
    .update({ is_active: false })
    .eq("user_id", params.userId);

  const { data: existing, error: lookupError } = await params.db
    .from("vehicles")
    .select("id, plate_number, model, year")
    .eq("user_id", params.userId)
    .eq("plate_number", plateNumber)
    .maybeSingle<{
      id: string;
      plate_number: string;
      model: string;
      year: number;
    }>();

  if (lookupError) {
    throw lookupError;
  }

  if (existing) {
    const { data, error } = await params.db
      .from("vehicles")
      .update({
        model,
        year,
        type_label: typeLabel,
        is_active: true,
      })
      .eq("id", existing.id)
      .select("id, plate_number, model, year")
      .single<{
        id: string;
        plate_number: string;
        model: string;
        year: number;
      }>();

    if (error || !data) {
      throw error ?? new Error("Failed to update E2E vehicle");
    }

    return {
      id: data.id,
      label: `${data.model} (${data.year}) · ${data.plate_number}`,
    };
  }

  const { data, error } = await params.db
    .from("vehicles")
    .insert({
      user_id: params.userId,
      plate_number: plateNumber,
      model,
      year,
      type_label: typeLabel,
      is_active: true,
    })
    .select("id, plate_number, model, year")
    .single<{
      id: string;
      plate_number: string;
      model: string;
      year: number;
    }>();

  if (error || !data) {
    throw error ?? new Error("Failed to insert E2E vehicle");
  }

  return {
    id: data.id,
    label: `${data.model} (${data.year}) · ${data.plate_number}`,
  };
}

export async function getSelfReservationSeed(
  db: SupabaseClient,
): Promise<E2EReservationSeed> {
  const { data: partners, error: partnerError } = await db
    .from("partners")
    .select("id, name, hourly_price")
    .gt("hourly_price", 0)
    .order("name", { ascending: true })
    .returns<Array<{ id: string; name: string; hourly_price: number | string }>>();

  if (partnerError) {
    throw partnerError;
  }

  for (const partner of partners ?? []) {
    const { data: bay, error: bayError } = await db
      .from("bays")
      .select("id")
      .eq("partner_id", partner.id)
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (bayError) {
      throw bayError;
    }

    if (bay) {
      const { data: task, error: taskError } = await db
        .from("self_maintenance_tasks")
        .select("code, name")
        .eq("is_legal", true)
        .eq("is_active", true)
        .eq("code", "engine-oil")
        .limit(1)
        .maybeSingle<{ code: string; name: string | null }>();

      if (taskError) {
        throw taskError;
      }

      if (task) {
        return {
          partnerId: partner.id,
          partnerName: partner.name,
          bayId: bay.id,
          taskCode: task.code,
          taskTitle: task.name ?? task.code,
        };
      }
    }
  }

  throw new Error("No active self reservation seed data found");
}

export function getFutureReservationWindow() {
  const start = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  start.setUTCMinutes(0, 0, 0);
  start.setUTCHours(1);

  const end = new Date(start.getTime() + 60 * 60 * 1000);

  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

export async function cancelPaymentForE2E(params: {
  db: SupabaseClient;
  paymentId: string;
}) {
  const { error } = await params.db
    .from("payments")
    .update({
      status: "CANCELLED",
      failure_code: "UI_E2E_CLEANUP",
      failure_message: "UI E2E payment prepare smoke cleanup.",
      updated_at: new Date().toISOString(),
      metadata: {
        cleanup: {
          reason: "UI_E2E_CLEANUP",
        },
      },
    })
    .eq("id", params.paymentId)
    .eq("status", "READY");

  if (error) {
    throw error;
  }
}

export async function cleanupConfirmedReservationForE2E(params: {
  db: SupabaseClient;
  reservationId: string;
}) {
  const now = new Date().toISOString();

  const { error: paymentError } = await params.db
    .from("payments")
    .update({
      status: "REFUNDED",
      refunded_at: now,
      updated_at: now,
      failure_code: "UI_E2E_CLEANUP",
      failure_message: "UI E2E confirmed reservation cleanup.",
      metadata: {
        cleanup: {
          reason: "UI_E2E_CLEANUP",
        },
      },
    })
    .eq("reservation_id", params.reservationId)
    .in("status", ["RESERVATION_CONFIRMED", "APPROVED", "READY"]);

  if (paymentError) {
    throw paymentError;
  }

  const { error: reservationError } = await params.db
    .from("reservations")
    .update({
      status: "CANCELLED",
    })
    .eq("id", params.reservationId)
    .in("status", ["CONFIRMED", "CHECKED_IN", "IN_USE"]);

  if (reservationError) {
    throw reservationError;
  }

  const { error: checkinError } = await params.db
    .from("checkins")
    .delete()
    .eq("reservation_id", params.reservationId);

  if (checkinError) {
    throw checkinError;
  }
}
