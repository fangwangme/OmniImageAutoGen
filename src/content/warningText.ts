import {
  compileWarningPattern,
  CUSTOM_WARNING_PATTERNS_STORAGE_KEY,
  sanitizeCustomWarningPatterns
} from "../utils/warningPatterns.js";

const BUILTIN_TEXT_WARNING_PATTERNS: RegExp[] = [
  /\b(can't|cannot|can not)\s+(help|assist|generate|create)\b/i,
  /\b(i('| a)?m sorry[, ]+but i can('| no)?t)\b/i,
  /\b(unable|failed)\s+to\s+(generate|create|help|assist)\b/i,
  /\b(violates?|violation)\b.*\b(content|safety)\b.*\b(policy|guidelines?)\b/i,
  /\b(content|safety)\s+(policy|filter|filters)\b/i,
  /\b(request|response)\s+(was )?(blocked|rejected)\b/i,
  /无法(?:生成|处理|提供)/,
  /不能(?:生成|处理|提供)/,
  /违反(?:了)?(?:我们的)?(?:内容|安全)?政策/,
  /内容(?:审核|安全)/,
  /请求(?:被)?(?:拒绝|拦截)/
];

let mergedTextWarningPatterns: RegExp[] = [...BUILTIN_TEXT_WARNING_PATTERNS];

const updateCustomWarningPatterns = (value: unknown) => {
  const customInputs = sanitizeCustomWarningPatterns(value);
  const customRegexes: RegExp[] = [];

  customInputs.forEach((input) => {
    try {
      customRegexes.push(compileWarningPattern(input));
    } catch (err) {
      console.warn(`[Content] Invalid warning pattern ignored: ${input}`, err);
    }
  });

  mergedTextWarningPatterns = [
    ...BUILTIN_TEXT_WARNING_PATTERNS,
    ...customRegexes
  ];
};

const loadCustomWarningPatterns = async () => {
  try {
    const result = (await chrome.storage.local.get([
      CUSTOM_WARNING_PATTERNS_STORAGE_KEY
    ])) as Record<string, unknown>;
    updateCustomWarningPatterns(result[CUSTOM_WARNING_PATTERNS_STORAGE_KEY]);
  } catch (err) {
    console.warn("[Content] Failed to load custom warning patterns", err);
  }
};

const isWarningPatternReloadMessage = (
  value: unknown
): value is { action: "RELOAD_WARNING_PATTERNS" } =>
  typeof value === "object" &&
  value !== null &&
  (value as { action?: unknown }).action === "RELOAD_WARNING_PATTERNS";

type WarningPatternListenerState = {
  storageListener: (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => void;
  runtimeListener: (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => void;
};

declare global {
  interface Window {
    __omniAutoGenWarningPatternListenerState?: WarningPatternListenerState;
  }
}

const storageListener: WarningPatternListenerState["storageListener"] = (
  changes,
  area
) => {
  if (area !== "local") return;
  if (!changes[CUSTOM_WARNING_PATTERNS_STORAGE_KEY]) return;
  updateCustomWarningPatterns(changes[CUSTOM_WARNING_PATTERNS_STORAGE_KEY].newValue);
};

const runtimeListener: WarningPatternListenerState["runtimeListener"] = (
  request
) => {
  if (!isWarningPatternReloadMessage(request)) return;
  void loadCustomWarningPatterns();
};

export async function initializeWarningPatterns(): Promise<void> {
  const existingListenerState = window.__omniAutoGenWarningPatternListenerState;
  if (existingListenerState) {
    chrome.storage.onChanged.removeListener(existingListenerState.storageListener);
    chrome.runtime.onMessage.removeListener(existingListenerState.runtimeListener);
  }
  chrome.storage.onChanged.addListener(storageListener);
  chrome.runtime.onMessage.addListener(runtimeListener);
  window.__omniAutoGenWarningPatternListenerState = { storageListener, runtimeListener };
  await loadCustomWarningPatterns();
}

export function matchesWarningPattern(text: string): boolean {
  const normalized = text.toLowerCase();
  return !!normalized && mergedTextWarningPatterns.some(pattern => pattern.test(normalized));
}
