export type Language = "en" | "zh";
const LANGUAGE_STORAGE_KEY = "uiLanguage";
const DEFAULT_LANGUAGE: Language = "en";
const translations: Record<Language, Record<string, string>> = {
  en: {
    "content.status.downloading": "Downloading...",
    "content.status.waitingForFile": "Waiting for file...",
    "content.status.processing": "Processing: {{name}}",
    "content.status.complete": "Complete: {{name}}",
    "content.status.generating": "Generating...",
    "content.status.error": "Error: {{message}}",
    "content.error.existingResponseNotFound": "Existing response not found for download-only retry",
    "content.error.timeoutExistingResponse": "Timeout waiting for existing response",
    "content.error.noDownloadButton": "No download button found after generation",
    "content.error.fileSaveFailed": "Could not save downloaded file",
    "content.error.lockedUrlMismatch": "Locked URL mismatch. Expected {{expected}}, got {{actual}}",
    "content.error.timeoutInputField": "Timeout waiting for Input Field",
    "content.error.pageStabilityTimeout": "Page stability timeout ({{seconds}}s) - images not loaded",
    "content.error.failedToWritePrompt": "Failed to write prompt into input field",
    "content.error.timeoutSendButton": "Timeout waiting for Send Button",
    "content.error.sendButtonNotFound": "Send button not found after wait",
    "content.error.sendNotConfirmed": "Send was not confirmed by a new user message",
    "content.error.textReplyWithoutImage": "The reply completed without an image",
    "content.error.noProgress": "no progress for {{seconds}}s",
    "content.error.timeoutDownloadButton": "Timeout waiting for Download Button",
    "content.event.imageModeMissing": "image mode control not found · continuing",
    "content.event.promptSent": "prompt sent · reply bound",
    "content.event.imageReady": "image ready",
    "content.event.downloadClicked": "download clicked",
    "content.event.downloadRetryClicked": "reply found · download clicked",
    "errors.timeoutWaitingDownload": "Timeout waiting for download"
  },
  zh: {
    "content.status.downloading": "正在下载...",
    "content.status.waitingForFile": "等待文件...",
    "content.status.processing": "处理中：{{name}}",
    "content.status.complete": "完成：{{name}}",
    "content.status.generating": "正在生成...",
    "content.status.error": "错误：{{message}}",
    "content.error.existingResponseNotFound": "未找到可用于仅下载重试的已有响应",
    "content.error.timeoutExistingResponse": "等待已有响应超时",
    "content.error.noDownloadButton": "生成后未找到下载按钮",
    "content.error.fileSaveFailed": "无法保存下载文件",
    "content.error.lockedUrlMismatch": "锁定链接不匹配。期望 {{expected}}，实际 {{actual}}",
    "content.error.timeoutInputField": "等待输入框超时",
    "content.error.pageStabilityTimeout": "页面稳定超时（{{seconds}}秒）- 图片未加载",
    "content.error.failedToWritePrompt": "写入提示词失败",
    "content.error.timeoutSendButton": "等待发送按钮超时",
    "content.error.sendButtonNotFound": "等待后仍未找到发送按钮",
    "content.error.sendNotConfirmed": "未出现新的用户消息，无法确认已发送",
    "content.error.textReplyWithoutImage": "回复已完成，但没有图片",
    "content.error.noProgress": "已 {{seconds}} 秒没有进展",
    "content.error.timeoutDownloadButton": "等待下载按钮超时",
    "content.event.imageModeMissing": "未找到生图模式控件 · 继续执行",
    "content.event.promptSent": "提示词已发送 · 已绑定回复",
    "content.event.imageReady": "图片已就绪",
    "content.event.downloadClicked": "已点击下载",
    "content.event.downloadRetryClicked": "已找到回复 · 已点击下载",
    "errors.timeoutWaitingDownload": "等待下载超时"
  }
};
const normalizeLanguage = (value?: string): Language => value === "zh" ? "zh" : "en";
const interpolate = (template: string, vars?: Record<string, string | number>) => {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] === undefined ? "" : String(vars[key]));
};
export const createTranslator = (language: Language) => (key: string, vars?: Record<string, string | number>) => interpolate(translations[language][key] || translations.en[key] || key, vars);
export const getStoredLanguage = async (): Promise<Language> => {
  const stored = await chrome.storage.local.get([LANGUAGE_STORAGE_KEY]);
  return normalizeLanguage(stored[LANGUAGE_STORAGE_KEY]);
};
