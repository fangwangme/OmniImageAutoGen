import { assertNotAborted, clickLikeUser, firstVisible, isButtonEnabled, isImageLoaded, isVisible, normalizeText, pressEscape, scrollPageToBottom, wait, waitFor } from "../dom.js";
import { TaskError } from "../runtime.js";
import { emptyReplyState, type PlatformAdapter, type Translator } from "./types.js";

const SELECTORS = {
  composer: ['div.ProseMirror[contenteditable="true"]', 'div[role="textbox"][contenteditable="true"][data-composer-markdown]', 'div[role="textbox"][contenteditable="true"]'],
  tools: ['button[aria-label="Add files and more"]', 'button[aria-label*="Add files"]', 'button[aria-label*="添加文件"]'],
  imageItem: 'button[data-list-navigation-item]',
  imageMode: '[data-inline-selection-pill][data-system-hint-type="picture_v2"]',
  send: ['button[aria-label="Send"]', 'button[aria-label="发送"]', 'button[data-testid="send-button"]'],
  stop: ['button[aria-label="Stop"]', 'button[aria-label="停止"]', 'button[data-testid="stop-button"]'],
  user: '[data-user-message-bubble]',
  assistant: 'h4[data-conversation-role="assistant"]',
  turn: '[data-talvt-turn-state]',
  preview: '[data-testid="generated-image-preview"]',
  image: '[data-testid="generated-image-preview"] img',
  dialog: '[role="dialog"]',
  viewerDownload: 'button[aria-label="Download"], button[aria-label*="Download"], button[aria-label="下载"], button[aria-label*="下载"]',
  viewerClose: 'button[aria-label="Close viewer"], button[aria-label*="Close viewer"], button[aria-label="关闭"], button[aria-label*="关闭"]'
} as const;

type AssistantReply = { block: HTMLElement; turn: Element | null };

