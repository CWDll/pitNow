import type { SelfMaintenanceCatalogItem } from "@/src/domain/self-maintenance";

export const WORK_CHECK_BASE_FEE = 5000;

export function getWorkCheckSelection(
  tasks: SelfMaintenanceCatalogItem[],
  selectedTaskIds?: Iterable<string>,
): {
  eligibleTasks: SelfMaintenanceCatalogItem[];
  selectedTasks: SelfMaintenanceCatalogItem[];
  excludedTasks: SelfMaintenanceCatalogItem[];
  fee: number;
} {
  const eligibleTasks = tasks.filter(
    (task) => task.workCheckEnabled && task.checkItems.length > 0,
  );
  const eligibleIds = new Set(eligibleTasks.map((task) => task.id));
  const excludedTasks = tasks.filter((task) => !eligibleIds.has(task.id));
  const requestedIds =
    selectedTaskIds === undefined ? eligibleIds : new Set(selectedTaskIds);
  const selectedTasks = eligibleTasks.filter((task) =>
    requestedIds.has(task.id),
  );

  return {
    eligibleTasks,
    selectedTasks,
    excludedTasks,
    fee:
      selectedTasks.length > 0
        ? WORK_CHECK_BASE_FEE +
          selectedTasks.reduce(
            (sum, task) => sum + Math.max(0, task.workCheckUnitFee),
            0,
          )
        : 0,
  };
}
