import { getAdapter } from "./content/adapters/index.js";
import { createTranslator, getStoredLanguage } from "./content/localization.js";
import { runTask } from "./content/runner.js";
import { createContentTaskScope, storageGet, TASK_CONTEXT_KEYS, type TaskStorageContext } from "./content/runtime.js";

// Every injection handles one task; orchestration and retries stay in the side panel.
void (async () => {
  const t = createTranslator(await getStoredLanguage());
  const context = await storageGet<TaskStorageContext>(TASK_CONTEXT_KEYS);
  const scope = createContentTaskScope(context);
  const adapter = getAdapter(context.currentTaskPlatform || "gemini", t, scope.signal);
  await runTask(context, adapter, t, scope);
})().catch(error => console.error("[Content] Could not initialize task", error));
