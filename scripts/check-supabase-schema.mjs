#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path) {
  try {
    const content = readFileSync(path, "utf8");

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const rawValue = trimmed.slice(index + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, "");

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local is optional for CI where env vars may already be injected.
  }
}

function assertEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다.`);
  }

  return value;
}

function formatPass(label) {
  console.log(`✓ ${label}`);
}

function formatFail(label, message) {
  console.error(`✗ ${label}: ${message}`);
}

function summarizePostgrestError(error) {
  return [error.code, error.message, error.details].filter(Boolean).join(" | ");
}

async function checkColumns({ db, label, table, columns }) {
  const { error } = await db.from(table).select(columns.join(",")).limit(0);

  if (error) {
    return {
      ok: false,
      label,
      message: summarizePostgrestError(error),
    };
  }

  return {
    ok: true,
    label,
  };
}

async function checkStorageBucket({ db, label, bucketId }) {
  const { data, error } = await db.storage.getBucket(bucketId);

  if (error || !data) {
    return {
      ok: false,
      label,
      message: error?.message ?? `${bucketId} bucket not found`,
    };
  }

  return {
    ok: true,
    label,
  };
}

async function checkRpc({ db, label, fn, args }) {
  const { error } = await db.rpc(fn, args);

  if (error) {
    return {
      ok: false,
      label,
      message: summarizePostgrestError(error),
    };
  }

  return {
    ok: true,
    label,
  };
}

const checks = [
  {
    label: "20260329 seed catalog: partners/bays/service package tables",
    table: "partners",
    columns: ["id", "name", "address", "hourly_price", "lat", "lng"],
  },
  {
    label: "20260329 seed catalog: bays",
    table: "bays",
    columns: [
      "id",
      "partner_id",
      "name",
      "is_active",
      "allowed_vehicle_types",
      "max_vehicle_weight_kg",
    ],
  },
  {
    label: "20260329 seed catalog: service_packages",
    table: "service_packages",
    columns: ["id", "code", "name", "duration_minutes", "is_active"],
  },
  {
    label: "20260329 seed catalog: partner_package_prices",
    table: "partner_package_prices",
    columns: ["id", "partner_id", "package_id", "labor_price", "is_active"],
  },
  {
    label: "20260329 self maintenance flow: self_maintenance_tasks",
    table: "self_maintenance_tasks",
    columns: [
      "id",
      "code",
      "name",
      "is_legal",
      "is_active",
      "helper_verify_unit_fee",
      "difficulty",
      "description",
      "sort_order",
    ],
  },
  {
    label: "20260730 self work check: check item catalog",
    table: "self_task_check_items",
    columns: [
      "id",
      "task_id",
      "label",
      "sort_order",
      "version",
      "is_active",
    ],
  },
  {
    label: "20260730 self work check: partner settings",
    table: "partner_self_task_check_settings",
    columns: ["partner_id", "task_id", "is_enabled", "updated_at"],
  },
  {
    label: "20260730 self safety: content catalog",
    table: "self_safety_contents",
    columns: [
      "id",
      "code",
      "scope",
      "task_id",
      "content_type",
      "version",
      "is_required",
      "is_active",
    ],
  },
  {
    label: "20260730 self safety: user completions",
    table: "user_safety_training_completions",
    columns: ["user_id", "content_id", "content_version", "completed_at"],
  },
  {
    label: "20260329 self maintenance flow: reservation_tasks",
    table: "reservation_tasks",
    columns: [
      "id",
      "reservation_id",
      "task_id",
      "work_check_unit_fee_snapshot",
      "check_scope_snapshot",
    ],
  },
  {
    label: "20260329 self maintenance flow: self_task_agreements",
    table: "self_task_agreements",
    columns: [
      "id",
      "reservation_id",
      "agree_only_selected",
      "consent_method",
      "signature_image_url",
      "agreement_text",
      "agreement_version",
      "safety_content_snapshot",
    ],
  },
  {
    label: "20260730 self work check: reservation header",
    table: "reservation_work_checks",
    columns: [
      "id",
      "reservation_id",
      "partner_id",
      "status",
      "prepaid_fee",
      "summary_note",
      "recorded_by",
      "recorded_at",
    ],
  },
  {
    label: "20260730 self work check: item results",
    table: "reservation_work_check_results",
    columns: [
      "id",
      "work_check_id",
      "reservation_task_id",
      "check_item_id",
      "item_label_snapshot",
      "result",
      "note",
      "check_round",
    ],
  },
  {
    label: "20260611 vehicles: vehicles",
    table: "vehicles",
    columns: [
      "id",
      "user_id",
      "plate_number",
      "model",
      "year",
      "type_label",
      "vehicle_weight_kg",
      "is_active",
    ],
  },
  {
    label: "reservation latest columns",
    table: "reservations",
    columns: [
      "id",
      "user_id",
      "vehicle_id",
      "partner_id",
      "bay_id",
      "reservation_type",
      "package_id",
      "start_time",
      "end_time",
      "reserved_end_time",
      "blocked_until",
      "duration_minutes",
      "selected_task_count",
      "helper_verify_requested",
      "helper_verify_fee",
      "status",
      "total_price",
    ],
  },
  {
    label: "20260609 status logs",
    table: "reservation_status_logs",
    columns: [
      "id",
      "reservation_id",
      "from_status",
      "to_status",
      "actor_type",
      "actor_user_id",
      "reason",
      "metadata",
      "created_at",
    ],
  },
  {
    label: "20260609 photo evidence: checkins",
    table: "checkins",
    columns: [
      "id",
      "reservation_id",
      "front_img",
      "rear_img",
      "left_img",
      "right_img",
      "checked_in_at",
    ],
  },
  {
    label: "20260727 partner fixed check-in credentials",
    table: "partner_checkin_credentials",
    columns: [
      "partner_id",
      "qr_token",
      "manual_code",
      "is_active",
      "rotated_at",
      "created_at",
      "updated_at",
    ],
  },
  {
    label: "20260727 reservation arrival verification",
    table: "reservation_checkin_verifications",
    columns: [
      "reservation_id",
      "partner_id",
      "method",
      "verified_by",
      "verified_at",
    ],
  },
  {
    label: "20260609/20260620 checkout settlement columns",
    table: "checkouts",
    columns: [
      "id",
      "reservation_id",
      "base_price",
      "extra_fee",
      "helper_verify_requested",
      "helper_verify_fee",
      "total_settlement",
      "tool_check_completed",
      "cleaning_completed",
      "waste_disposal_completed",
      "checkout_photo_1",
      "checkout_photo_2",
      "completed_at",
    ],
  },
  {
    label: "20260611 payments foundation",
    table: "payments",
    columns: [
      "id",
      "user_id",
      "reservation_id",
      "checkout_id",
      "payment_purpose",
      "provider",
      "provider_payment_key",
      "provider_order_id",
      "method",
      "status",
      "amount",
      "currency",
      "reservation_snapshot",
      "failure_code",
      "failure_message",
      "metadata",
      "approved_at",
      "refunded_at",
      "created_at",
      "updated_at",
    ],
  },
  {
    label: "20260624 partner admin foundation: partner_admins",
    table: "partner_admins",
    columns: ["user_id", "partner_id", "role", "is_active", "created_at"],
  },
  {
    label: "20260624 partner admin foundation: availability blocks",
    table: "partner_availability_blocks",
    columns: [
      "id",
      "partner_id",
      "bay_id",
      "starts_at",
      "ends_at",
      "reason",
      "is_active",
      "created_by",
      "created_at",
      "updated_at",
    ],
  },
  {
    label: "20260626 partner reservation notes",
    table: "partner_reservation_notes",
    columns: [
      "id",
      "reservation_id",
      "partner_id",
      "author_user_id",
      "note_type",
      "body",
      "is_resolved",
      "resolved_at",
      "resolved_by",
      "created_at",
      "updated_at",
    ],
  },
  {
    label: "20260629 partner admin audit logs",
    table: "partner_admin_audit_logs",
    columns: [
      "id",
      "partner_id",
      "actor_user_id",
      "action",
      "target_type",
      "target_id",
      "reservation_id",
      "before_state",
      "after_state",
      "metadata",
      "created_at",
    ],
  },
  {
    label: "20260703 admin package audit logs",
    table: "admin_package_audit_logs",
    columns: [
      "id",
      "partner_id",
      "package_id",
      "price_id",
      "action",
      "before_state",
      "after_state",
      "created_at",
    ],
  },
  {
    label: "20260703 partner package change requests",
    table: "partner_package_change_requests",
    columns: [
      "id",
      "partner_id",
      "package_id",
      "price_id",
      "current_labor_price",
      "requested_labor_price",
      "reason",
      "status",
      "requested_by",
      "reviewed_at",
      "review_note",
      "created_at",
      "updated_at",
    ],
  },
  {
    label: "20260722 partner package creation requests",
    table: "partner_package_creation_requests",
    columns: [
      "id",
      "partner_id",
      "requested_name",
      "requested_description",
      "requested_duration_minutes",
      "requested_labor_price",
      "reason",
      "status",
      "requested_by",
      "reviewed_at",
      "review_note",
      "created_at",
      "updated_at",
    ],
  },
  {
    label: "20260724 user profiles",
    table: "user_profiles",
    columns: [
      "user_id",
      "nickname",
      "full_name",
      "phone",
      "created_at",
      "updated_at",
    ],
  },
  {
    label: "20260724 partner images",
    table: "partner_images",
    columns: [
      "id",
      "partner_id",
      "storage_path",
      "sort_order",
      "is_cover",
      "created_by",
      "created_at",
    ],
  },
  {
    label: "20260724 review images",
    table: "review_images",
    columns: [
      "id",
      "review_id",
      "storage_path",
      "sort_order",
      "created_at",
    ],
  },
];

async function main() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));

  const supabaseUrl = assertEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = assertEnv("SUPABASE_SERVICE_ROLE_KEY");
  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const results = [];

  for (const check of checks) {
    results.push(await checkColumns({ db, ...check }));
  }

  results.push(
    await checkStorageBucket({
      db,
      label: "20260609/20260621 storage bucket: reservation-photos",
      bucketId: "reservation-photos",
    }),
  );
  results.push(
    await checkStorageBucket({
      db,
      label: "20260724 storage bucket: partner-images",
      bucketId: "partner-images",
    }),
  );
  results.push(
    await checkStorageBucket({
      db,
      label: "20260724 storage bucket: review-images",
      bucketId: "review-images",
    }),
  );
  results.push(
    await checkRpc({
      db,
      label: "20260629 partner admin audit search rpc",
      fn: "admin_search_partner_admin_audit_logs",
      args: {
        p_action: null,
        p_created_after: null,
        p_limit: 1,
        p_offset: 0,
        p_partner_id: null,
        p_query: "__pitnow_schema_check_no_match__",
        p_target_type: null,
      },
    }),
  );

  let failedCount = 0;

  for (const result of results) {
    if (result.ok) {
      formatPass(result.label);
    } else {
      failedCount += 1;
      formatFail(result.label, result.message);
    }
  }

  if (failedCount > 0) {
    throw new Error(`${failedCount} Supabase schema check(s) failed.`);
  }

  console.log("Supabase schema check passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
