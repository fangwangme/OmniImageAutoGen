import type { AspectRatio, PlatformId, StageId, StageStatus, TaskItem } from "../types.js";
import { assertNotAborted } from "./dom.js";
export { toSafeTaskFilename } from "../utils/taskQueue.js";
export { isFolderAuthErrorMessage, resolveTaskErrorType } from "../utils/errorClassifier.js";

export type TaskErrorType = "generation" | "download" | "folder" | "locked-url";
export type TaskMode = "full" | "download-only";
export type TaskScopeIds = { taskIndex?: number; taskRunSeq?: number };
export type ContentSettings = {
  settings_generationTimeout?: number;
  settings_downloadTimeout?: number;
  settings_pageLoadTimeout?: number;
  settings_inputTimeout?: number;
  settings_stepDelay?: number;
  settings_pollInterval?: number;
  settings_inputPollInterval?: number;
  settings_sendPollInterval?: number;
  settings_generationPollInterval?: number;
  settings_aspectRatio?: AspectRatio;
};
export type TaskStorageContext = ContentSettings & {
  currentTask?: TaskItem;
  currentTaskMode?: string;
  currentTaskIndex?: number;
  currentTaskRunSeq?: number;
  currentTaskPlatform?: PlatformId;
  currentSessionUrl?: string;
  currentSessionPending?: boolean;
  currentHomeUrl?: string;
  currentTaskAttempt?: number;
};
export const TASK_CONTEXT_KEYS = [
  "currentTask", "currentTaskMode", "currentTaskIndex", "currentTaskRunSeq", "currentTaskPlatform", "currentSessionUrl", "currentSessionPending", "currentHomeUrl", "currentTaskAttempt",
  "settings_generationTimeout", "settings_downloadTimeout", "settings_pageLoadTimeout", "settings_inputTimeout", "settings_stepDelay", "settings_pollInterval", "settings_inputPollInterval", "settings_sendPollInterval", "settings_generationPollInterval", "settings_aspectRatio"
];
export type CheckFileExistsResponse = { exists: boolean; error?: string; errorType?: TaskErrorType };
export type DownloadArmResponse = { ok: boolean; armId?: string; error?: string; errorType?: TaskErrorType };
export type WaitAndSaveResponse = { success: boolean; filename?: string; error?: string; errorType?: TaskErrorType; cancelled?: boolean };
export type ContentMessage = TaskScopeIds & (
  | { action: "CHECK_FILE_EXISTS"; platform: PlatformId; filename: string }
  | { action: "DOWNLOAD_ARM"; platform: PlatformId; targetFilename: string }
  | { action: "WAIT_AND_SAVE"; armId: string }
  | { action: "TASK_STAGE"; stage: StageId; status: StageStatus; meta?: string }
  | { action: "TASK_COMPLETE"; skipped: boolean; skipReason?: "exists" | "warning"; warningExcerpt?: string }
  | { action: "TASK_ERROR"; error: string; errorType?: TaskErrorType }
  | { action: "UPDATE_STATUS"; status: string; isError?: boolean }
  | { action: "LOG"; level: "log" | "info" | "ok" | "warn" | "error"; message: string; data?: unknown; source?: string; event?: boolean; verbose?: boolean }
);

export const storageGet = <T,>(keys: string[]): Promise<T> => chrome.storage.local.get(keys) as unknown as Promise<T>;
export const runtimeSendMessage = <T,>(message: ContentMessage): Promise<T> => chrome.runtime.sendMessage(message) as unknown as Promise<T>;
export const toErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
export const normalizeTaskMode = (mode?: string): TaskMode => mode === "download-only" ? "download-only" : "full";
export class TaskError extends Error {
  constructor(message: string, public errorType: TaskErrorType) { super(message); }
}

export function createContentLogger(sendMessage: typeof runtimeSendMessage) {
  const log = (level: "log" | "info" | "warn" | "error", message: string, data: unknown, event: boolean) => {
    void sendMessage<void>({ action: "LOG", level, message, data, source: "content", event, verbose: !event }).catch(() => undefined);
  };
  return {
    logInfo: (message: string, data?: unknown) => log("log", message, data, false),
    logWarn: (message: string, data?: unknown) => log("warn", message, data, false),
    logError: (message: string, data?: unknown) => log("error", message, data, false),
    logEvent: (level: "info" | "warn" | "error", message: string) => log(level, message, undefined, true)
  };
}

export type ContentTaskScope = { signal: AbortSignal; assertCurrent: () => Promise<void>; dispose: () => void };
declare global {
  interface Window { __omniAutoGenContentController?: AbortController }
}

export function createContentTaskScope(context: TaskStorageContext): ContentTaskScope {
  window.__omniAutoGenContentController?.abort();
  const controller = new AbortController();
  window.__omniAutoGenContentController = controller;
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "local") return;
    if ((changes.currentTaskRunSeq && changes.currentTaskRunSeq.newValue !== context.currentTaskRunSeq) ||
        (changes.currentTaskIndex && changes.currentTaskIndex.newValue !== context.currentTaskIndex) ||
        (changes.currentTask && !changes.currentTask.newValue)) controller.abort();
  };
  chrome.storage.onChanged.addListener(listener);
  return {
    signal: controller.signal,
    async assertCurrent() {
      assertNotAborted(controller.signal);
      const current = await storageGet<TaskStorageContext>(["currentTask", "currentTaskIndex", "currentTaskRunSeq", "currentTaskPlatform"]);
      if (!current.currentTask || current.currentTaskIndex !== context.currentTaskIndex || current.currentTaskRunSeq !== context.currentTaskRunSeq || current.currentTaskPlatform !== context.currentTaskPlatform) controller.abort();
      assertNotAborted(controller.signal);
    },
    dispose() {
      chrome.storage.onChanged.removeListener(listener);
      if (window.__omniAutoGenContentController === controller) delete window.__omniAutoGenContentController;
    }
  };
}
