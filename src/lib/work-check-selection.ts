import type { SelfMaintenanceCatalogItem } from "@/src/domain/self-maintenance";

export const WORK_CHECK_BASE_FEE = 5000;

export function getWorkCheckSelection(tasks: SelfMaintenanceCatalogItem[]): {
  eligibleTasks: SelfMaintenanceCatalogItem[];
  excludedTasks: SelfMaintenanceCatalogItem[];
  fee: number;
} {
  const eligibleTasks = tasks.filter(
    (task) => task.workCheckEnabled && task.checkItems.length > 0,
  );
  const eligibleIds = new Set(eligibleTasks.map((task) => task.id));
  const excludedTasks = tasks.filter((task) => !eligibleIds.has(task.id));

  return {
    eligibleTasks,
    excludedTasks,
    fee:
      eligibleTasks.length > 0
        ? WORK_CHECK_BASE_FEE +
          eligibleTasks.reduce(
            (sum, task) => sum + Math.max(0, task.workCheckUnitFee),
            0,
          )
        : 0,
  };
}
