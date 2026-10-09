import { normalizeLanguage } from "../i18n.js";
import { migrateLegacyState } from "../utils/platforms.js";
import { validateTasks } from "../utils/taskValidation.js";
import type { AspectRatio } from "../types.js";
import type { PanelStore } from "./state.js";
import { readFolderStatus } from "./folderStatus.js";
import type { ListFilesResponse } from "./panelTypes.js";

let refreshSequence = 0;
export async function refreshSetup(store: PanelStore) {
  const sequence = ++refreshSequence;
  const platform = store.state.platform;
  const [active, folders, listing] = await Promise.allSettled([
    chrome.tabs.query({ active: true, currentWindow: true }), readFolderStatus(),
    chrome.runtime.sendMessage({ action: "LIST_ALL_FILES", platform }) as Promise<ListFilesResponse>
  ]);
  if (sequence !== refreshSequence || platform !== store.state.platform) return;
  if (active.status === "fulfilled") store.state.activeTabUrl = active.value[0]?.url || "";
  if (folders.status === "fulfilled" && folders.value?.source && folders.value?.output) store.state.folderStatus = folders.value;
  else store.addLog("warn", "Unable to read folder permissions", { verbose: true });
  if (listing.status === "fulfilled" && !listing.value?.error) store.state.existingFiles = new Set((listing.value?.files || []).map(name => name.toLowerCase()));
  else { store.state.existingFiles = new Set(); store.addLog("warn", listing.status === "fulfilled" ? listing.value?.error || "Unable to list output files" : "Unable to list output files", { verbose: true }); }
  store.render();
}
export async function restoreInitialState(store: PanelStore) {
  const stored = await chrome.storage.local.get(null);
  const migration = migrateLegacyState(stored);
  if (Object.keys(migration.set).length) await chrome.storage.local.set(migration.set);
  if (migration.remove.length) await chrome.storage.local.remove(migration.remove);
  Object.assign(stored, migration.set);
  const state = store.state;
  state.language = normalizeLanguage(stored.uiLanguage);
  state.platform = stored.ui_platform === "chatgpt" ? "chatgpt" : "gemini";
  state.sessionMode = stored.ui_sessionMode === "existing" ? "existing" : "new";
  state.sessionUrls = { chatgpt: typeof stored.sessionUrl_chatgpt === "string" ? stored.sessionUrl_chatgpt : "", gemini: typeof stored.sessionUrl_gemini === "string" ? stored.sessionUrl_gemini : "" };
  state.aspectRatio = ["1:1", "3:4", "4:3", "9:16", "16:9"].includes(stored.settings_aspectRatio) ? stored.settings_aspectRatio as AspectRatio : "16:9";
  state.logCollapsed = typeof stored.logCollapsed === "boolean" ? stored.logCollapsed : true;
  const raw: unknown = stored.loadedTasksRaw ?? stored.loadedTasks;
  state.loadedTasksRaw = Array.isArray(raw) ? raw : [];
  state.loadedTasksFileName = typeof stored.loadedTasksFileName === "string" ? stored.loadedTasksFileName : Array.isArray(raw) ? "prompts.json" : "";
  const validation = validateTasks(raw);
  if ("fatal" in validation) { state.loadedTasks = []; state.tasksState = { hasFile: !!state.loadedTasksFileName, tasks: [], issues: [], total: 0, fatal: state.loadedTasksFileName ? validation.fatal : undefined }; }
  else { state.loadedTasks = validation.tasks; state.tasksState = { hasFile: !!state.loadedTasksFileName, ...validation }; }
  await refreshSetup(store);
}
