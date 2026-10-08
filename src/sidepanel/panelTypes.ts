import type { StageId, StageStatus } from "../types.js";
export type TaskErrorType = "generation" | "download" | "folder" | "locked-url";
export type TaskRunMode = "full" | "download-only";
type Scope = { taskIndex?: number; taskRunSeq?: number };
export type PanelMessage = Scope & (
  | { action: "TASK_COMPLETE"; skipped?: boolean; skipReason?: "exists" | "warning"; warningExcerpt?: string }
  | { action: "TASK_ERROR"; error: string; errorType?: TaskErrorType }
  | { action: "TASK_STAGE"; stage: StageId; status: StageStatus; meta?: string }
  | { action: "UPDATE_STATUS"; status: string; isError?: boolean }
  | { action: "PANEL_LOG"; level: "info" | "ok" | "log" | "warn" | "error"; message: string; data?: unknown; source?: string; timestamp?: string; event?: boolean; verbose?: boolean }
);
export type ListFilesResponse = { files?: string[]; error?: string; errorType?: TaskErrorType };
