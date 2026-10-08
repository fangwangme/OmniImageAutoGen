import type { StageId, StageStatus } from "../types.js";
import { isHomeUrl, sessionUrlsMatch } from "../utils/platforms.js";
import { composeTaskPrompt, promptAnchor } from "../utils/promptFormat.js";
import { assertNotAborted, normalizeText, wait, waitFor } from "./dom.js";
import type { PlatformAdapter, Translator } from "./adapters/types.js";
import { matchesWarningPattern } from "./warningText.js";
import { createContentLogger, normalizeTaskMode, resolveTaskErrorType, runtimeSendMessage, TaskError, toErrorMessage, toSafeTaskFilename, type CheckFileExistsResponse, type ContentMessage, type ContentTaskScope, type DownloadArmResponse, type TaskStorageContext, type WaitAndSaveResponse } from "./runtime.js";

type Timing = { generation: number; download: number; stability: number; input: number; step: number; poll: number };
const normalizeTiming = (context: TaskStorageContext): Timing => {
  const rawStep = context.settings_stepDelay;
  const step = rawStep && rawStep > 60 ? rawStep / 1000 : rawStep;
  const poll = context.settings_pollInterval ?? context.settings_inputPollInterval ?? context.settings_generationPollInterval ?? context.settings_sendPollInterval ?? 1;
  return {
    generation: (context.settings_generationTimeout || 120) * 1000,
    download: (context.settings_downloadTimeout || 120) * 1000,
    stability: (context.settings_pageLoadTimeout || 30) * 1000,
    input: (context.settings_inputTimeout || 5) * 1000,
    step: (step || 1) * 1000,
    poll: (poll > 0 ? poll : 1) * 1000
  };
};

async function sendAndConfirm(adapter: PlatformAdapter, baseline: Element[], anchor: string, timing: Timing, t: Translator, signal: AbortSignal, logInfo: (message: string, data?: unknown) => void): Promise<Element> {
  const normalizedAnchor = normalizeText(anchor).toLowerCase();
  const findAcknowledgement = () => adapter.listUserMessages().filter(element =>
    !baseline.includes(element) &&
    normalizeText(adapter.userMessageText(element)).toLowerCase().includes(normalizedAnchor) &&
    (baseline.length === 0 || Boolean(baseline[baseline.length - 1].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING))
  ).at(-1) || null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    await waitFor(() => {
      adapter.findComposer()?.dispatchEvent(new Event("input", { bubbles: true }));
      return !!findAcknowledgement() || (!!adapter.getSendButton() && !adapter.getStopButton());
    }, Math.max(timing.input, timing.step * 5), timing.poll, t("content.error.timeoutSendButton"), signal);
    assertNotAborted(signal);
    // Check once more before retrying: a late acknowledgement must not cause a second send.
    const lateAcknowledgement = findAcknowledgement();
    if (lateAcknowledgement) return lateAcknowledgement;
    const button = adapter.getSendButton();
    if (!button) throw new Error(t("content.error.sendButtonNotFound"));
    button.focus();
    button.click();
    logInfo("[Content] Send clicked", { attempt });
    const deadline = Date.now() + Math.max(10000, timing.input * 2);
    while (Date.now() < deadline) {
      assertNotAborted(signal);
      const userMessage = findAcknowledgement();
      if (userMessage) return userMessage;
      await wait(Math.min(timing.poll, deadline - Date.now()), signal);
    }
    const userMessage = findAcknowledgement();
    if (userMessage) return userMessage;
    const composerText = normalizeText(adapter.findComposer()?.innerText || "").toLowerCase();
    if (attempt === 2 || adapter.getStopButton() || !composerText.includes(normalizedAnchor)) break;
  }
  throw new Error(t("content.error.sendNotConfirmed"));
}

