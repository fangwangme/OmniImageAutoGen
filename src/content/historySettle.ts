import { evaluateHistoryImageWait } from "./historyWait.js";
import { wait, assertNotAborted } from "./dom.js";
import type { Translator } from "./adapters/types.js";

type HistoryState = { hasAnyImage: boolean; lastImageLoaded: boolean; hasTextOnlyWarning: boolean };

export async function waitForHistoryImagesToSettle(params: {
  stabilityTimeoutMs: number;
  stepDelayMs: number;
  readState: () => HistoryState;
  t: Translator;
  signal?: AbortSignal;
}): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < params.stabilityTimeoutMs) {
    assertNotAborted(params.signal);
    if (!evaluateHistoryImageWait(params.readState()).shouldWait) return;
    await wait(params.stepDelayMs, params.signal);
  }
  throw new Error(params.t("content.error.pageStabilityTimeout", { seconds: Math.round(params.stabilityTimeoutMs / 1000) }));
}
