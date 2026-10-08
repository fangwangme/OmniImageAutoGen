import type { PlatformId } from "../types.js";
import { isFolderAuthErrorMessage } from "../utils/errorClassifier.js";
import { isImageFilename, selectDownloadCandidate } from "../utils/downloadSelection.js";
import type { DownloadEntry } from "../utils/downloadSelection.js";
import { decideSaveAction, sniffImageMime, targetExtLabel, targetMimeForFilename } from "../utils/imageFormat.js";
import { platformSubdir } from "../utils/outputPath.js";
import { directoryValues, getSourceHandle, getOutputHandle } from "./fsHandles.js";
import type { Translator } from "./fsHandles.js";

type DownloadRequest = { platform: PlatformId; targetFilename: string; taskIndex: number; taskRunSeq: number };
type ActiveArm = DownloadRequest & {
  id: string; baseline: Set<string>; armedAt: number; aborted: boolean;
  source: FileSystemDirectoryHandle; output: FileSystemDirectoryHandle;
  controller: AbortController; writer?: FileSystemWritableFileStream; waiting: boolean;
};
type SaveResult = { success: boolean; filename?: string; error?: string; errorType?: "folder" | "download" | "generation"; cancelled?: boolean };
let activeArm: ActiveArm | null = null;
let armGeneration = 0;
let lastFileHash: string | null = null;

const classify = (error: unknown): SaveResult => {
  const message = error instanceof Error ? error.message : String(error);
  return { success: false, error: message, errorType: isFolderAuthErrorMessage(message) ? "folder" : "download" };
};
const cancelled = (): SaveResult => ({ success: false, error: "Cancelled", errorType: "download", cancelled: true });
const positive = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
const isActive = (arm: ActiveArm) => !arm.aborted && activeArm === arm;
const assertActive = (arm: ActiveArm) => { if (!isActive(arm)) throw new Error("Cancelled"); };

export function cancelDownload() {
  armGeneration += 1;
  if (activeArm) {
    activeArm.aborted = true;
    activeArm.controller.abort();
    void activeArm.writer?.abort().catch(() => undefined);
  }
  activeArm = null;
}
export function resetDownloads() { cancelDownload(); lastFileHash = null; }

async function scopeMatches(request: DownloadRequest) {
  const stored = await chrome.storage.local.get(["currentTask", "currentTaskIndex", "currentTaskRunSeq", "currentTaskPlatform"]);
  return !!stored.currentTask && stored.currentTaskIndex === request.taskIndex && stored.currentTaskRunSeq === request.taskRunSeq && stored.currentTaskPlatform === request.platform;
}

export async function armDownload(request: DownloadRequest, t: Translator) {
  try {
    if (!await scopeMatches(request)) return { ok: false, error: "Cancelled", errorType: "download" };
    cancelDownload();
    const generation = armGeneration;
    const [source, output] = await Promise.all([getSourceHandle(), getOutputHandle()]);
    if (!source || !output) return { ok: false, error: t("errors.missingDirectoryHandles"), errorType: "folder" };
    const baseline = new Set<string>();
    for await (const entry of directoryValues(source)) if (entry.kind === "file" && isImageFilename(entry.name)) baseline.add(entry.name);
    const matches = await scopeMatches(request);
    if (generation !== armGeneration || !matches) return { ok: false, error: "Cancelled", errorType: "download" };
    const arm: ActiveArm = { ...request, id: crypto.randomUUID(), baseline, armedAt: Date.now(), source, output, aborted: false, controller: new AbortController(), waiting: false };
    activeArm = arm;
    return { ok: true, armId: arm.id };
  } catch (error) {
    const failure = classify(error);
    return { ok: false, error: failure.error, errorType: failure.errorType };
  }
}

function delay(arm: ActiveArm, ms: number) {
  return new Promise<void>(resolve => {
    const done = () => { clearTimeout(timer); arm.controller.signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, Math.max(0, ms));
    arm.controller.signal.addEventListener("abort", done, { once: true });
    if (arm.aborted) done();
  });
}
function sendStage(arm: ActiveArm, status: "active" | "done", meta?: string) {
  if (!isActive(arm)) return;
  void chrome.runtime.sendMessage({ action: "TASK_STAGE", stage: "save", status, meta, taskIndex: arm.taskIndex, taskRunSeq: arm.taskRunSeq }).catch(() => undefined);
}
async function scan(arm: ActiveArm) {
  const entries: DownloadEntry[] = [];
  for await (const entry of directoryValues(arm.source)) {
    assertActive(arm);
    if (entry.kind !== "file" || !isImageFilename(entry.name) || arm.baseline.has(entry.name)) continue;
    try {
      const file = await (await arm.source.getFileHandle(entry.name)).getFile();
      entries.push({ name: entry.name, size: file.size, lastModified: file.lastModified });
    } catch { /* A download may disappear or remain inaccessible while being written. */ }
  }
  return entries;
}
async function stableFile(arm: ActiveArm, name: string, deadline: number, interval: number): Promise<File | null> {
  let lastSize = -1, count = 0;
  while (Date.now() < deadline) {
    assertActive(arm);
    await chrome.runtime.getPlatformInfo();
    assertActive(arm);
    let file: File;
    try { file = await (await arm.source.getFileHandle(name)).getFile(); } catch { return null; }
    count = file.size > 0 ? (file.size === lastSize ? count + 1 : 1) : 0;
    lastSize = file.size;
    if (count >= 3) return file;
    await delay(arm, Math.min(interval, deadline - Date.now()));
  }
  return null;
}

