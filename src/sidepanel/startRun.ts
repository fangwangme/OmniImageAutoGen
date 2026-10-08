import { createTranslator } from "../i18n.js";
import { buildHomeUrl, sessionUrlsMatch, validateSessionUrl } from "../utils/platforms.js";
import { computeReadiness } from "../utils/readiness.js";
import { toSafeTaskFilename } from "../utils/taskQueue.js";
import type { ListFilesResponse, TaskErrorType } from "./panelTypes.js";
import type { PanelStore, RunState } from "./state.js";
import { refreshSetup } from "./initState.js";
import { ensureLockedConversationTab, waitForPageLoad } from "./tabHelpers.js";

export const secondsSetting = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
export const stepDelaySeconds = (value: unknown) => {
  const seconds = secondsSetting(value, 1);
  return seconds > 60 ? seconds / 1000 : seconds;
};
export const taskError = (message: string, errorType: TaskErrorType) => Object.assign(new Error(message), { errorType });
export async function openSession(store: PanelStore, run: RunState, current: () => boolean, reuse: boolean) {
  const check = () => { if (!current()) throw new Error("Cancelled"); };
  const settings = await chrome.storage.local.get(["settings_pageLoadTimeout", "settings_stepDelay"]);
  check();
  const startedAt = Date.now();
  run.stages["open-session"] = { status: "active", startedAt };
  store.render();
  const targetUrl = run.sessionPending ? run.homeUrl : run.sessionUrl;
  let existing: chrome.tabs.Tab | undefined;
  if (reuse && !run.sessionPending) {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    check();
    existing = tabs.find(tab => typeof tab.id === "number" && !!tab.url && sessionUrlsMatch(targetUrl, tab.url));
  }
  const tab = existing?.id !== undefined ? await chrome.tabs.update(existing.id, { active: true }) : await chrome.tabs.create({ url: targetUrl, active: true });
  check();
  if (tab.id === undefined) throw taskError("Could not create platform tab", "locked-url");
  run.currentTabId = tab.id;
  await waitForPageLoad(tab.id, secondsSetting(settings.settings_pageLoadTimeout, 30) * 1000, chrome.tabs.get.bind(chrome.tabs), current);
  check();
  await new Promise(resolve => setTimeout(resolve, stepDelaySeconds(settings.settings_stepDelay) * 2000));
  check();
  if (!run.sessionPending) {
    const matched = await ensureLockedConversationTab(tab.id, run.sessionUrl);
    check();
    if (!matched) throw taskError(createTranslator(store.state.language)("lifecycle.sessionMismatch"), "locked-url");
  }
  const endedAt = Date.now();
  run.stages["open-session"] = { status: "done", startedAt, endedAt, meta: `${Math.round((endedAt - startedAt) / 1000)}s` };
  store.render();
}
export async function startRun(store: PanelStore, run: RunState, current: () => boolean): Promise<boolean> {
  const stored = await chrome.storage.local.get(["ui_platform", "ui_sessionMode", "sessionUrl_chatgpt", "sessionUrl_gemini", "settings_maxRetries", "settings_maxConsecutiveFailures", "settings_downloadTimeout", "currentTaskRunSeq"]);
  if (!current()) return false;
  const state = store.state;
  state.platform = stored.ui_platform === "chatgpt" ? "chatgpt" : stored.ui_platform === "gemini" ? "gemini" : state.platform;
  state.sessionMode = stored.ui_sessionMode === "existing" ? "existing" : stored.ui_sessionMode === "new" ? "new" : state.sessionMode;
  for (const platform of ["chatgpt", "gemini"] as const) if (typeof stored[`sessionUrl_${platform}`] === "string") state.sessionUrls[platform] = stored[`sessionUrl_${platform}`];
  await refreshSetup(store);
  if (!current()) return false;
  const validation = validateSessionUrl(state.sessionUrls[state.platform], state.platform, createTranslator(state.language));
  const readiness = computeReadiness({ platform: state.platform, sessionMode: state.sessionMode, sessionValidation: validation, tasksState: state.tasksState, folderStatus: state.folderStatus });
  if (!readiness.ready) { state.setupMessage = createTranslator(state.language)("lifecycle.notReady"); store.render(); return false; }
  run.platform = state.platform; run.sessionMode = state.sessionMode;
  run.sessionPending = state.sessionMode === "new"; run.sessionUrl = run.sessionPending ? "" : state.sessionUrls[state.platform].trim();
  run.homeUrl = buildHomeUrl(state.platform, state.activeTabUrl);
  run.maxRetries = Math.max(0, typeof stored.settings_maxRetries === "number" ? stored.settings_maxRetries : 3);
  run.maxConsecutiveFailures = Math.max(0, typeof stored.settings_maxConsecutiveFailures === "number" ? stored.settings_maxConsecutiveFailures : 5);
  run.downloadTimeout = secondsSetting(stored.settings_downloadTimeout, 120);
  run.activeTaskRunSeq = Math.max(Date.now(), typeof stored.currentTaskRunSeq === "number" ? stored.currentTaskRunSeq + 1 : 0);
  run.startTime = Date.now();
  await openSession(store, run, current, true);
  if (!current()) return false;
  const listing = await chrome.runtime.sendMessage({ action: "LIST_ALL_FILES", platform: run.platform }) as ListFilesResponse;
  if (!current()) return false;
  if (listing?.error) throw taskError(listing.error, listing.errorType || "folder");
  state.existingFiles = new Set((listing?.files || []).map(name => name.toLowerCase()));
  run.taskQueue = state.loadedTasks.filter(task => !state.existingFiles.has(toSafeTaskFilename(task.name).toLowerCase()));
  if (!run.taskQueue.length) {
    state.setupMessage = createTranslator(state.language)("lifecycle.allSaved", { total: state.loadedTasks.length });
    store.render(); return false;
  }
  run.isRunning = true;
  state.logs = [];
  state.view = "running";
  state.setupMessage = undefined;
  store.render();
  return true;
}
