import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  SelfMaintenanceCatalog,
  SelfMaintenanceCatalogItem,
  SelfSafetyContent,
  SelfTaskCheckItem,
  SelfTaskDifficulty,
} from "@/src/domain/self-maintenance";

interface TaskRow {
  id: string;
  code: string;
  name: string;
  difficulty: SelfTaskDifficulty;
  description: string;
  sort_order: number;
  helper_verify_unit_fee: number | string;
}

interface CheckItemRow {
  id: string;
  task_id: string;
  label: string;
  sort_order: number;
  version: number;
}

interface SettingRow {
  task_id: string;
  is_enabled: boolean;
}

interface SafetyContentRow {
  id: string;
  code: string;
  scope: "COMMON" | "TASK";
  task_id: string | null;
  content_type: "CARD" | "VIDEO";
  title: string;
  body: string;
  media_url: string | null;
  version: number;
  sort_order: number;
  is_required: boolean;
}

function toNumber(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapSafetyContent(row: SafetyContentRow): SelfSafetyContent {
  return {
    id: row.id,
    code: row.code,
    contentType: row.content_type,
    title: row.title,
    body: row.body,
    mediaUrl: row.media_url,
    version: row.version,
    sortOrder: row.sort_order,
    isRequired: row.is_required,
  };
}

export async function getSelfMaintenanceCatalog(params: {
  db: SupabaseClient;
  partnerId: string;
}): Promise<SelfMaintenanceCatalog> {
  const { db, partnerId } = params;
  const [tasksResult, checkItemsResult, settingsResult, safetyResult] =
    await Promise.all([
      db
        .from("self_maintenance_tasks")
        .select(
          "id,code,name,difficulty,description,sort_order,helper_verify_unit_fee",
        )
        .eq("is_legal", true)
        .eq("is_active", true)
        .order("sort_order")
        .returns<TaskRow[]>(),
      db
        .from("self_task_check_items")
        .select("id,task_id,label,sort_order,version")
        .eq("is_active", true)
        .order("sort_order")
        .returns<CheckItemRow[]>(),
      db
        .from("partner_self_task_check_settings")
        .select("task_id,is_enabled")
        .eq("partner_id", partnerId)
        .returns<SettingRow[]>(),
      db
        .from("self_safety_contents")
        .select(
          "id,code,scope,task_id,content_type,title,body,media_url,version,sort_order,is_required",
        )
        .eq("is_active", true)
        .order("sort_order")
        .returns<SafetyContentRow[]>(),
    ]);

  const error =
    tasksResult.error ??
    checkItemsResult.error ??
    settingsResult.error ??
    safetyResult.error;

  if (error) {
    throw error;
  }

  const checkItemsByTask = new Map<string, SelfTaskCheckItem[]>();
  for (const row of checkItemsResult.data ?? []) {
    const items = checkItemsByTask.get(row.task_id) ?? [];
    items.push({
      id: row.id,
      label: row.label,
      sortOrder: row.sort_order,
      version: row.version,
    });
    checkItemsByTask.set(row.task_id, items);
  }

  const workCheckEnabledByTask = new Map(
    (settingsResult.data ?? []).map((row) => [row.task_id, row.is_enabled]),
  );
  const safetyByTask = new Map<string, SelfSafetyContent[]>();
  const commonSafetyContents: SelfSafetyContent[] = [];

  for (const row of safetyResult.data ?? []) {
    const content = mapSafetyContent(row);
    if (row.scope === "COMMON" || !row.task_id) {
      commonSafetyContents.push(content);
      continue;
    }

    const contents = safetyByTask.get(row.task_id) ?? [];
    contents.push(content);
    safetyByTask.set(row.task_id, contents);
  }

  const tasks: SelfMaintenanceCatalogItem[] = (tasksResult.data ?? []).map(
    (row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      difficulty: row.difficulty,
      description: row.description,
      sortOrder: row.sort_order,
      workCheckUnitFee: toNumber(row.helper_verify_unit_fee),
      workCheckEnabled: workCheckEnabledByTask.get(row.id) === true,
      checkItems: checkItemsByTask.get(row.id) ?? [],
      safetyContents: safetyByTask.get(row.id) ?? [],
    }),
  );

  return {
    tasks,
    commonSafetyContents,
  };
}
