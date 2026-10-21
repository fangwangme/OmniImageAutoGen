import type { PanelState } from "../state.js";
import { toSafeTaskFilename } from "../../utils/taskQueue.js";
import { escapeHtml } from "./shared.js";

export function setupTiles(state: PanelState, label: string) {
  const bad = new Set(state.tasksState.issues.flatMap(issue => issue.otherIndex ? [issue.index, issue.otherIndex] : [issue.index]));
  const hasIssues = bad.size > 0;
  const tiles = Array.from({ length: state.tasksState.total }, (_, index) => {
    const item = state.loadedTasksRaw[index] as { name?: unknown } | undefined;
    const saved = typeof item?.name === "string" && state.existingFiles.has(toSafeTaskFilename(item.name).toLowerCase());
    const status = bad.has(index + 1) ? "invalid" : !hasIssues && saved ? "saved" : "waiting";
    return `<span class="tile ${status}" title="#${index + 1}"></span>`;
  }).join("");
  return `<div class="tiles setup-tiles" role="img" aria-label="${escapeHtml(label)}">${tiles}</div>`;
}
export function runTiles(state: PanelState, label: string) {
  const run = state.run;
  return `<div class="tiles run-tiles ${state.view === "finished" ? "finished-tiles" : ""}" role="img" aria-label="${escapeHtml(label)}">${run.taskQueue.map((task, index) => {
    const result = run.results.get(index);
    const status = result?.outcome === "saved" ? "saved" : result?.outcome === "failed" ? "failed" : result ? "skipped" : run.isRunning && index === run.currentIndex ? "current" : "waiting";
    return `<span class="tile ${status}" title="${escapeHtml(toSafeTaskFilename(task.name))}"></span>`;
  }).join("")}</div>`;
}
