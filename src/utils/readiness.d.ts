import type { PlatformId, SessionMode, TaskItem } from "../types";
import type { SessionValidation } from "./platforms.js";
import type { TaskIssue } from "./taskValidation.js";
export type ReadinessIssue = "session" | "prompts" | "source" | "output";
export type FolderStatus = { name?: string; state: "granted" | "prompt" | "denied" | "missing" };
export type ReadinessInput = {
  platform: PlatformId;
  sessionMode: SessionMode;
  sessionValidation?: SessionValidation;
  tasksState: { hasFile: boolean; fatal?: string; tasks?: TaskItem[]; issues?: TaskIssue[] };
  folderStatus: { source: FolderStatus; output: FolderStatus };
};
export declare const computeReadiness: (input: ReadinessInput) => { ready: boolean; issues: ReadinessIssue[] };
