import type { TaskItem } from "../types";
export type TaskIssue = {
  index: number;
  code: "not-object" | "name-missing" | "name-empty" | "prompt-missing" | "prompt-empty" | "name-reserved" | "name-collision";
  field?: "name" | "prompt";
  name?: string;
  otherIndex?: number;
};
export type TaskValidationResult = { fatal: "not-array" } | { tasks: TaskItem[]; issues: TaskIssue[]; total: number };
export declare const validateTasks: (raw: unknown) => TaskValidationResult;
