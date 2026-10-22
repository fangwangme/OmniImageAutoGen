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

async function waitGeneration(adapter: PlatformAdapter, userMessage: Element, timing: Timing, t: Translator, signal: AbortSignal, logInfo?: (message: string, data?: unknown) => void): Promise<{ kind: "image" } | { kind: "warning"; excerpt: string }> {
  const start = Date.now();
  const deadline = start + timing.generation;
  const noProgressLimit = Math.min(timing.generation, Math.max(timing.stability, 15000));
  let noProgressSince = start;
  let textOnlySince: number | null = null;
  let lastHeartbeat = start;
  while (Date.now() < deadline) {
    assertNotAborted(signal);
    const state = adapter.readReplyState(userMessage);
    const now = Date.now();
    if (logInfo && now - lastHeartbeat >= 10000) {
      lastHeartbeat = now;
      logInfo(`[Step 4/5: 生成中] 已等待 ${Math.round((now - start) / 1000)}s`, { busy: state.busy, complete: state.complete, hasImage: state.hasAnyImageNode });
    }
    if (!state.busy && state.complete && !state.hasAnyImageNode && !state.downloadReady) {
      const text = adapter.replyText(userMessage);
      if (matchesWarningPattern(text)) return { kind: "warning", excerpt: text.slice(0, 120) };
      textOnlySince ??= now;
      if (now - textOnlySince >= timing.step * 3) throw new TaskError(t("content.error.textReplyWithoutImage"), "generation");
    } else textOnlySince = null;
    if (!state.busy && state.hasLoadedImage && state.downloadReady) return { kind: "image" };
    if (state.busy || state.complete || state.hasAnyImageNode) noProgressSince = now;
    else if (now - noProgressSince >= noProgressLimit) throw new TaskError(`${t("content.error.timeoutDownloadButton")} (${t("content.error.noProgress", { seconds: Math.round(noProgressLimit / 1000) })})`, "generation");
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
  const { logInfo, logWarn, logError, logEvent } = createContentLogger(sendMessage);
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
    const initialReady = adapter.isPageReady();
    if (!initialReady.ready) {
      logInfo("[Step 1/5: 页面就绪] 等待页面及输入框就绪...", initialReady.details);
    }
    try {
      await waitFor(() => adapter.isPageReady().ready, timing.input, timing.poll, t("content.error.timeoutInputField"), signal);
      logInfo("[Step 1/5: 页面就绪] 页面与输入框已确认就绪");
    } catch (err) {
      const finalReady = adapter.isPageReady();
      logError("[Step 1/5: 页面就绪] 页面或输入框超时未就绪", finalReady.details);
      throw err;
    }
    let userMessage: Element;
    if (mode === "download-only") {
      if (pending) throw new TaskError(t("content.error.existingResponseNotFound"), "generation");
      stage("image-mode", "reused");
      stage("send-prompt", "reused");
      logInfo(`[DownloadOnly] 正在通过锚点查找既有回复 (${anchor})...`);
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
      if (!pending) {
        logInfo("[History] 正在等待上一轮历史对话稳定...");
        await adapter.waitHistorySettled(timing.stability * 2, timing.step);
        logInfo("[History] 历史对话已稳定");
      }
      await wait(timing.step * 3, signal);
      await adapter.scrollToBottom(timing.step);
      await wait(timing.step, signal);
      assertSessionUrl("before-type");
      stage("image-mode", "active");
      logInfo("[Step 2/5: 生图模式] 正在检查/触发生图模式...");
      const imageMode = await adapter.ensureImageMode(timing.step);
      if (imageMode !== "ok") {
        logError(`[Step 2/5: 生图模式] 未能激活生图模式 (${imageMode})，终止执行避免文本误发送`);
        throw new TaskError(t("content.error.imageModeFailed", { mode: imageMode }), "generation");
      }
      const ratio = adapter.ensureAspectRatio ? await adapter.ensureAspectRatio(context.settings_aspectRatio || "16:9", timing.step) : "ok";
      if (ratio === "ok") {
        logInfo(`[Step 2/5: 生图模式] 生图模式已就绪 (比例: ${context.settings_aspectRatio || "默认"})`);
      } else {
        logWarn(`[Step 2/5: 宽高比] 比例设置未成功 (${ratio})，将以当前默认比例继续`);
      }
      stage("image-mode", "done", ratio === "ok" ? "ok" : "skipped");
      stage("send-prompt", "active");
      const sendStart = Date.now();
      const baseline = adapter.snapshotUserMessages();
      logInfo(`[Step 3/5: 输入发送] 正在填入提示词 (任务: ${task.name})...`);
      if (!await adapter.writePrompt(composeTaskPrompt(filename, task.prompt), timing.step)) throw new Error(t("content.error.failedToWritePrompt"));
      logInfo("[Step 3/5: 输入发送] 提示词写入成功，准备点击发送...");
      assertSessionUrl("before-send");
      userMessage = await sendAndConfirm(adapter, baseline, anchor, timing, t, signal, logInfo);
      stage("send-prompt", "done", `${Math.round((Date.now() - sendStart) / 1000)}s`);
      logEvent("info", t("content.event.promptSent"));
      logInfo("[Step 3/5: 输入发送] 发送成功，用户消息已在聊天界面确认");
      stage("generate", "active");
      status(t("content.status.generating"));
      const generationStart = Date.now();
      logInfo(`[Step 4/5: 等待生成] 正在等待图片生成 (最长等待 ${Math.round(timing.generation / 1000)}s)...`);
      let generated;
      try {
        generated = await waitGeneration(adapter, userMessage, timing, t, signal, logInfo);
      } catch (error) {
        assertNotAborted(signal);
        adapter.getStopButton()?.click();
        throw error;
      }
      if (generated.kind === "warning") {
        logWarn(`[Step 4/5: 等待生成] 触发安全/内容策略警告: ${generated.excerpt}`);
        await complete(true, "warning", generated.excerpt);
        return;
      }
      stage("generate", "done", `${Math.round((Date.now() - generationStart) / 1000)}s`);
      logEvent("info", t("content.event.imageReady"));
      logInfo(`[Step 4/5: 等待生成] 图片生成完毕 (耗时 ${Math.round((Date.now() - generationStart) / 1000)}s)`);
      await wait(timing.step * 2, signal);
    }
    await scope.assertCurrent();
    stage("download", "active");
    status(t("content.status.downloading"));
    logInfo(`[Step 5/5: 下载保存] 准备捕获并保存图片: ${filename}...`);
    const arm = await sendMessage<DownloadArmResponse>({ action: "DOWNLOAD_ARM", platform: adapter.id, targetFilename: filename });
    if (!arm?.ok || !arm.armId) throw new TaskError(arm?.error || t("content.error.fileSaveFailed"), arm?.errorType || "download");
    currentPhase = "download";
    assertNotAborted(signal);
    await adapter.triggerDownload(userMessage, timing.step);
    logEvent("info", t(mode === "download-only" ? "content.event.downloadRetryClicked" : "content.event.downloadClicked"));
    logInfo(`[Step 5/5: 下载保存] 下载按钮已触发，等待文件写入本地磁盘...`);
    status(t("content.status.waitingForFile"));
    let result: WaitAndSaveResponse;
    try {
      result = await waitForSave(arm.armId, timing.download + 5000, sendMessage, t, signal);
    } finally {
      await adapter.afterDownload(timing.step);
    }
    if (!result?.success) throw new TaskError(result?.error || t("content.error.fileSaveFailed"), result?.errorType || "download");
    await scope.assertCurrent();
    logInfo(`[Step 5/5: 下载保存] 文件保存成功: ${filename}`);
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