async function waitGeneration(adapter: PlatformAdapter, userMessage: Element, timing: Timing, t: Translator, signal: AbortSignal): Promise<{ kind: "image" } | { kind: "warning"; excerpt: string }> {
  const start = Date.now();
  const deadline = start + timing.generation;
  const noProgressLimit = Math.min(timing.generation, Math.max(timing.stability, 15000));
  let noProgressSince = start;
  let textOnlySince: number | null = null;
  while (Date.now() < deadline) {
    assertNotAborted(signal);
    const state = adapter.readReplyState(userMessage);
    const now = Date.now();
    if (!state.busy && state.complete && !state.hasAnyImageNode && !state.downloadReady) {
      const text = adapter.replyText(userMessage);
      if (matchesWarningPattern(text)) return { kind: "warning", excerpt: text.slice(0, 120) };
      textOnlySince ??= now;
      if (now - textOnlySince >= timing.step * 3) throw new TaskError(t("content.error.textReplyWithoutImage"), "generation");
    } else textOnlySince = null;
    if (!state.busy && state.hasLoadedImage && state.downloadReady) return { kind: "image" };
    if (state.busy || state.complete || state.hasAnyImageNode) noProgressSince = now;
    else if (now - noProgressSince >= noProgressLimit) throw new TaskError(`${t("content.error.timeoutDownloadButton")} (no progress for ${Math.round(noProgressLimit / 1000)}s)`, "generation");
    await wait(Math.min(timing.poll, deadline - Date.now()), signal);
  }
  throw new TaskError(t("content.error.timeoutDownloadButton"), "generation");
}

