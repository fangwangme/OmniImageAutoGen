import type { RunState } from "./state.js";
export function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}m`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${seconds}s`;
}
export function remainingTime(run: RunState, now = Date.now()): number | null {
  const done = run.savedCount + run.skippedCount + run.failedCount;
  if (!done || !run.startTime) return null;
  return Math.max(0, ((run.endTime || now) - run.startTime) / done * (run.taskQueue.length - done));
}
