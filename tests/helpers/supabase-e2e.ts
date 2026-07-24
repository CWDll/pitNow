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

interface E2ECredentials {
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

export function getE2ECredentials(
  overrides: Partial<E2ECredentials> = {},
): E2ECredentials {
  const env = getE2EEnv();

  return {
    email:
      overrides.email ??
      env.PITNOW_E2E_USER_EMAIL ??
      "pitnow-e2e-ui@example.com",
    password:
      overrides.password ?? env.PITNOW_E2E_USER_PASSWORD ?? "PitnowE2e!2026",
  };
}

export async function signInE2EUserForE2E(
  credentials = getE2ECredentials(),
): Promise<string> {
  const env = getE2EEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase anon env is required to sign in E2E user");
  }

  const client = createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });

  if (error || !data.session?.access_token) {
    throw error ?? new Error("Failed to sign in E2E user");
  }

  return data.session.access_token;
}

export async function ensureE2EUser(
  db: SupabaseClient,
  credentials = getE2ECredentials(),
): Promise<E2EUser> {
  const { email, password } = credentials;
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
  const typeLabel = "세단";
  const vehicleWeightKg = 1500;

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
        vehicle_weight_kg: vehicleWeightKg,
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
      vehicle_weight_kg: vehicleWeightKg,
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
  vehicle: { typeLabel: string; weightKg: number } = {
    typeLabel: "세단",
    weightKg: 1500,
  },
): Promise<E2EReservationSeed> {
  const { data: partners, error: partnerError } = await db
    .from("partners")
    .select("id, name, hourly_price")
    .gt("hourly_price", 0)
    .order("name", { ascending: true })
    .returns<
      Array<{ id: string; name: string; hourly_price: number | string }>
    >();

  if (partnerError) {
    throw partnerError;
  }

  for (const partner of partners ?? []) {
    const { data: bays, error: bayError } = await db
      .from("bays")
      .select("id,allowed_vehicle_types,max_vehicle_weight_kg")
      .eq("partner_id", partner.id)
      .eq("is_active", true)
      .returns<
        Array<{
          id: string;
          allowed_vehicle_types: string[];
          max_vehicle_weight_kg: number | null;
        }>
      >();

    if (bayError) {
      throw bayError;
    }

    const bay = (bays ?? []).find(
      (candidate) =>
        (candidate.allowed_vehicle_types.length === 0 ||
          candidate.allowed_vehicle_types.includes(vehicle.typeLabel)) &&
        (candidate.max_vehicle_weight_kg === null ||
          candidate.max_vehicle_weight_kg >= vehicle.weightKg),
    );

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
  const { data: reviewRows, error: reviewLookupError } = await params.db
    .from("reviews")
    .select("id")
    .eq("reservation_id", params.reservationId)
    .returns<Array<{ id: string }>>();

  if (reviewLookupError) {
    throw reviewLookupError;
  }

  const reviewIds = (reviewRows ?? []).map((review) => review.id);
  if (reviewIds.length > 0) {
    const { data: reviewImages, error: reviewImageLookupError } = await params.db
      .from("review_images")
      .select("storage_path")
      .in("review_id", reviewIds)
      .returns<Array<{ storage_path: string }>>();

    if (reviewImageLookupError) {
      throw reviewImageLookupError;
    }

    const storagePaths = (reviewImages ?? []).map(
      (image) => image.storage_path,
    );
    if (storagePaths.length > 0) {
      const { error: storageCleanupError } = await params.db.storage
        .from("review-images")
        .remove(storagePaths);

      if (storageCleanupError) {
        throw storageCleanupError;
      }
    }
  }

  const { error: reviewError } = await params.db
    .from("reviews")
    .delete()
    .eq("reservation_id", params.reservationId);

  if (reviewError) {
    throw reviewError;
  }

  const { error: paymentError } = await params.db
    .from("payments")
    .delete()
    .eq("reservation_id", params.reservationId);

  if (paymentError) {
    throw paymentError;
  }

  const { error: reservationError } = await params.db
    .from("reservations")
    .delete()
    .eq("id", params.reservationId);

  if (reservationError) {
    throw reservationError;
  }
}
