import type { AspectRatio } from "../../types.js";
import { assertNotAborted, clickLikeUser, fireHover, firstVisible, isButtonEnabled, isImageLoaded, isVisible, normalizeText, pressEscape, scrollPageToBottom, wait, waitFor } from "../dom.js";
import { waitForHistoryImagesToSettle } from "../historySettle.js";
import { TaskError } from "../runtime.js";
import { matchesWarningPattern } from "../warningText.js";
import { emptyReplyState, type PlatformAdapter, type Translator } from "./types.js";

const SELECTORS = {
  composer: ['.ql-editor.textarea[contenteditable="true"]', '.ql-editor[contenteditable="true"]', 'rich-textarea .ql-editor[contenteditable="true"]', 'div[role="textbox"][contenteditable="true"]'],
  history: ['#chat-history', '.chat-history-scroll-container', 'main'],
  loader: ['.loading-spinner', '.skeleton-loader', '.mat-progress-spinner'],
  tools: ['button[aria-label="Upload & tools"]', 'button[aria-label*="Upload"]', 'button[aria-label*="工具"]'],
  imageItem: 'button[role="menuitemcheckbox"]',
  imageMode: ['button[aria-label="Deselect Images"]', 'button[aria-label*="Deselect Images"]', 'button[aria-label*="取消选择图片"]'],
  ratio: ['button[aria-label^="Aspect ratio"]', 'button[aria-label*="Aspect ratio"]', 'button[aria-label*="宽高比"]'],
  send: ['button[aria-label="Send message"]', 'button[aria-label="发送消息"]', 'button.send-button', 'button[mattooltip="Send message"]'],
  stop: ['button[aria-label="Stop response"]', 'button[aria-label="Stop responding"]', 'button[aria-label="停止响应"]', 'button[mattooltip="Stop responding"]'],
  user: 'user-query',
  conversation: '.conversation-container',
  image: 'generated-image img, single-image img',
  download: ['button[aria-label="Download full size image"]', 'button[aria-label*="下载全尺寸"]', 'download-generated-image-button button', 'button[data-test-id="download-generated-image-button"]'],
  complete: '.response-footer.complete',
  busy: 'model-response [aria-busy="true"]'
} as const;

