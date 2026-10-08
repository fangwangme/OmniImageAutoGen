import type { AspectRatio, PlatformId } from "../../types.js";

export type ReplyState = {
  scopeFound: boolean;
  busy: boolean;
  complete: boolean;
  hasLoadedImage: boolean;
  downloadReady: boolean;
  hasAnyImageNode: boolean;
};

export interface PlatformAdapter {
  id: PlatformId;
  isPageReady(): { ready: boolean; details: Record<string, unknown> };
  waitHistorySettled(timeoutMs: number, stepDelayMs: number): Promise<void>;
  scrollToBottom(stepDelayMs: number): Promise<void>;
  ensureImageMode(stepDelayMs: number): Promise<"ok" | "not-found">;
  ensureAspectRatio?(ratio: AspectRatio, stepDelayMs: number): Promise<"ok" | "not-found">;
  findComposer(): HTMLElement | null;
  writePrompt(text: string, stepDelayMs: number): Promise<boolean>;
  getSendButton(): HTMLButtonElement | null;
  getStopButton(): HTMLButtonElement | null;
  snapshotUserMessages(): Element[];
  listUserMessages(): Element[];
  userMessageText(element: Element): string;
  getReplyScope(userMessage: Element): Element | null;
  readReplyState(userMessage: Element): ReplyState;
  findReplyByAnchor(anchor: string): { userMessage: Element } | null;
  triggerDownload(userMessage: Element, stepDelayMs: number): Promise<void>;
  afterDownload(stepDelayMs: number): Promise<void>;
  replyText(userMessage: Element): string;
}

export const emptyReplyState = (): ReplyState => ({
  scopeFound: false, busy: false, complete: false, hasLoadedImage: false, downloadReady: false, hasAnyImageNode: false
});
export type Translator = (key: string, vars?: Record<string, string | number>) => string;
