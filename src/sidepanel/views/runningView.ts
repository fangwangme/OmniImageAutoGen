import type { PanelState } from "../state.js";
import type { StageId } from "../../types.js";
import { formatDuration, remainingTime } from "../remainingTime.js";
import { toSafeTaskFilename } from "../../utils/taskQueue.js";
import { targetExtLabel } from "../../utils/imageFormat.js";
import { escapeHtml as e, icon, logo, badge, translator } from "./shared.js";
import { runTiles } from "./tiles.js";
import { renderLogCard } from "./logCard.js";

export function renderRunningView(state: PanelState) {
  const t = translator(state), run = state.run;
  const done = run.savedCount + run.skippedCount + run.failedCount;
  const filename = toSafeTaskFilename(run.taskQueue[run.currentIndex]?.name || "image.png");
  const elapsed = Math.max(0, (run.endTime || Date.now()) - run.startTime), remaining = remainingTime(run);
  const stages = (["open-session", "image-mode", "send-prompt", "generate", "download", "save"] as StageId[]).map(id => {
    const stage = run.stages[id], complete = ["done", "reused", "skipped"].includes(stage.status);
    let label = t(`ui.stage.${id}`);
    if (id === "image-mode" && run.platform === "gemini") label += ` · ${state.aspectRatio}`;
    if (id === "save") label = t("ui.stage.save", { format: targetExtLabel(filename) });
    let meta = stage.status === "todo" ? "—" : stage.status === "reused" || stage.status === "skipped" ? t(`ui.${stage.status}`) : stage.meta || (stage.startedAt ? `${Math.floor(((stage.endedAt || Date.now()) - stage.startedAt) / 1000)}s` : "—");
    if (id === "image-mode" && stage.meta === "skipped") meta = t("ui.skipped");
    return `<li class="stage ${complete ? "done" : stage.status}"${id === "download" && run.platform === "chatgpt" ? ` title="${e(t("ui.downloadChain"))}"` : ""}><span class="stage-mark">${complete ? icon("check", 9) : ""}</span><span class="stage-label">${e(label)}</span><span class="stage-meta">${e(meta)}</span></li>`;
  }).join("");
  const watching = run.stages.download.status === "active" || run.stages.save.status === "active";
  const watchSeconds = Math.max(0, Math.floor((Date.now() - (run.stages.download.startedAt || Date.now())) / 1000));
  const tilesLabel = t("ui.runTiles", { saved: run.savedCount, skipped: run.skippedCount, failed: run.failedCount, current: run.currentIndex + 1, waiting: Math.max(0, run.taskQueue.length - done - 1) });
  const sessionDisplay = (run.sessionPending ? run.homeUrl : run.sessionUrl).replace(/^https:\/\//, "");
  return `<header class="panel-header"><div class="topbar">${logo()}<span class="state-pill running"><span class="status-dot"></span>${e(t("ui.running"))}</span></div><div class="session-strip ${run.sessionPending ? "pending" : ""}">${badge(run.platform, "small")}${run.sessionPending ? "" : `<span class="faint">${icon("lock", 12)}</span>`}<span class="session-address">${e(sessionDisplay)}${run.sessionPending ? `<span class="faint"> · ${e(t("ui.linkPending"))}</span>` : ""}</span><button type="button" class="session-copy" data-action="copy-session" ${run.sessionPending ? "disabled" : ""} aria-label="${e(t("ui.copySession"))}">${icon("copy")}</button></div><div class="run-stat"><span class="run-numbers"><span class="big-number">${done}</span><span class="number-total">/ ${run.taskQueue.length}</span></span><span class="run-time"><span>${e(remaining === null ? "—" : t("ui.timeLeft", { time: formatDuration(remaining) }))}</span><span>${e(t("ui.elapsed", { time: formatDuration(elapsed) }))}</span></span></div>${runTiles(state, tilesLabel)}<div class="run-legend">${(["saved", "skipped", "failed"] as const).map(kind => `<span><i class="legend-chip ${kind}"></i>${e(t(`ui.${kind}Count`, { count: run[`${kind}Count`] }))}</span>`).join("")}</div></header><main class="running-main"><section class="card current-task" aria-label="${e(t("ui.currentTask"))}"><div class="task-heading"><span class="task-thumbnail">${icon("download", 18)}</span><div class="task-details"><button type="button" class="filename-button" data-action="copy-filename" title="${e(t("ui.copyFilename"))}">${e(filename)}</button><span class="muted">${e(t("ui.attempt", { task: run.currentIndex + 1, attempt: run.attempt, max: run.maxRetries + 1 }))}</span>${run.attempt > 1 ? `<span class="retry-badge">${e(t(run.currentTaskMode === "download-only" ? "ui.retryDownload" : "ui.retrying"))}</span>` : ""}</div></div><ol class="stages">${stages}</ol>${watching ? `<div class="download-watch"><div class="watch-label"><span>${e(t("ui.watching", { folder: state.folderStatus.source.name || "Downloads" }))}</span><span class="mono">${watchSeconds}s / ${run.downloadTimeout}s</span></div><div class="watch-track"><div class="watch-progress" style="width:${Math.min(100, watchSeconds / run.downloadTimeout * 100)}%"></div></div></div>` : ""}</section>${renderLogCard(state)}</main><footer class="panel-footer"><button type="button" class="stop-button" data-action="stop"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>${e(t("ui.stop"))}</button></footer>`;
}