export function createGeminiAdapter(t: Translator, signal?: AbortSignal): PlatformAdapter {
  const composer = () => firstVisible<HTMLElement>(SELECTORS.composer);
  const stopButton = () => firstVisible<HTMLButtonElement>(SELECTORS.stop);
  const imageMode = () => firstVisible<HTMLElement>(SELECTORS.imageMode);
  const imageItem = () => Array.from(document.querySelectorAll<HTMLElement>(SELECTORS.imageItem)).find(element => isVisible(element) && (normalizeText(element.innerText).includes("Create image") || normalizeText(element.innerText).includes("创建图片"))) || null;
  const downloadButton = (scope: Element | null): HTMLButtonElement | null => {
    if (!scope) return null;
    for (const selector of SELECTORS.download) {
      const button = Array.from(scope.querySelectorAll<HTMLButtonElement>(selector)).find(isButtonEnabled);
      if (button) return button;
    }
    return null;
  };
  const scopeFor = (user: Element) => user.closest(SELECTORS.conversation);
  const responseText = (scope: Element | null): string => {
    if (!scope) return "";
    const roots = Array.from(scope.querySelectorAll("model-response"));
    const chunks: string[] = [];
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return node.parentElement?.closest(SELECTORS.user) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
      });
      while (walker.nextNode()) if (walker.currentNode.nodeValue) chunks.push(walker.currentNode.nodeValue);
    }
    return normalizeText(chunks.join(" "));
  };
  const readState = (user: Element) => {
    const scope = scopeFor(user);
    if (!scope) return emptyReplyState();
    const images = Array.from(scope.querySelectorAll<HTMLImageElement>(SELECTORS.image));
    return {
      scopeFound: true,
      busy: !!scope.querySelector(SELECTORS.busy) || !!stopButton(),
      complete: !!scope.querySelector(SELECTORS.complete),
      hasLoadedImage: images.some(image => isImageLoaded(image) && image.naturalWidth > 100),
      downloadReady: !!downloadButton(scope),
      hasAnyImageNode: images.length > 0
    };
  };

  return {
    id: "gemini",
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
      const details = {
        docReady: document.readyState === "complete",
        hasInputField: !!composer(),
        hasChatContainer: !!firstVisible<HTMLElement>(SELECTORS.history),
        hasLoadingIndicator: !!firstVisible<HTMLElement>(SELECTORS.loader)
      };
      return { ready: details.docReady && details.hasInputField && details.hasChatContainer && !details.hasLoadingIndicator, details };
    },
    async waitHistorySettled(timeoutMs, stepDelayMs) {
      await waitForHistoryImagesToSettle({
        stabilityTimeoutMs: timeoutMs, stepDelayMs, t, signal,
        readState() {
          const scope = Array.from(document.querySelectorAll(SELECTORS.conversation)).at(-1) || null;
          const images = scope ? Array.from(scope.querySelectorAll<HTMLImageElement>(SELECTORS.image)) : [];
          const image = images.at(-1);
          const busy = !!scope?.querySelector(SELECTORS.busy) || !!stopButton();
          return {
            hasAnyImage: images.length > 0,
            lastImageLoaded: !!image && isImageLoaded(image) && image.naturalWidth > 100,
            hasTextOnlyWarning: !!scope && !busy && images.length === 0 && !downloadButton(scope) && matchesWarningPattern(responseText(scope))
          };
        }
      });
    },
    scrollToBottom: stepDelayMs => scrollPageToBottom(stepDelayMs, signal),
    async ensureImageMode(stepDelayMs) {
      assertNotAborted(signal);
      if (imageMode()) return "ok";
      if (imageItem()?.getAttribute("aria-checked") === "true") {
        pressEscape(signal);
        return "ok";
      }
      try {
        const tools = firstVisible<HTMLElement>(SELECTORS.tools);
        if (!tools) return "not-found";
        clickLikeUser(tools, signal);
        await waitFor(() => !!imageItem(), Math.max(2000, stepDelayMs * 3), 100, "Image mode menu not found", signal);
        const item = imageItem();
        if (!item) throw new Error("Image mode menu disappeared");
        if (item.getAttribute("aria-checked") === "true") {
          pressEscape(signal);
          return "ok";
        }
        clickLikeUser(item, signal);
        await waitFor(() => !!imageMode(), 3000, 100, "Image mode not selected", signal);
        return "ok";
      } catch (error) {
        assertNotAborted(signal);
        pressEscape(signal);
        return "not-found";
      }
    },
    async ensureAspectRatio(ratio: AspectRatio) {
      assertNotAborted(signal);
      const getButton = () => firstVisible<HTMLElement>(SELECTORS.ratio);
      const selectedRatio = () => {
        const label = getButton()?.getAttribute("aria-label") || "";
        const match = label.match(/\b(1:1|3:4|4:3|9:16|16:9)\b/);
        return match ? match[1] : undefined;
      };
      if (!getButton()) return "not-found";
      if (selectedRatio() === ratio) return "ok";
      try {
        clickLikeUser(getButton()!, signal);
        const getOption = () => firstVisible<HTMLElement>([`[role="menuitemradio"][aria-label="${ratio}"]`, `[role="menuitemradio"][aria-label*="${ratio}"]`]);
        await waitFor(() => !!getOption(), 2000, 100, "Aspect ratio option not found", signal);
        clickLikeUser(getOption()!, signal);
        await waitFor(() => selectedRatio() === ratio, 2000, 100, "Aspect ratio not selected", signal);
        return "ok";
      } catch (error) {
        assertNotAborted(signal);
        pressEscape(signal);
        return "not-found";
      }
    },
    async writePrompt(text, stepDelayMs) {
      const normalized = normalizeText(text);
      for (let attempt = 0; attempt < 2; attempt++) {
        assertNotAborted(signal);
        const field = composer();
        if (!field) return false;
        field.focus();
        try {
          const range = document.createRange();
          range.selectNodeContents(field);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          document.execCommand("insertText", false, text);
        } catch {
          field.innerText = text;
        }
        for (const type of ["keydown", "keypress", "textInput", "input", "keyup", "change"]) field.dispatchEvent(new Event(type, { bubbles: true }));
        await wait(Math.max(200, stepDelayMs / 5), signal);
        if (normalizeText(field.innerText).includes(normalized)) return true;
        field.innerText = text;
        field.dispatchEvent(typeof InputEvent === "function" ? new InputEvent("input", { bubbles: true, data: text }) : new Event("input", { bubbles: true }));
        await wait(Math.max(200, stepDelayMs / 5), signal);
        if (normalizeText(field.innerText).includes(normalized)) return true;
      }
      return false;
    },
    listUserMessages: () => Array.from(document.querySelectorAll(SELECTORS.user)),
    snapshotUserMessages: () => Array.from(document.querySelectorAll(SELECTORS.user)),
    userMessageText: element => (element as HTMLElement).innerText,
    getReplyScope: scopeFor,
    readReplyState: readState,
    findReplyByAnchor(anchor) {
      const target = normalizeText(anchor).toLowerCase();
      const userMessage = Array.from(document.querySelectorAll<HTMLElement>(SELECTORS.user)).filter(element => normalizeText(element.innerText).toLowerCase().includes(target)).at(-1);
      return userMessage ? { userMessage } : null;
    },
    async triggerDownload(userMessage) {
      const button = downloadButton(scopeFor(userMessage));
      if (!button) throw new TaskError(t("content.error.noDownloadButton"), "generation");
      assertNotAborted(signal);
      button.scrollIntoView({ block: "center" });
      const overlay = button.closest(".overlay-container, generated-image, single-image");
      if (overlay) fireHover(overlay, signal);
      fireHover(button, signal);
      await wait(200, signal);
      clickLikeUser(button, signal);
    },
    afterDownload: async () => undefined,
    replyText: userMessage => responseText(scopeFor(userMessage))
  };
}
