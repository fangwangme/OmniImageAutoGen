import { createTranslator } from "../i18n.js";
import { isConversationUrl } from "../utils/platforms.js";
import { taskKey } from "../utils/outputPath.js";
import { toSafeTaskFilename } from "../utils/taskQueue.js";
import { decideTaskErrorOutcome } from "../utils/retryPolicy.js";
import { computeTaskWatchdogTimeoutMs, isWatchdogTimeoutError } from "../utils/watchdogPolicy.js";
import type { PanelMessage, TaskErrorType } from "./panelTypes.js";
import { createRunState, emptyStages } from "./state.js";
import type { PanelStore, RunState } from "./state.js";
import { startRun, openSession, secondsSetting, taskError } from "./startRun.js";
import { refreshSetup, restoreInitialState } from "./initState.js";
import { closeCurrentTabWithPlaceholder } from "./tabHelpers.js";
import { createSessionCapture } from "./sessionCapture.js";

export type TaskLifecycleState = RunState;
export function createTaskLifecycle(store: PanelStore) {
  let epoch = 0, lastSequence = Date.now(), handlingSequence: number | null = null;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let ticker: ReturnType<typeof setInterval> | undefined;
  let storageChain: Promise<void> = Promise.resolve();
  let disposed = false, resetting = false;
  const t = (key: string, vars?: Record<string, string | number>) => createTranslator(store.state.language)(key, vars);
  const currentRun = (run: RunState) => !disposed && store.state.run === run && run.isRunning;
  const currentTask = (run: RunState, sequence: number, index = run.currentIndex) => currentRun(run) && sequence === run.activeTaskRunSeq && index === run.currentIndex;
  const clearWatchdog = () => { if (watchdog !== undefined) clearTimeout(watchdog); watchdog = undefined; };
  const clearTicker = () => { if (ticker !== undefined) clearInterval(ticker); ticker = undefined; };
  const nextSequence = (run: RunState) => { lastSequence = Math.max(Date.now(), lastSequence + 1, run.activeTaskRunSeq + 1); run.activeTaskRunSeq = lastSequence; return lastSequence; };
  const persist = (items: Record<string, unknown>, current: () => boolean): Promise<void> => {
    storageChain = storageChain.catch(() => undefined).then(async () => { if (current()) await chrome.storage.local.set(items); });
    return storageChain;
  };
  const capture = createSessionCapture(store, persist);
  const cancelDownload = (reason: string) => chrome.runtime.sendMessage({ action: "DOWNLOAD_CANCEL", reason }).catch(() => undefined);
  async function invalidate(run: RunState, guard: () => boolean) {
    const sequence = nextSequence(run);
    await persist({ currentTaskRunSeq: sequence, currentTask: null }, guard);
  }
  async function withTimeout<T>(promise: Promise<T>, timeout: number, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeout); })]); }
    finally { if (timer !== undefined) clearTimeout(timer); }
  }
  async function endRun(run: RunState, outcome: "finished" | "stopped" | "halted", reason?: string, errorType?: TaskErrorType) {
    if (store.state.run !== run) return;
    const cancel = cancelDownload(outcome);
    epoch++; clearWatchdog(); clearTicker(); capture.stop(); handlingSequence = null;
    run.isRunning = false; run.outcome = outcome; run.endTime = Date.now(); run.haltReason = reason; run.haltErrorType = errorType;
    store.state.starting = false; store.state.view = "finished";
    const endEpoch = epoch;
    const guard = () => !disposed && store.state.run === run && endEpoch === epoch;
    const invalidation = invalidate(run, guard);
    if (run.sessionUrl) {
      store.state.sessionUrls[run.platform] = run.sessionUrl; store.state.sessionMode = "existing";
      await persist({ [`sessionUrl_${run.platform}`]: run.sessionUrl, ui_sessionMode: "existing" }, guard);
    }
    store.render();
    await cancel; await invalidation;
    if (!guard()) return;
    await refreshSetup(store);
    if (!guard()) return;
    if (outcome === "halted" && errorType === "locked-url") {
      try {
        const targetUrl = run.sessionPending ? run.homeUrl : run.sessionUrl;
        if (targetUrl && guard()) {
          const tab = await chrome.tabs.create({ url: targetUrl, active: true });
          if (guard()) run.currentTabId = tab.id ?? null;
        }
      } catch (error) { if (guard()) store.addLog("warn", String(error), { verbose: true }); }
    }
  }
  async function recreate(run: RunState) {
    const index = run.currentIndex;
    const guard = () => currentRun(run) && run.currentIndex === index;
    try {
      const settings = await chrome.storage.local.get(["settings_taskInterval"]);
      if (!guard()) return;
      capture.stop();
      await closeCurrentTabWithPlaceholder({ currentTabId: run.currentTabId, tabsGet: chrome.tabs.get.bind(chrome.tabs), tabsQuery: chrome.tabs.query.bind(chrome.tabs), tabsCreate: chrome.tabs.create.bind(chrome.tabs), tabsRemove: chrome.tabs.remove.bind(chrome.tabs), current: guard });
      if (!guard()) return;
      run.currentTabId = null;
      await new Promise(resolve => setTimeout(resolve, secondsSetting(settings.settings_taskInterval, 5) * 1000));
      if (!guard()) return;
      await openSession(store, run, guard, false);
      if (!guard()) return;
      capture.start(run.currentTabId);
      await processNextTask(run);
    } catch (error) {
      if (!guard()) return;
      handlingSequence = run.activeTaskRunSeq;
      await handleTaskError(run, run.activeTaskRunSeq, error instanceof Error ? error.message : String(error), (error as { errorType?: TaskErrorType })?.errorType || "locked-url");
    }
  }
  async function advance(run: RunState) {
    if (!currentRun(run)) return;
    run.currentIndex++;
    run.nextTaskMode = "full";
    handlingSequence = null;
    await invalidate(run, () => currentRun(run));
    if (!currentRun(run)) return;
    store.render();
    if (run.currentIndex >= run.taskQueue.length) await endRun(run, "finished");
    else await recreate(run);
  }
  async function handleTaskError(run: RunState, sequence: number, error: string, errorType?: TaskErrorType) {
    if (!currentTask(run, sequence)) return;
    const index = run.currentIndex, task = run.taskQueue[index];
    const guard = () => currentRun(run) && run.currentIndex === index;
    const cancel = cancelDownload("task-error");
    clearWatchdog();
    await invalidate(run, guard);
    await cancel;
    if (!guard()) return;
    const key = task ? taskKey(run.platform, task.name) : "";
    const retries = run.retryCounts.get(key) || 0;
    if (isWatchdogTimeoutError(error)) {
      run.retryCounts.delete(key); run.failedCount++; run.consecutiveFailureCount++;
      run.results.set(index, { outcome: "failed", error, errorType, retries });
      store.addLog("error", t("lifecycle.failed", { pos: index + 1, file: toSafeTaskFilename(task?.name || ""), error }));
      await advance(run);
      return;
    }
    const settings = await chrome.storage.local.get(["settings_maxRetries", "settings_maxConsecutiveFailures"]);
    if (!guard()) return;
    run.maxRetries = Math.max(0, settings.settings_maxRetries ?? 3);
    run.maxConsecutiveFailures = Math.max(0, settings.settings_maxConsecutiveFailures ?? 5);
    const decision = decideTaskErrorOutcome({ error, errorType, currentRetries: retries, maxRetries: run.maxRetries, consecutiveFailureCount: run.consecutiveFailureCount, maxConsecutiveFailures: run.maxConsecutiveFailures });
    if (decision.action === "stop-locked-url" || decision.action === "stop-folder") {
      run.results.set(index, { outcome: "failed", error, errorType: decision.resolvedErrorType, retries });
      store.addLog("error", t("lifecycle.halted", { reason: error }));
      await endRun(run, "halted", error, decision.resolvedErrorType);
      return;
    }
    if (decision.action === "retry-download" || decision.action === "retry-full") {
      run.retryCounts.set(key, decision.nextRetryCount);
      run.nextTaskMode = decision.action === "retry-download" && !run.sessionPending ? "download-only" : "full";
      store.addLog("warn", t(run.nextTaskMode === "download-only" ? "lifecycle.retryDownload" : "lifecycle.retryFull", { current: decision.nextRetryCount, max: run.maxRetries }));
      handlingSequence = null;
      await recreate(run);
      return;
    }
    run.retryCounts.delete(key);
    if (decision.shouldIncrementFailedCount) run.failedCount++;
    run.consecutiveFailureCount = decision.nextConsecutiveFailureCount;
    run.results.set(index, { outcome: "failed", error, errorType: decision.resolvedErrorType, retries });
    store.addLog("error", t("lifecycle.failed", { pos: index + 1, file: toSafeTaskFilename(task?.name || ""), error }));
    if (decision.action === "fail-stop") {
      const reason = t("lifecycle.failureLimit", { count: run.consecutiveFailureCount, error });
      store.addLog("error", t("lifecycle.halted", { reason }));
      await endRun(run, "halted", reason, decision.resolvedErrorType);
    } else await advance(run);
  }
  async function processNextTask(run: RunState) {
    if (!currentRun(run)) return;
    if (run.currentIndex >= run.taskQueue.length) return endRun(run, "finished");
    const task = run.taskQueue[run.currentIndex], index = run.currentIndex;
    const sequence = nextSequence(run), guard = () => currentTask(run, sequence, index);
    handlingSequence = null;
    run.currentTaskMode = run.nextTaskMode; run.nextTaskMode = "full";
    run.attempt = (run.retryCounts.get(taskKey(run.platform, task.name)) || 0) + 1;
    const openStage = run.stages["open-session"];
    run.stages = emptyStages(); run.stages["open-session"] = openStage;
    store.addLog("info", t("lifecycle.taskStarted", { pos: index + 1, file: toSafeTaskFilename(task.name), attempt: run.attempt }));
    try {
      const settings = await chrome.storage.local.get(["settings_generationTimeout", "settings_downloadTimeout"]);
      if (!guard()) return;
      run.downloadTimeout = secondsSetting(settings.settings_downloadTimeout, 120);
      await persist({ currentTask: task, currentTaskMode: run.currentTaskMode, currentTaskIndex: index, currentTaskRunSeq: sequence, currentTaskPlatform: run.platform,
        currentSessionUrl: run.sessionUrl, currentSessionPending: run.sessionPending, currentHomeUrl: run.homeUrl, currentTaskAttempt: run.attempt }, guard);
      if (!guard()) return;
      clearWatchdog();
      const timeoutMs = computeTaskWatchdogTimeoutMs(run.currentTaskMode, settings);
      watchdog = setTimeout(() => {
        if (!guard() || handlingSequence === sequence) return;
        void cancelDownload("watchdog");
        handlingSequence = sequence;
        store.addLog("error", t("lifecycle.timedOut", { seconds: Math.round(timeoutMs / 1000) }));
        void handleTaskError(run, sequence, `Task watchdog timeout after ${Math.round(timeoutMs / 1000)}s`, run.currentTaskMode === "download-only" ? "download" : "generation");
      }, timeoutMs);
      if (run.currentTabId === null) throw taskError(t("lifecycle.noTab"), "locked-url");
      await chrome.scripting.executeScript({ target: { tabId: run.currentTabId }, func: async (cacheBust: number) => { await import(`${chrome.runtime.getURL("content.js")}?v=${cacheBust}&taskRunSeq=${cacheBust}`); }, args: [sequence] });
      if (!guard()) return;
    } catch (error) {
      if (!guard() || handlingSequence === sequence) return;
      handlingSequence = sequence;
      await handleTaskError(run, sequence, error instanceof Error ? error.message : String(error), (error as { errorType?: TaskErrorType })?.errorType || "generation");
    }
  }
  async function complete(run: RunState, sequence: number, request: Extract<PanelMessage, { action: "TASK_COMPLETE" }>) {
    const index = run.currentIndex;
    const guard = () => currentTask(run, sequence, index);
    clearWatchdog();
    try {
      const task = run.taskQueue[index];
      if (!task) throw taskError("Task completion has no active task", "generation");
      if (!request.skipped && run.sessionPending) {
        const tab = run.currentTabId === null ? undefined : await chrome.tabs.get(run.currentTabId);
        if (!guard()) return;
        if (tab?.url && isConversationUrl(run.platform, tab.url)) await capture.capture(run, tab.url);
        if (!guard()) return;
        if (run.sessionPending) throw taskError(t("lifecycle.captureMissing"), "locked-url");
      }
      if (!request.skipped) {
        const filename = toSafeTaskFilename(task.name);
        const result = await withTimeout(chrome.runtime.sendMessage({ action: "CHECK_FILE_EXISTS", platform: run.platform, filename }) as Promise<{ exists: boolean; error?: string; errorType?: TaskErrorType }>, 10000, `Post-check timeout after 10s for ${filename}`);
        if (!guard()) return;
        if (result.error) throw taskError(result.error, result.errorType || "download");
        if (!result.exists) throw taskError(`Post-check missing output: ${filename}`, "download");
      }
      if (!guard()) return;
      const retries = run.retryCounts.get(taskKey(run.platform, task.name)) || 0;
      run.retryCounts.delete(taskKey(run.platform, task.name));
      if (request.skipped) {
        run.skippedCount++;
        const warning = request.skipReason === "warning";
        run.results.set(index, { outcome: warning ? "skipped-warning" : "skipped-exists", warningExcerpt: request.warningExcerpt, retries });
        store.addLog("warn", t(warning ? "lifecycle.skippedWarning" : "lifecycle.skippedExists", { pos: index + 1, file: toSafeTaskFilename(task.name) }));
      } else {
        run.savedCount++; run.results.set(index, { outcome: "saved", retries });
        store.addLog("ok", t("lifecycle.saved", { pos: index + 1, file: toSafeTaskFilename(task.name) }));
      }
      run.consecutiveFailureCount = 0;
      await advance(run);
    } catch (error) {
      if (!guard()) return;
      await handleTaskError(run, sequence, error instanceof Error ? error.message : String(error), (error as { errorType?: TaskErrorType })?.errorType || "download");
    }
  }
  function handlePanelMessage(request: PanelMessage) {
    const run = store.state.run;
    if (request.action === "PANEL_LOG") {
      if (request.taskRunSeq !== undefined && request.taskRunSeq !== run.activeTaskRunSeq) return;
      if (request.taskIndex !== undefined && request.taskIndex !== run.currentIndex) return;
      store.addLog(request.level === "log" ? "info" : request.level, request.message, { verbose: request.verbose ?? !request.event, data: request.data, timestamp: request.timestamp });
      return;
    }
    if (!currentRun(run) || request.taskRunSeq !== run.activeTaskRunSeq || request.taskIndex !== run.currentIndex) return;
    const sequence = run.activeTaskRunSeq;
    if (request.action === "TASK_STAGE") {
      if (handlingSequence === sequence || !run.stages[request.stage]) return;
      const now = Date.now(), stage = run.stages[request.stage];
      if (request.status === "active") {
        for (const previous of Object.values(run.stages)) if (previous !== stage && previous.status === "active") {
          previous.status = "done"; previous.endedAt = now; previous.meta ||= `${Math.round((now - (previous.startedAt || now)) / 1000)}s`;
        }
        stage.startedAt = now; stage.endedAt = undefined;
      } else { stage.endedAt = now; }
      stage.status = request.status;
      stage.meta = request.meta || (request.status === "reused" || request.status === "skipped" ? request.status : request.status === "done" && stage.startedAt ? `${Math.round((now - stage.startedAt) / 1000)}s` : undefined);
      store.render();
    } else if (request.action === "TASK_COMPLETE" || request.action === "TASK_ERROR") {
      if (handlingSequence === sequence) return;
      handlingSequence = sequence;
      if (request.action === "TASK_COMPLETE") void complete(run, sequence, request);
      else void handleTaskError(run, sequence, request.error, request.errorType);
    }
  }
  async function start() {
    if (disposed || resetting || store.state.starting || store.state.run.isRunning) return;
    const startEpoch = ++epoch;
    const run = createRunState(store.state.platform, store.state.sessionMode);
    store.state.run = run; store.state.starting = true;
    const guard = () => !disposed && epoch === startEpoch && store.state.run === run;
    store.render();
    try {
      await cancelDownload("start");
      if (!guard()) return;
      const started = await startRun(store, run, guard);
      if (!guard()) return;
      store.state.starting = false;
      if (!started) { store.render(); return; }
      capture.start(run.currentTabId);
      clearTicker(); ticker = setInterval(() => { if (currentRun(run)) store.render(); }, 1000);
      await processNextTask(run);
    } catch (error) {
      if (!guard()) return;
      store.state.starting = false;
      const message = error instanceof Error ? error.message : String(error);
      store.addLog("error", t("lifecycle.halted", { reason: message }));
      await endRun(run, "halted", message, (error as { errorType?: TaskErrorType })?.errorType || "locked-url");
    }
  }
  async function stop() {
    const run = store.state.run;
    if (!run.isRunning && !store.state.starting) return;
    store.addLog("warn", t("lifecycle.stopped"));
    await endRun(run, "stopped");
  }
  async function reset(options: { clearStorage?: boolean } = { clearStorage: true }) {
    if (resetting) return;
    resetting = true;
    const cancel = cancelDownload("reset");
    epoch++; clearWatchdog(); clearTicker(); capture.stop(); handlingSequence = null;
    const oldRun = store.state.run;
    oldRun.isRunning = false; store.state.starting = false;
    if (options.clearStorage !== false) await invalidate(oldRun, () => !disposed && store.state.run === oldRun);
    else nextSequence(oldRun);
    await cancel;
    if (options.clearStorage !== false) await chrome.storage.local.clear();
    await chrome.runtime.sendMessage({ action: "RESET_STATE" }).catch(() => undefined);
    if (disposed) { resetting = false; return; }
    store.state.run = createRunState(); store.state.view = "setup"; store.state.logs = []; store.state.setupMessage = undefined;
    store.state.loadedTasks = []; store.state.loadedTasksRaw = []; store.state.loadedTasksFileName = ""; store.state.tasksState = { hasFile: false, tasks: [], issues: [], total: 0 };
    await restoreInitialState(store);
    resetting = false; store.render();
  }
  function dispose() {
    disposed = true; epoch++; clearWatchdog(); clearTicker(); capture.dispose();
    const run = store.state.run;
    run.isRunning = false;
    void cancelDownload("panel-closed");
    void invalidate(run, () => true).catch(() => undefined);
  }
  return { start, stop, reset, handlePanelMessage, dispose };
}