async function waitForSave(armId: string, timeoutMs: number, sendMessage: typeof runtimeSendMessage, t: Translator, signal: AbortSignal): Promise<WaitAndSaveResponse> {
  assertNotAborted(signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      sendMessage<WaitAndSaveResponse>({ action: "WAIT_AND_SAVE", armId }),
      new Promise<WaitAndSaveResponse>((resolve, reject) => {
        timer = setTimeout(() => resolve({ success: false, error: t("errors.timeoutWaitingDownload"), errorType: "download" }), timeoutMs);
        abort = () => reject(new DOMException("Task cancelled", "AbortError"));
        signal.addEventListener("abort", abort, { once: true });
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (abort) signal.removeEventListener("abort", abort);
  }
}

export async function runTask(context: TaskStorageContext, adapter: PlatformAdapter, t: Translator, scope: ContentTaskScope): Promise<void> {
  const timing = normalizeTiming(context);
  const signal = scope.signal;
  const sendMessage = <T,>(message: ContentMessage): Promise<T> => {
    assertNotAborted(signal);
    return runtimeSendMessage<T>({ ...message, taskIndex: context.currentTaskIndex, taskRunSeq: context.currentTaskRunSeq });
  };
  const { logInfo, logError, logEvent } = createContentLogger(sendMessage);
  const stage = (id: StageId, status: StageStatus, meta?: string) => void sendMessage<void>({ action: "TASK_STAGE", stage: id, status, meta }).catch(() => undefined);
  const status = (text: string, isError = false) => void sendMessage<void>({ action: "UPDATE_STATUS", status: text, isError }).catch(() => undefined);
  const complete = (skipped: boolean, skipReason?: "exists" | "warning", warningExcerpt?: string) => sendMessage<void>({ action: "TASK_COMPLETE", skipped, skipReason, warningExcerpt });
  let currentPhase: "generation" | "download" = "generation";
  try {
    await scope.assertCurrent();
    const task = context.currentTask;
    if (!task) throw new Error("No task found");
    const filename = toSafeTaskFilename(task.name);
    const anchor = promptAnchor(filename);
    const mode = normalizeTaskMode(context.currentTaskMode);
    logInfo("[Content] Task context", { platform: adapter.id, mode, attempt: context.currentTaskAttempt, timing });
    status(t("content.status.processing", { name: task.name }));
    const check = await sendMessage<CheckFileExistsResponse>({ action: "CHECK_FILE_EXISTS", platform: adapter.id, filename });
    if (check?.error) throw new TaskError(check.error, resolveTaskErrorType(check.error, check.errorType));
    if (check?.exists) {
      await complete(true, "exists");
      return;
    }
    const pending = context.currentSessionPending === true;
    const sessionUrl = context.currentSessionUrl || "";
    const assertSessionUrl = (phase: string) => {
      assertNotAborted(signal);
      const matches = pending ? isHomeUrl(adapter.id, window.location.href) : sessionUrl && sessionUrlsMatch(sessionUrl, window.location.href);
      if (matches) return;
      logError("[Content] Session URL mismatch", { phase, expected: pending ? context.currentHomeUrl : sessionUrl, actual: window.location.href });
      throw new TaskError(t("content.error.lockedUrlMismatch", { expected: pending ? context.currentHomeUrl || "" : sessionUrl, actual: window.location.href }), "locked-url");
    };
    assertSessionUrl("task-start");
    await waitFor(() => adapter.isPageReady().ready, timing.input, timing.poll, t("content.error.timeoutInputField"), signal);
    let userMessage: Element;
    if (mode === "download-only") {
      if (pending) throw new TaskError(t("content.error.existingResponseNotFound"), "generation");
      stage("image-mode", "reused");
      stage("send-prompt", "reused");
      const found = adapter.findReplyByAnchor(anchor);
      if (!found) throw new TaskError(t("content.error.existingResponseNotFound"), "generation");
      userMessage = found.userMessage;
      stage("generate", "active");
      try {
        await waitFor(() => {
          const state = adapter.readReplyState(userMessage);
          return !state.busy && state.downloadReady && state.hasLoadedImage;
        }, timing.generation, timing.poll, t("content.error.timeoutExistingResponse"), signal);
      } catch (error) {
        assertNotAborted(signal);
        throw new TaskError(toErrorMessage(error), "generation");
      }
      stage("generate", "reused");
    } else {
      if (!pending) await adapter.waitHistorySettled(timing.stability * 2, timing.step);
      await wait(timing.step * 3, signal);
      await adapter.scrollToBottom(timing.step);
      await wait(timing.step, signal);
      assertSessionUrl("before-type");
      stage("image-mode", "active");
      const imageMode = await adapter.ensureImageMode(timing.step);
      const ratio = adapter.ensureAspectRatio ? await adapter.ensureAspectRatio(context.settings_aspectRatio || "16:9", timing.step) : "ok";
      const modeReady = imageMode === "ok" && ratio === "ok";
      stage("image-mode", "done", modeReady ? "ok" : "skipped");
      if (!modeReady) logEvent("warn", t("content.event.imageModeMissing"));
      stage("send-prompt", "active");
      const sendStart = Date.now();
      const baseline = adapter.snapshotUserMessages();
      if (!await adapter.writePrompt(composeTaskPrompt(filename, task.prompt), timing.step)) throw new Error(t("content.error.failedToWritePrompt"));
      assertSessionUrl("before-send");
      userMessage = await sendAndConfirm(adapter, baseline, anchor, timing, t, signal, logInfo);
      stage("send-prompt", "done", `${Math.round((Date.now() - sendStart) / 1000)}s`);
      logEvent("info", t("content.event.promptSent"));
      stage("generate", "active");
      status(t("content.status.generating"));
      const generationStart = Date.now();
      let generated;
      try {
        generated = await waitGeneration(adapter, userMessage, timing, t, signal);
      } catch (error) {
        assertNotAborted(signal);
        adapter.getStopButton()?.click();
        throw error;
      }
      if (generated.kind === "warning") {
        await complete(true, "warning", generated.excerpt);
        return;
      }
      stage("generate", "done", `${Math.round((Date.now() - generationStart) / 1000)}s`);
      logEvent("info", t("content.event.imageReady"));
      await wait(timing.step * 2, signal);
    }
    await scope.assertCurrent();
    stage("download", "active");
    status(t("content.status.downloading"));
    const arm = await sendMessage<DownloadArmResponse>({ action: "DOWNLOAD_ARM", platform: adapter.id, targetFilename: filename });
    if (!arm?.ok || !arm.armId) throw new TaskError(arm?.error || t("content.error.fileSaveFailed"), arm?.errorType || "download");
    currentPhase = "download";
    assertNotAborted(signal);
    await adapter.triggerDownload(userMessage, timing.step);
    logEvent("info", t(mode === "download-only" ? "content.event.downloadRetryClicked" : "content.event.downloadClicked"));
    status(t("content.status.waitingForFile"));
    let result: WaitAndSaveResponse;
    try {
      result = await waitForSave(arm.armId, timing.download + 5000, sendMessage, t, signal);
    } finally {
      await adapter.afterDownload(timing.step);
    }
    if (!result?.success) throw new TaskError(result?.error || t("content.error.fileSaveFailed"), result?.errorType || "download");
    await scope.assertCurrent();
    status(t("content.status.complete", { name: task.name }));
    await complete(false);
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
    const message = toErrorMessage(error);
    const errorType = error instanceof TaskError ? error.errorType : resolveTaskErrorType(message, currentPhase === "download" ? "download" : undefined);
    logError("[Content] Task failed", { phase: currentPhase, error: message, errorType });
    status(t("content.status.error", { message }), true);
    await sendMessage<void>({ action: "TASK_ERROR", error: message, errorType }).catch(() => undefined);
  } finally {
    scope.dispose();
  }
}
