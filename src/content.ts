import { getAdapter } from "./content/adapters/index.js";
import { createTranslator, getStoredLanguage } from "./content/localization.js";
import { runTask } from "./content/runner.js";
import { createContentTaskScope, storageGet, TASK_CONTEXT_KEYS, type TaskStorageContext } from "./content/runtime.js";
import { initializeWarningPatterns } from "./content/warningText.js";

// Every injection handles one task; orchestration and retries stay in the side panel.
void (async () => {
  const expectedParam = new URL(import.meta.url).searchParams.get("taskRunSeq");
  const expectedSeq = expectedParam === null ? undefined : Number(expectedParam);
  if (expectedSeq !== undefined && (!Number.isSafeInteger(expectedSeq) || expectedSeq < 0)) return;
  const t = createTranslator(await getStoredLanguage());
  const context = await storageGet<TaskStorageContext>(TASK_CONTEXT_KEYS);
  if (!context.currentTask || (expectedSeq !== undefined && context.currentTaskRunSeq !== expectedSeq)) return;
  // An older delayed import must not adopt the next task or abort its active controller.
  const current = await storageGet<TaskStorageContext>(["currentTask", "currentTaskIndex", "currentTaskRunSeq", "currentTaskPlatform"]);
  if (!current.currentTask || current.currentTaskRunSeq !== context.currentTaskRunSeq || current.currentTaskIndex !== context.currentTaskIndex || current.currentTaskPlatform !== context.currentTaskPlatform || current.currentTask.name !== context.currentTask.name || current.currentTask.prompt !== context.currentTask.prompt) return;
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
})().catch(error => console.error("[Content] Could not initialize task", error));
