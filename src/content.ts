import { getAdapter } from "./content/adapters/index.js";
import { createTranslator, getStoredLanguage } from "./content/localization.js";
import { runTask } from "./content/runner.js";
import { createContentTaskScope, storageGet, TASK_CONTEXT_KEYS, type TaskStorageContext } from "./content/runtime.js";
import { initializeWarningPatterns } from "./content/warningText.js";

// Every injection handles one task; orchestration and retries stay in the side panel.
void (async () => {
  const expectedParam = new URL(import.meta.url).searchParams.get("taskRunSeq");
  const expectedSeq = expectedParam === null ? undefined : Number(expectedParam);
  console.log("%c[Omni:Content] Content script injected", "color: #10b981; font-weight: bold;", {
    url: window.location.href,
    readyState: document.readyState,
    expectedSeq
  });
  if (expectedSeq !== undefined && (!Number.isSafeInteger(expectedSeq) || expectedSeq < 0)) {
    console.warn("[Omni:Content] Invalid expectedSeq parameter:", expectedParam);
    return;
  }
  const t = createTranslator(await getStoredLanguage());
  const context = await storageGet<TaskStorageContext>(TASK_CONTEXT_KEYS);
  if (!context.currentTask || (expectedSeq !== undefined && context.currentTaskRunSeq !== expectedSeq)) {
    console.warn("[Omni:Content] Context mismatch or missing task:", {
      hasTask: Boolean(context.currentTask),
      expectedSeq,
      currentTaskRunSeq: context.currentTaskRunSeq
    });
    return;
  }
  // An older delayed import must not adopt the next task or abort its active controller.
  const current = await storageGet<TaskStorageContext>(["currentTask", "currentTaskIndex", "currentTaskRunSeq", "currentTaskPlatform"]);
  if (!current.currentTask || current.currentTaskRunSeq !== context.currentTaskRunSeq || current.currentTaskIndex !== context.currentTaskIndex || current.currentTaskPlatform !== context.currentTaskPlatform || current.currentTask.name !== context.currentTask.name || current.currentTask.prompt !== context.currentTask.prompt) {
    console.warn("[Omni:Content] Storage context changed during initialization");
    return;
  }

  // Send early handshake so side panel knows content script is live and attached
  chrome.runtime.sendMessage({
    action: "CONTENT_READY",
    url: window.location.href,
    readyState: document.readyState,
    taskIndex: context.currentTaskIndex,
    taskRunSeq: context.currentTaskRunSeq
  }).catch(() => undefined);

  const scope = createContentTaskScope(context);
  try {
    await initializeWarningPatterns();
    await scope.assertCurrent();
  } catch (error) {
    scope.dispose();
    if (scope.signal.aborted) return;
    throw error;
  }
  const adapter = getAdapter(context.currentTaskPlatform || "gemini", t, scope.signal);
  await runTask(context, adapter, t, scope);
})().catch(error => console.error("[Omni:Content] Could not initialize task", error));
