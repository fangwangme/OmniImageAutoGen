import { validateTasks } from "../utils/taskValidation.js";
import type { PanelStore } from "./state.js";

const loadSequences = new WeakMap<PanelStore, number>();
export async function loadTasksFile(store: PanelStore, file: File) {
  if (store.state.run.isRunning || store.state.starting) return;
  const capturedRun = store.state.run;
  const sequence = (loadSequences.get(store) || 0) + 1;
  loadSequences.set(store, sequence);
  const current = () => loadSequences.get(store) === sequence && store.state.run === capturedRun && !store.state.run.isRunning && !store.state.starting;
  const text = await file.text();
  if (!current()) return;
  let raw: unknown;
  try { raw = JSON.parse(text); }
  catch {
    store.state.loadedTasksRaw = []; store.state.loadedTasks = []; store.state.loadedTasksFileName = file.name;
    store.state.tasksState = { hasFile: true, tasks: [], issues: [], total: 0, fatal: "invalid-json" };
    await chrome.storage.local.remove(["loadedTasksRaw", "loadedTasks", "loadedTasksFileName"]);
    if (current()) store.render();
    return;
  }
  const validation = validateTasks(raw);
  store.state.loadedTasksRaw = Array.isArray(raw) ? raw : [];
  store.state.loadedTasksFileName = file.name;
  if ("fatal" in validation) { store.state.loadedTasks = []; store.state.tasksState = { hasFile: true, tasks: [], issues: [], total: 0, fatal: validation.fatal }; }
  else { store.state.loadedTasks = validation.tasks; store.state.tasksState = { hasFile: true, ...validation }; }
  await chrome.storage.local.set({ loadedTasksRaw: raw, loadedTasks: store.state.loadedTasks, loadedTasksFileName: file.name });
  if (current()) store.render();
}
export async function openSettings(hash = "") {
  if (hash) { await chrome.tabs.create({ url: chrome.runtime.getURL(`options.html${hash}`) }); return; }
  try { await chrome.runtime.openOptionsPage(); }
  catch { await chrome.runtime.sendMessage({ action: "OPEN_OPTIONS" }); }
}
