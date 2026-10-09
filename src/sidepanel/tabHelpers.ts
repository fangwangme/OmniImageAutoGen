import { shouldCreatePlaceholder as shouldCreatePlaceholderByCount } from "../utils/placeholderPolicy.js";
import { sessionUrlsMatch } from "../utils/platforms.js";

type TabsGet = (tabId: number) => Promise<chrome.tabs.Tab>;
type TabsCreate = (props: chrome.tabs.CreateProperties) => Promise<chrome.tabs.Tab>;
type TabsRemove = (tabId: number) => Promise<void>;
type TabsQuery = (queryInfo: chrome.tabs.QueryInfo) => Promise<chrome.tabs.Tab[]>;
export const shouldCreatePlaceholder = shouldCreatePlaceholderByCount;
export async function waitForPageLoad(tabId: number, timeoutMs: number, tabsGet: TabsGet = chrome.tabs.get.bind(chrome.tabs), current: () => boolean = () => true) {
  const immediate = await tabsGet(tabId);
  if (!current()) throw new Error("Cancelled");
  if (immediate.status === "complete") return;
  return new Promise<void>((resolve, reject) => {
    let finished = false;
    let checking = false;
    const done = (error?: Error) => {
      if (finished) return;
      finished = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearInterval(interval); clearTimeout(timer);
      if (error) reject(error); else resolve();
    };
    const listener = (id: number, change: chrome.tabs.TabChangeInfo) => {
      if (!current()) return done(new Error("Cancelled"));
      if (id === tabId && change.status === "complete") done();
    };
    const interval = setInterval(async () => {
      if (!current()) return done(new Error("Cancelled"));
      if (checking) return;
      checking = true;
      try { const tab = await tabsGet(tabId); if (!current()) done(new Error("Cancelled")); else if (tab.status === "complete") done(); }
      catch (error) { done(error instanceof Error ? error : new Error(String(error))); }
      finally { checking = false; }
    }, 250);
    // A slow page is not a failure: the session URL check and the content script's input wait decide readiness.
    const timer = setTimeout(() => done(), timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
  });
}
export async function ensureLockedConversationTab(tabId: number, sessionUrl: string) {
  const tab = await chrome.tabs.get(tabId);
  return !!tab.url && sessionUrlsMatch(sessionUrl, tab.url);
}
export async function closeCurrentTabWithPlaceholder(params: {
  currentTabId: number | null; tabsGet: TabsGet; tabsQuery: TabsQuery; tabsCreate: TabsCreate; tabsRemove: TabsRemove; current?: () => boolean;
}) {
  const { currentTabId, tabsGet, tabsQuery, tabsCreate, tabsRemove, current = () => true } = params;
  if (currentTabId === null || !current()) return;
  try {
    const tab = await tabsGet(currentTabId);
    if (!current()) return;
    const windowTabs = await tabsQuery({ windowId: tab.windowId });
    if (!current()) return;
    if (shouldCreatePlaceholder(windowTabs.length)) {
      await tabsCreate({ windowId: tab.windowId, active: false, url: "about:blank" });
      if (!current()) return;
    }
    await tabsRemove(currentTabId);
  } catch { /* Closed tabs require no further cleanup. */ }
}
