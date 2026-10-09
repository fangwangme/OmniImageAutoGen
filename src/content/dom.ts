export function isVisible(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (rect.width > 0 || rect.height > 0) && style.display !== "none" && style.visibility !== "hidden";
}

export function isButtonEnabled(element: HTMLElement | null): boolean {
  return !!element && !element.hasAttribute("disabled") && element.getAttribute("aria-disabled") !== "true" && !element.classList.contains("disabled");
}

export const normalizeText = (text: string): string => (text || "").replace(/\s+/g, " ").trim();
export const isImageLoaded = (image: HTMLImageElement): boolean => (image.complete && image.naturalWidth > 0) || image.classList.contains("loaded");

export const assertNotAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new DOMException("Task cancelled", "AbortError");
};

export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  assertNotAborted(signal);
  return new Promise((resolve, reject) => {
    const cancelled = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancelled);
      reject(new DOMException("Task cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancelled);
      resolve();
    }, ms);
    signal?.addEventListener("abort", cancelled, { once: true });
  });
}

export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number,
  intervalMs: number,
  message: string,
  signal?: AbortSignal
): Promise<boolean> {
  const start = Date.now();
  const deadline = start + timeoutMs;
  while (Date.now() < deadline) {
    assertNotAborted(signal);
    if (await condition()) return true;
    const remaining = deadline - Date.now();
    if (remaining > 0) await wait(Math.min(intervalMs, remaining), signal);
  }
  throw new Error(`${message} (waited ${Math.round((Date.now() - start) / 1000)}s, limit ${Math.round(timeoutMs / 1000)}s)`);
}

export function fireHover(element: Element, signal?: AbortSignal): void {
  assertNotAborted(signal);
  for (const type of ["mouseenter", "mouseover", "mousemove"]) {
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
}

export function clickLikeUser(element: HTMLElement, signal?: AbortSignal): void {
  assertNotAborted(signal);
  element.focus({ preventScroll: true });
  for (const type of ["pointerdown", "mousedown"]) {
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
  assertNotAborted(signal);
  element.click();
  for (const type of ["mouseup", "pointerup"]) {
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
}

export function pressEscape(signal?: AbortSignal): void {
  assertNotAborted(signal);
  const target = document.activeElement || document;
  for (const type of ["keydown", "keyup"]) {
    target.dispatchEvent(new KeyboardEvent(type, { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
  }
}

export function firstVisible<T extends HTMLElement>(selectors: readonly string[], root: ParentNode = document): T | null {
  for (const selector of selectors) {
    const element = Array.from(root.querySelectorAll<T>(selector)).find(isVisible);
    if (element) return element;
  }
  return null;
}

export async function scrollPageToBottom(stepDelayMs: number, signal?: AbortSignal): Promise<void> {
  assertNotAborted(signal);
  window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" });
  for (const selector of ["#chat-history", ".chat-history-scroll-container", "main"]) {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) continue;
    element.scrollTop = element.scrollHeight;
    element.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "end" });
  }
  await wait(stepDelayMs, signal);
}
