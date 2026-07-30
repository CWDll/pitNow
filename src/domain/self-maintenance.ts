export type SelfTaskDifficulty = "BEGINNER" | "INTERMEDIATE";

export type WorkCheckResult =
  | "NO_ISSUE"
  | "ISSUE_FOUND"
  | "UNABLE_TO_CHECK";

export interface SelfTaskCheckItem {
  id: string;
  label: string;
  sortOrder: number;
  version: number;
}

export interface SelfSafetyContent {
  id: string;
  code: string;
  contentType: "CARD" | "VIDEO";
  title: string;
  body: string;
  mediaUrl: string | null;
  version: number;
  sortOrder: number;
  isRequired: boolean;
}

export interface SelfMaintenanceCatalogItem {
  id: string;
  code: string;
  name: string;
  difficulty: SelfTaskDifficulty;
  description: string;
  sortOrder: number;
  workCheckUnitFee: number;
  workCheckEnabled: boolean;
  checkItems: SelfTaskCheckItem[];
  safetyContents: SelfSafetyContent[];
}

export interface SelfMaintenanceCatalog {
  tasks: SelfMaintenanceCatalogItem[];
  commonSafetyContents: SelfSafetyContent[];
}

export interface ReservationWorkCheckResultItem {
  id: string;
  reservationTaskId: string;
  taskCode: string;
  taskName: string;
  checkItemId: string | null;
  itemLabel: string;
  result: WorkCheckResult;
  note: string;
  checkRound: 1 | 2;
  sortOrder: number;
  createdAt: string;
}

export interface ReservationWorkCheck {
  id: string;
  status: "PENDING" | "RECORDED" | "NOT_PERFORMED";
  prepaidFee: number;
  summaryNote: string;
  recordedAt: string | null;
  results: ReservationWorkCheckResultItem[];
}
