import { createTranslator, normalizeLanguage } from "./i18n.js";
import { createPanelStore } from "./sidepanel/state.js";
import { createTaskLifecycle } from "./sidepanel/taskLifecycle.js";
import { restoreInitialState, refreshSetup } from "./sidepanel/initState.js";
import { loadTasksFile, openSettings } from "./sidepanel/uiBindings.js";
import { formatDuration, remainingTime } from "./sidepanel/remainingTime.js";
import { validateSessionUrl } from "./utils/platforms.js";
import { computeReadiness } from "./utils/readiness.js";
import { toSafeTaskFilename } from "./utils/taskQueue.js";
import type { PanelMessage } from "./sidepanel/panelTypes.js";

document.addEventListener("DOMContentLoaded", async () => {
  const store = createPanelStore();
  const runtime = createTaskLifecycle(store);
  const state = store.state;
  const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  // This binding keeps the previous shell usable until the redesigned views replace it.
  const render = () => {
    const t = createTranslator(state.language), run = state.run;
    const validation = validateSessionUrl(state.sessionUrls[state.platform], state.platform, t);
    const readiness = computeReadiness({ platform: state.platform, sessionMode: state.sessionMode, sessionValidation: validation, tasksState: state.tasksState, folderStatus: state.folderStatus });
    const start = element<HTMLButtonElement>("startBtn"), stop = element<HTMLButtonElement>("stopBtn"), input = element<HTMLInputElement>("jsonFile");
    if (start) start.disabled = run.isRunning || state.starting || !readiness.ready || state.loadedTasks.every(task => state.existingFiles.has(toSafeTaskFilename(task.name).toLowerCase()));
    if (stop) stop.disabled = !run.isRunning && !state.starting;
    if (input) input.disabled = run.isRunning || state.starting;
    const status = element("statusText");
    if (status) status.textContent = state.setupMessage || (run.isRunning ? `${run.currentIndex + 1} / ${run.taskQueue.length}` : run.haltReason || (state.view === "finished" ? run.outcome : readiness.ready ? "Ready" : "Not ready"));
    const info = element("fileInfo"); if (info) info.textContent = `${state.loadedTasksFileName || "No prompts loaded"} · ${state.loadedTasks.length} tasks`;
    const log = element("logOutput"); if (log) log.textContent = state.logs.filter(entry => !entry.verbose).map(entry => `${entry.time} ${entry.message}`).join("\n");
    const progress = element("progressText"); if (progress) progress.textContent = `${run.savedCount + run.skippedCount + run.failedCount} / ${run.taskQueue.length}`;
    const elapsed = element("elapsedTime"); if (elapsed) elapsed.textContent = run.startTime ? formatDuration((run.endTime || Date.now()) - run.startTime) : "0s";
    const remaining = element("remainingTime"); const remainingMs = remainingTime(run); if (remaining) remaining.textContent = remainingMs === null ? "—" : formatDuration(remainingMs);
    const file = element("currentFileName"); if (file) file.textContent = run.taskQueue[run.currentIndex]?.name || "";
  };
  store.subscribe(render);
  await restoreInitialState(store);
  element("startBtn")?.addEventListener("click", () => { void runtime.start(); });
  element("stopBtn")?.addEventListener("click", () => { void runtime.stop(); });
  element("resetBtn")?.addEventListener("click", () => { void runtime.reset(); });
  element("settingsBtn")?.addEventListener("click", () => { void openSettings(); });
  const fileInput = element<HTMLInputElement>("jsonFile");
  fileInput?.addEventListener("change", () => { if (fileInput.files?.[0]) void loadTasksFile(store, fileInput.files[0]); });
  const sessionInput = element<HTMLInputElement>("conversationUrlInput");
  if (sessionInput) {
    sessionInput.value = state.sessionUrls[state.platform];
    sessionInput.addEventListener("input", () => {
      if (state.run.isRunning) return;
      state.sessionUrls[state.platform] = sessionInput.value; state.sessionMode = "existing";
      void chrome.storage.local.set({ [`sessionUrl_${state.platform}`]: sessionInput.value, ui_sessionMode: "existing" });
      store.render();
    });
  }
  const onMessage = (message: PanelMessage) => runtime.handlePanelMessage(message);
  chrome.runtime.onMessage.addListener(onMessage);
  const refresh = () => { if (!state.run.isRunning && !state.starting) void refreshSetup(store); };
  const onUpdated = (_tabId: number, change: chrome.tabs.TabChangeInfo) => { if (change.url) refresh(); };
  chrome.tabs.onActivated.addListener(refresh); chrome.tabs.onUpdated.addListener(onUpdated);
  const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "local") return;
    if (changes.uiLanguage) { state.language = normalizeLanguage(changes.uiLanguage.newValue); store.render(); }
    if (changes.settings_downloadTimeout) { state.run.downloadTimeout = Number(changes.settings_downloadTimeout.newValue) || 120; store.render(); }
    if ((changes.currentTaskRunSeq && changes.currentTaskRunSeq.newValue === undefined) || (changes.loadedTasks && changes.loadedTasks.newValue === undefined && state.run.isRunning)) void runtime.reset({ clearStorage: false });
    if (changes.custom_warning_patterns) {
      void chrome.tabs.query({ url: ["https://gemini.google.com/*", "https://chatgpt.com/*"] }).then(tabs => Promise.allSettled(tabs.filter(tab => tab.id !== undefined).map(tab => chrome.tabs.sendMessage(tab.id!, { action: "RELOAD_WARNING_PATTERNS" }))));
    }
    if (!state.run.isRunning && !state.starting && (changes.sourceSubfolder || changes.outputSubfolder || changes.settings_aspectRatio)) void restoreInitialState(store);
  };
  chrome.storage.onChanged.addListener(onStorage);
  window.addEventListener("unload", () => {
    chrome.runtime.onMessage.removeListener(onMessage); chrome.tabs.onActivated.removeListener(refresh); chrome.tabs.onUpdated.removeListener(onUpdated); chrome.storage.onChanged.removeListener(onStorage); runtime.dispose();
  }, { once: true });
  store.render();
});