export async function waitAndSave(armId: string, t: Translator): Promise<SaveResult> {
  const arm = activeArm;
  if (!arm || arm.id !== armId || arm.waiting) return { success: false, error: "Download not armed", errorType: "download" };
  arm.waiting = true;
  try {
    const settings = await chrome.storage.local.get(["settings_downloadTimeout", "settings_pollInterval", "settings_downloadPollInterval", "settings_downloadStabilityInterval"]);
    const timeout = positive(settings.settings_downloadTimeout, 120) * 1000;
    const interval = positive(settings.settings_pollInterval ?? settings.settings_downloadPollInterval ?? settings.settings_downloadStabilityInterval, 1) * 1000;
    const deadline = arm.armedAt + timeout;
    const assertBeforeDeadline = () => { assertActive(arm); if (Date.now() >= deadline) throw new Error(t("errors.timeoutWaitingDownload")); };
    while (Date.now() < deadline) {
      assertActive(arm);
      await chrome.runtime.getPlatformInfo();
      assertActive(arm);
      const candidate = selectDownloadCandidate({ entries: await scan(arm), baseline: arm.baseline, clickTime: arm.armedAt, toleranceMs: 2000 });
      if (!candidate) { await delay(arm, Math.min(interval, deadline - Date.now())); continue; }
      sendStage(arm, "active");
      const file = await stableFile(arm, candidate.name, deadline, interval);
      if (!file) continue;
      assertActive(arm);
      const bytes = await file.arrayBuffer();
      assertActive(arm);
      const blob = new Blob([bytes]);
      let bitmap: ImageBitmap;
      try { bitmap = await createImageBitmap(blob); } catch { await delay(arm, Math.min(interval, deadline - Date.now())); continue; }
      try {
        assertActive(arm);
        const hashBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
        const hash = Array.from(hashBytes, b => b.toString(16).padStart(2, "0")).join("");
        assertActive(arm);
        if (lastFileHash && hash === lastFileHash) {
          await arm.source.removeEntry(candidate.name);
          return { success: false, error: t("errors.duplicateImage"), errorType: "generation" };
        }
        const targetMime = targetMimeForFilename(arm.targetFilename);
        let outBlob = blob;
        if (decideSaveAction(sniffImageMime(bytes), targetMime) === "transcode") {
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Image conversion unavailable");
          context.drawImage(bitmap, 0, 0);
          outBlob = await canvas.convertToBlob({ type: targetMime, quality: targetMime === "image/jpeg" ? 0.95 : undefined });
        }
        assertActive(arm);
        if (Date.now() >= deadline) break;
        const dir = await arm.output.getDirectoryHandle(platformSubdir(arm.platform), { create: true });
        assertActive(arm);
        const target = await dir.getFileHandle(arm.targetFilename, { create: true });
        assertActive(arm);
        arm.writer = await target.createWritable();
        assertActive(arm);
        await arm.writer.write(outBlob);
        assertBeforeDeadline();
        await arm.writer.close();
        arm.writer = undefined;
        assertActive(arm);
        const savedFile = await (await dir.getFileHandle(arm.targetFilename)).getFile();
        if (!savedFile.size || sniffImageMime(await savedFile.arrayBuffer()) !== targetMime) throw new Error("Output verification failed");
        let verified: ImageBitmap;
        try { verified = await createImageBitmap(savedFile); } catch { throw new Error("Output verification failed"); }
        verified.close();
        assertBeforeDeadline();
        await arm.source.removeEntry(candidate.name);
        lastFileHash = hash;
        sendStage(arm, "done", targetExtLabel(arm.targetFilename));
        return { success: true, filename: arm.targetFilename };
      } finally { bitmap.close(); }
    }
    return isActive(arm) ? { success: false, error: t("errors.timeoutWaitingDownload"), errorType: "download" } : cancelled();
  } catch (error) {
    return !isActive(arm) ? cancelled() : classify(error);
  } finally {
    if (arm.writer) await arm.writer.abort().catch(() => undefined);
    if (activeArm === arm) activeArm = null;
  }
}
