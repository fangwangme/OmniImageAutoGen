import { createTranslator } from "../../i18n.js";
import type { PanelState } from "../state.js";
import { PLATFORMS } from "../../utils/platforms.js";
import { toSafeTaskFilename } from "../../utils/taskQueue.js";
import type { PlatformId } from "../../types.js";

export const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export const translator = (state: PanelState) => createTranslator(state.language);
const paths: Record<string, string> = {
  check: '<path d="M5 12l5 5L20 7"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h9"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  json: '<path d="M8 4H7a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h1M16 4h1a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-1"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  restart: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>'
};
export const icon = (name: string, size = 14) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${name === "check" ? "2.2" : "1.8"}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ""}</svg>`;
export const logo = () => '<div class="logo"><svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2" y="6" width="14" height="14" rx="2.5"/><rect x="10" y="2" width="14" height="14" rx="2.5" class="logo-sheet"/><path d="M13 12.5l3-3 5 5"/><circle cx="20" cy="6.5" r="1.2" class="logo-dot" stroke="none"/></svg><span>OmniImageAutoGen</span></div>';
export const badge = (platform: PlatformId, extra = "") => `<span class="brand-badge ${platform} ${extra}">${PLATFORMS[platform].badge}</span>`;
export const settingsButton = (state: PanelState) => `<button type="button" class="settings-button" data-action="settings" aria-label="${escapeHtml(translator(state)("ui.settings"))}">${icon("settings", 16)}</button>`;
export const presentCount = (state: PanelState) => state.loadedTasks.filter(task => state.existingFiles.has(toSafeTaskFilename(task.name).toLowerCase())).length;
export const outputPath = (state: PanelState) => `${state.folderStatus.output.name || "Output"}/${state.platform}/`;
export const primaryButton = (label: string, action: string, disabled = false, restart = false) => `<button type="button" class="primary-button" data-action="${action}" ${disabled ? 'disabled aria-describedby="blockReason"' : ""}><span>${escapeHtml(label)}</span><span class="button-symbol">${restart ? icon("restart") : '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>'}</span></button>`;
