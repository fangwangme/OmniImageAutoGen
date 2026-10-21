import { createTranslator, DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, normalizeLanguage } from "./i18n.js";
import { isFolderAuthErrorMessage } from "./utils/errorClassifier.js";
import { checkFileExists, getFolderStatus, listOutputFiles } from "./background/fsHandles.js";
import { armDownload, cancelDownload, resetDownloads, waitAndSave } from "./background/downloadPipeline.js";
import { attachConsoleTimestamps } from "./sidepanel/consoleTimestamp.js";
import type { PlatformId } from "./types.js";
attachConsoleTimestamps();

type BackgroundRequest =
  | { action: "CHECK_FILE_EXISTS"; platform: PlatformId; filename: string }
  | { action: "LIST_ALL_FILES"; platform: PlatformId }
  | { action: "FOLDER_STATUS" }
  | { action: "DOWNLOAD_ARM"; platform: PlatformId; targetFilename: string; taskIndex: number; taskRunSeq: number }
  | { action: "WAIT_AND_SAVE"; armId: string }
  | { action: "DOWNLOAD_CANCEL"; reason?: string }
  | { action: "OPEN_OPTIONS" | "RESET_STATE" | "PANEL_LOG" | "TASK_STAGE" }
  | { action: "LOG"; level?: "info" | "ok" | "log" | "warn" | "error"; message: string; data?: unknown; source?: string; event?: boolean; verbose?: boolean; taskIndex?: number; taskRunSeq?: number };
const translator = async () => {
  const stored = await chrome.storage.local.get([LANGUAGE_STORAGE_KEY]);
  return createTranslator(normalizeLanguage(stored[LANGUAGE_STORAGE_KEY]) || DEFAULT_LANGUAGE);
};
chrome.runtime.onMessage.addListener((request: BackgroundRequest, _sender, sendResponse) => {
  if (request.action === "LOG") {
    const level = request.level ?? "log";
    const logger = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    logger(`[${request.source ?? "content"}] ${request.message}`, ...(request.data === undefined ? [] : [request.data]));
    void chrome.runtime.sendMessage({ ...request, action: "PANEL_LOG", level, timestamp: new Date().toISOString() }).catch(() => undefined);
    sendResponse({ ok: true });
    return;
  }
  let operation: Promise<unknown>;
  switch (request.action) {
    case "CHECK_FILE_EXISTS": operation = checkFileExists(request.platform, request.filename).then(exists => ({ exists })); break;
    case "LIST_ALL_FILES": operation = listOutputFiles(request.platform).then(files => ({ files })); break;
    case "FOLDER_STATUS": operation = getFolderStatus(); break;
    case "DOWNLOAD_ARM": operation = translator().then(t => armDownload(request, t)); break;
    case "WAIT_AND_SAVE": operation = translator().then(t => waitAndSave(request.armId, t)); break;
    case "DOWNLOAD_CANCEL": cancelDownload(); sendResponse({ ok: true }); return;
    case "RESET_STATE": resetDownloads(); sendResponse({ success: true }); return;
    case "OPEN_OPTIONS": operation = Promise.resolve(chrome.runtime.openOptionsPage()).then(() => ({ ok: true })); break;
    default: return;
  }
  operation.then(sendResponse).catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    sendResponse({ exists: false, files: [], success: false, ok: false, error: message, errorType: isFolderAuthErrorMessage(message) ? "folder" : "download" });
  });
  return true;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.currentTaskRunSeq || changes.currentTaskIndex || changes.currentTask)) cancelDownload();
});
chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(error => console.error(error));
