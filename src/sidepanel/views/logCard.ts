import type { PanelState } from "../state.js";
import { escapeHtml, icon, translator } from "./shared.js";

export const copyLogText = (state: PanelState) => state.logs.map(entry => `[${new Date(entry.timestamp).toLocaleDateString("en-CA")} ${entry.time}] [${entry.level}] ${entry.message}${entry.data === undefined ? "" : ` ${typeof entry.data === "string" ? entry.data : JSON.stringify(entry.data)}`}`).join("\n");
export function renderLogCard(state: PanelState) {
  const t = translator(state);
  const entries = state.logs.filter(entry => !entry.verbose);
  const issues = entries.filter(entry => entry.level === "warn" || entry.level === "error");
  const visible = state.logFilter === "issues" ? issues : entries;
  return `<section class="log-card" aria-label="${escapeHtml(t("ui.log"))}"><div class="log-toolbar"><div class="log-tabs"><span class="log-title">${escapeHtml(t("ui.log"))}</span><button type="button" class="log-tab" data-action="log-all" aria-pressed="${state.logFilter === "all"}">${escapeHtml(t("ui.all"))}</button><button type="button" class="log-tab" data-action="log-issues" aria-pressed="${state.logFilter === "issues"}">${escapeHtml(t("ui.logIssues", { count: issues.length }))}</button></div><div class="log-actions"><button type="button" class="icon-button" data-action="copy-log" aria-label="${escapeHtml(t("ui.copyLog"))}">${icon("copy")}</button><button type="button" class="icon-button" data-action="clear-log" aria-label="${escapeHtml(t("ui.clearLog"))}">${icon("trash")}</button></div></div><div class="log-output">${visible.map(entry => `<div class="log-row"><span class="log-time">${escapeHtml(entry.time)}</span><span class="log-message ${entry.level}">${escapeHtml(entry.message)}</span></div>`).join("")}</div></section>`;
}
