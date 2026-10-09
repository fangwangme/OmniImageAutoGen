import { isConversationUrl } from "../utils/platforms.js";
import { createTranslator } from "../i18n.js";
import type { PanelStore, RunState } from "./state.js";

export function createSessionCapture(store: PanelStore, persist: (items: Record<string, unknown>, current: () => boolean) => Promise<void>) {
  let watchedTabId: number | null = null;
  async function capture(run: RunState, url: string) {
    if (store.state.run !== run || !run.isRunning || !run.sessionPending || !isConversationUrl(run.platform, url)) return false;
    run.sessionUrl = url; run.sessionPending = false;
    store.state.sessionUrls[run.platform] = url;
    store.state.sessionMode = "existing";
    store.addLog("ok", createTranslator(store.state.language)("lifecycle.sessionCaptured"));
    await persist({ [`sessionUrl_${run.platform}`]: url, ui_sessionMode: "existing" }, () => store.state.run === run && run.isRunning && run.sessionUrl === url);
    return true;
  }
  const listener = (tabId: number, change: chrome.tabs.TabChangeInfo) => {
    const run = store.state.run;
    if (tabId === watchedTabId && tabId === run.currentTabId && change.url) void capture(run, change.url).catch(error => store.addLog("error", String(error), { verbose: true }));
  };
  chrome.tabs.onUpdated.addListener(listener);
  return { start(tabId: number | null) { watchedTabId = tabId; }, capture, stop() { watchedTabId = null; }, dispose() { watchedTabId = null; chrome.tabs.onUpdated.removeListener(listener); } };
}