export function createChatGPTAdapter(t: Translator, signal?: AbortSignal): PlatformAdapter {
  const composer = () => firstVisible<HTMLElement>(SELECTORS.composer);
  const pill = () => composer()?.querySelector(SELECTORS.imageMode) || null;
  const stopButton = () => firstVisible<HTMLButtonElement>(SELECTORS.stop);
  const repliesFor = (user: Element): AssistantReply[] => {
    const sequence = Array.from(document.querySelectorAll(`${SELECTORS.user}, ${SELECTORS.assistant}`));
    const replies: AssistantReply[] = [];
    let bound = false;
    for (const element of sequence) {
      if (element.matches(SELECTORS.user)) {
        if (bound) break;
        bound = element === user;
      } else if (bound && element.parentElement) {
        replies.push({ block: element.parentElement, turn: element.closest(SELECTORS.turn) });
      }
    }
    return replies;
  };
  const viewer = (): HTMLElement | null => {
    const isImagePreview = (text: string) => {
      const n = normalizeText(text);
      return n === "Image preview" || n === "图片预览" || n.includes("Image preview") || n.includes("图片预览");
    };
    for (const dialog of document.querySelectorAll<HTMLElement>(SELECTORS.dialog)) {
      if (!isVisible(dialog)) continue;
      const labelIds = (dialog.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
      const label = labelIds.map(id => document.getElementById(id)?.innerText || "").join(" ");
      const headings = Array.from(dialog.querySelectorAll<HTMLElement>("h2"));
      if (isImagePreview(label) || headings.some(heading => isImagePreview(heading.innerText))) return dialog;
    }
    return null;
  };
  let imageModeSelected = false;

  return {
    id: "chatgpt",
    findComposer: composer,
    getStopButton: stopButton,
    getSendButton() {
      for (const selector of SELECTORS.send) {
        const button = Array.from(document.querySelectorAll<HTMLButtonElement>(selector)).find(element => isVisible(element) && isButtonEnabled(element));
        if (button) return button;
      }
      return null;
    },
    isPageReady() {
      const details = { docReady: document.readyState === "complete", hasInputField: !!composer() };
      return { ready: details.docReady && details.hasInputField, details };
    },
    async waitHistorySettled(timeoutMs, stepDelayMs) {
      await waitFor(() => {
        const last = Array.from(document.querySelectorAll(SELECTORS.assistant)).at(-1);
        return !stopButton() && (!last || last.closest(SELECTORS.turn)?.getAttribute("data-talvt-turn-state") === "complete");
      }, timeoutMs, stepDelayMs, t("content.error.pageStabilityTimeout", { seconds: Math.round(timeoutMs / 1000) }), signal);
    },
    scrollToBottom: stepDelayMs => scrollPageToBottom(stepDelayMs, signal),
    async ensureImageMode() {
      assertNotAborted(signal);
      imageModeSelected = !!pill();
      if (imageModeSelected) return "ok";
      try {
        const tools = firstVisible<HTMLElement>(SELECTORS.tools);
        if (!tools) return "not-found";
        clickLikeUser(tools, signal);
        const menuItem = () => Array.from(document.querySelectorAll<HTMLElement>(SELECTORS.imageItem)).find(element => isVisible(element) && (normalizeText(element.innerText).includes("Create image") || normalizeText(element.innerText).includes("创建图片"))) || null;
        await waitFor(() => !!menuItem(), 2000, 100, "Image mode menu not found", signal);
        clickLikeUser(menuItem()!, signal);
        await waitFor(() => !!pill(), 3000, 100, "Image mode not selected", signal);
        imageModeSelected = true;
        return "ok";
      } catch (error) {
        assertNotAborted(signal);
        pressEscape(signal);
        return "not-found";
      }
    },
    async writePrompt(text, stepDelayMs) {
      assertNotAborted(signal);
      const field = composer();
      if (!field) return false;
      const written = () => normalizeText(field.innerText).includes(normalizeText(text)) && (!imageModeSelected || !!field.querySelector(SELECTORS.imageMode));
      const moveToEnd = () => {
        field.focus();
        const range = document.createRange();
        range.selectNodeContents(field);
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      };
      moveToEnd();
      try {
        const clipboard = new DataTransfer();
        clipboard.setData("text/plain", text);
        field.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }));
      } catch {
        // The insertText fallback below preserves the existing image-mode pill.
      }
      await wait(Math.max(200, stepDelayMs / 5), signal);
      if (written()) return true;
      assertNotAborted(signal);
      moveToEnd();
      try { document.execCommand("insertText", false, text); } catch { return false; }
      field.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
      await wait(Math.max(200, stepDelayMs / 5), signal);
      return written();
    },
    listUserMessages: () => Array.from(document.querySelectorAll(SELECTORS.user)),
    snapshotUserMessages: () => Array.from(document.querySelectorAll(SELECTORS.user)),
    userMessageText: element => (element as HTMLElement).innerText,
    getReplyScope: user => repliesFor(user)[0]?.block || null,
    readReplyState(user) {
      const replies = repliesFor(user);
      if (!replies.length) return emptyReplyState();
      const state = replies.at(-1)?.turn?.getAttribute("data-talvt-turn-state");
      const images = replies.flatMap(reply => Array.from(reply.block.querySelectorAll<HTMLImageElement>(SELECTORS.image)));
      const loaded = images.some(image => isImageLoaded(image) && image.naturalWidth > 100);
      return {
        scopeFound: true,
        busy: !!stopButton() || (state !== undefined && state !== null && state !== "complete"),
        complete: state === "complete",
        hasLoadedImage: loaded,
        downloadReady: loaded,
        hasAnyImageNode: images.length > 0
      };
    },
    findReplyByAnchor(anchor) {
      const target = normalizeText(anchor).toLowerCase();
      const userMessage = Array.from(document.querySelectorAll<HTMLElement>(SELECTORS.user)).filter(element => normalizeText(element.innerText).toLowerCase().includes(target)).at(-1);
      return userMessage ? { userMessage } : null;
    },
    async triggerDownload(userMessage) {
      const preview = repliesFor(userMessage).flatMap(reply => Array.from(reply.block.querySelectorAll<HTMLElement>(SELECTORS.preview))).at(-1);
      if (!preview) throw new TaskError(t("content.error.noDownloadButton"), "generation");
      assertNotAborted(signal);
      preview.scrollIntoView({ block: "center" });
      clickLikeUser(preview, signal);
      try {
        await waitFor(() => !!viewer(), 5000, 100, t("content.error.noDownloadButton"), signal);
        const download = () => {
          const button = viewer()?.querySelector<HTMLButtonElement>(SELECTORS.viewerDownload) || null;
          return button && isVisible(button) && isButtonEnabled(button) ? button : null;
        };
        await waitFor(() => !!download(), 3000, 100, t("content.error.noDownloadButton"), signal);
        clickLikeUser(download()!, signal);
      } catch (error) {
        assertNotAborted(signal);
        pressEscape(signal);
        throw new TaskError(t("content.error.noDownloadButton"), "generation");
      }
    },
    async afterDownload() {
      await wait(1000, signal);
      const dialog = viewer();
      if (!dialog) return;
      const close = dialog.querySelector<HTMLButtonElement>(SELECTORS.viewerClose);
      if (close) clickLikeUser(close, signal);
      else pressEscape(signal);
      try {
        await waitFor(() => !viewer(), 500, 100, "Image viewer still open", signal);
      } catch {
        assertNotAborted(signal);
      }
    },
    replyText: user => repliesFor(user).map(reply => reply.block.innerText).join("\n")
  };
}
