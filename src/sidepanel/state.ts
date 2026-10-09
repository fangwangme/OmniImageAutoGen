import type { AspectRatio, PlatformId, SessionMode, StageId, StageStatus, TaskItem, TaskOutcome } from "../types.js";
import type { Language } from "../i18n.js";
import type { FolderStatus } from "../utils/readiness.js";
import type { TaskIssue } from "../utils/taskValidation.js";
import type { TaskErrorType, TaskRunMode } from "./panelTypes.js";

export type StageState = { status: StageStatus; startedAt?: number; endedAt?: number; meta?: string };
export type LogEntry = { time: string; level: "info" | "ok" | "warn" | "error"; message: string; verbose: boolean; data?: unknown; timestamp: string };
export type RunState = {
  taskQueue: TaskItem[]; currentIndex: number; isRunning: boolean;
  platform: PlatformId; sessionMode: SessionMode; sessionUrl: string; sessionPending: boolean; homeUrl: string;
  currentTabId: number | null; startTime: number; endTime: number;
  retryCounts: Map<string, number>;
  results: Map<number, { outcome: TaskOutcome; error?: string; errorType?: TaskErrorType; warningExcerpt?: string; retries?: number }>;
  stages: Record<StageId, StageState>; attempt: number; currentTaskMode: TaskRunMode; nextTaskMode: TaskRunMode;
  outcome: "running" | "finished" | "stopped" | "halted"; haltReason?: string; haltErrorType?: TaskErrorType;
  savedCount: number; skippedCount: number; failedCount: number; consecutiveFailureCount: number;
  maxRetries: number; maxConsecutiveFailures: number; downloadTimeout: number; activeTaskRunSeq: number;
};
export type PanelState = {
  view: "setup" | "running" | "finished"; language: Language;
  loadedTasksRaw: unknown[]; loadedTasks: TaskItem[]; loadedTasksFileName: string;
  tasksState: { hasFile: boolean; tasks: TaskItem[]; issues: TaskIssue[]; fatal?: string; total: number };
  platform: PlatformId; sessionMode: SessionMode; sessionUrls: Record<PlatformId, string>; activeTabUrl: string;
  folderStatus: { source: FolderStatus; output: FolderStatus }; aspectRatio: AspectRatio; existingFiles: Set<string>;
  logCollapsed: boolean; logs: LogEntry[]; logFilter: "all" | "issues"; run: RunState;
  starting: boolean; setupMessage?: string;
};
export type PanelStore = {
  state: PanelState; render: () => void; subscribe: (listener: () => void) => () => void;
  addLog: (level: LogEntry["level"], message: string, options?: { verbose?: boolean; data?: unknown; timestamp?: string }) => void;
};
export const emptyStages = (): Record<StageId, StageState> => ({
  "open-session": { status: "todo" }, "image-mode": { status: "todo" }, "send-prompt": { status: "todo" },
  generate: { status: "todo" }, download: { status: "todo" }, save: { status: "todo" }
});
export function createRunState(platform: PlatformId = "gemini", sessionMode: SessionMode = "new"): RunState {
  return { taskQueue: [], currentIndex: 0, isRunning: false, platform, sessionMode, sessionUrl: "", sessionPending: sessionMode === "new", homeUrl: "", currentTabId: null,
    startTime: 0, endTime: 0, retryCounts: new Map(), results: new Map(), stages: emptyStages(), attempt: 1, currentTaskMode: "full", nextTaskMode: "full", outcome: "running",
    savedCount: 0, skippedCount: 0, failedCount: 0, consecutiveFailureCount: 0, maxRetries: 3, maxConsecutiveFailures: 5, downloadTimeout: 120, activeTaskRunSeq: 0 };
}
export function createPanelStore(): PanelStore {
  const state: PanelState = { view: "setup", language: "en", loadedTasksRaw: [], loadedTasks: [], loadedTasksFileName: "", tasksState: { hasFile: false, tasks: [], issues: [], total: 0 },
    platform: "gemini", sessionMode: "new", sessionUrls: { chatgpt: "", gemini: "" }, activeTabUrl: "", folderStatus: { source: { state: "missing" }, output: { state: "missing" } },
    aspectRatio: "16:9", existingFiles: new Set(), logCollapsed: true, logs: [], logFilter: "all", run: createRunState(), starting: false };
  const listeners = new Set<() => void>();
  const render = () => listeners.forEach(listener => listener());
  return { state, render, subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    addLog(level, message, options = {}) {
      const date = options.timestamp ? new Date(options.timestamp) : new Date();
      const validDate = Number.isNaN(date.getTime()) ? new Date() : date;
      const time = validDate.toLocaleTimeString("en-GB", { hour12: false });
      state.logs.push({ time, level, message, verbose: options.verbose ?? false, data: options.data, timestamp: validDate.toISOString() });
      if (state.logs.length > 2000) state.logs.splice(0, state.logs.length - 2000);
      render();
    }
  };
}
