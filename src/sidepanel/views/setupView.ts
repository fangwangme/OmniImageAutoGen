import type { PanelState } from "../state.js";
import { buildHomeUrl, getGeminiAccountPrefix, PLATFORMS, validateSessionUrl } from "../../utils/platforms.js";
import { computeReadiness } from "../../utils/readiness.js";
import type { TaskIssue } from "../../utils/taskValidation.js";
import { escapeHtml as e, icon, logo, badge, settingsButton, presentCount, outputPath, primaryButton, translator } from "./shared.js";
import { setupTiles } from "./tiles.js";
import { renderLogCard } from "./logCard.js";

const step = (number: string, title: string, note: string, body: string, invalid = false, last = false) => `<section class="setup-step"><div class="step-rail"><span class="step-number ${invalid ? "invalid" : ""}">${number}</span>${last ? "" : '<span class="rail-line"></span>'}</div><div class="step-content ${last ? "last" : ""}"><div class="section-heading"><span>${e(title)}</span><span class="section-note">${e(note)}</span></div>${body}</div></section>`;

function issueMessage(issue: TaskIssue, state: PanelState) {
  const t = translator(state);
  const field = issue.field || "name";
  if (issue.code === "name-collision") return `<span class="mono">${e(issue.name)}</span> ${e(t("ui.validation.collision", { index: issue.otherIndex || 0 }))}`;
  if (issue.code === "name-reserved") return `<span class="mono">${e(issue.name)}</span> ${e(t("ui.validation.reserved"))}`;
  if (issue.code === "not-object") return e(t("ui.validation.notObject"));
  return `<span class="mono">${field}</span> ${e(t(issue.code.endsWith("empty") ? "ui.validation.empty" : "ui.validation.missing"))}`;
}

export function renderSetupView(state: PanelState) {
  const t = translator(state), platform = PLATFORMS[state.platform];
  const validation = validateSessionUrl(state.sessionUrls[state.platform], state.platform, t);
  const readiness = computeReadiness({ platform: state.platform, sessionMode: state.sessionMode, sessionValidation: validation, tasksState: state.tasksState, folderStatus: state.folderStatus });
  const saved = presentCount(state), toRun = state.loadedTasks.length - saved;
  const cards = (["chatgpt", "gemini"] as const).map(id => `<button type="button" class="platform-card" data-action="platform" data-value="${id}" aria-pressed="${id === state.platform}"><span class="platform-card-top">${badge(id)}<span class="radio-dot"></span></span><span class="platform-card-label"><span>${PLATFORMS[id].label}</span><span class="platform-host">${PLATFORMS[id].host}</span></span></button>`).join("");
  const segments = `<div class="session-segments"><div class="segments">${(["new", "existing"] as const).map(mode => `<button type="button" data-action="session-mode" data-value="${mode}" aria-pressed="${state.sessionMode === mode}">${e(t(mode === "new" ? "ui.newSession" : "ui.existingSession"))}</button>`).join("")}</div></div>`;
  let sessionBody: string;
  if (state.sessionMode === "new") {
    const home = buildHomeUrl(state.platform, state.activeTabUrl);
    const prefix = getGeminiAccountPrefix(home);
    const account = state.platform === "chatgpt" ? t("ui.activeAccount") : prefix ? t("ui.accountPrefix", { prefix: `${prefix}/` }) : t("ui.defaultAccount");
    sessionBody = `<div class="session-content"><div class="fresh-session"><span>${e(t("ui.freshChat"))}</span><span class="home-url">${e(home.replace(/^https:\/\//, ""))}</span><span class="account-note">${e(account)}</span></div><div class="session-hint">${icon("link")}<span>${e(t("ui.captureHint", { pattern: platform.conversationHint }))}</span></div></div>`;
  } else {
    const validMessage = validation.ok ? validation.accountPrefix ? t("ui.validAccount", { platform: platform.label, prefix: `${validation.accountPrefix}/` }) : t("ui.validChat", { platform: platform.label }) : validation.message;
    const activeButton = `<button type="button" class="small-button" data-action="active-tab">${e(t("ui.useActiveTab"))}</button>`;
    sessionBody = `<div class="session-content existing"><label for="sessionUrl">${e(t("ui.conversationUrl"))}</label><input id="sessionUrl" type="text" inputmode="url" autocomplete="off" spellcheck="false" value="${e(state.sessionUrls[state.platform])}" aria-invalid="${!validation.ok}" aria-describedby="sessionValidation"><div id="sessionValidation" class="session-validation ${validation.ok ? "valid" : "invalid"}">${icon(validation.ok ? "check" : "alert")}<span>${e(validMessage)}</span>${validation.ok ? activeButton : ""}</div>${validation.ok ? "" : `<div class="session-actions">${validation.code === "wrong-platform" && validation.detectedPlatform ? `<button type="button" class="small-button accent" data-action="switch-platform" data-value="${validation.detectedPlatform}">${e(t("ui.switchPlatform", { platform: PLATFORMS[validation.detectedPlatform].label }))}</button>` : ""}${activeButton}</div>`}</div>`;
  }
  const problems = state.tasksState.issues;
  let prompts: string;
  if (!state.tasksState.hasFile) prompts = `<div class="card prompts-empty"><span class="file-icon">${icon("json", 16)}</span><strong>${e(t("ui.noPrompts"))}</strong><button type="button" class="small-button solid" data-action="choose-file">${e(t("ui.chooseFile"))}</button></div>`;
  else {
    const subtitle = state.tasksState.fatal ? t(state.tasksState.fatal === "invalid-json" ? "ui.invalidJson" : "ui.notArray") : problems.length ? t("ui.promptProblems", { total: state.tasksState.total, count: problems.length }) : t("ui.allValid", { total: state.tasksState.total });
    const sheetLabel = problems.length ? t("ui.problemTiles", { items: Array.from(new Set(problems.flatMap(issue => issue.otherIndex ? [issue.index, issue.otherIndex] : [issue.index]))).sort((a, b) => a - b).join(", ") }) : t("ui.setupTiles", { saved, total: state.tasksState.total, count: toRun });
    prompts = `<div class="card prompts-card"><div class="prompts-heading"><span class="file-icon">${icon("json", 16)}</span><div class="file-details"><strong>${e(state.loadedTasksFileName)}</strong><span class="${problems.length || state.tasksState.fatal ? "danger-text" : "muted"}">${e(subtitle)}</span></div><button type="button" class="small-button" data-action="choose-file">${e(t(problems.length || state.tasksState.fatal ? "ui.reload" : "ui.replace"))}</button></div>${state.tasksState.total ? `<div class="prompt-sheet">${setupTiles(state, sheetLabel)}${problems.length ? "" : `<div class="sheet-legend"><span><i class="legend-chip saved"></i>${e(t("ui.savedCount", { count: saved }))}</span><span><i class="legend-chip waiting"></i>${e(t("ui.toRunCount", { count: toRun }))}</span></div>`}</div>` : ""}${problems.length ? `<ol class="validation-issues">${problems.slice(0, 8).map(issue => `<li><span class="issue-index">#${issue.index}</span><span>${issueMessage(issue, state)}</span></li>`).join("")}${problems.length > 8 ? `<li>${e(t("ui.more", { count: problems.length - 8 }))}</li>` : ""}</ol>` : ""}<div class="saves-to"><span>${e(t("ui.savesTo"))}</span><span>${e(outputPath(state))}</span></div></div>`;
  }
  const folderRow = (folder: "source" | "output") => {
    const status = state.folderStatus[folder], label = t(folder === "source" ? "ui.sourceFolder" : "ui.outputFolder");
    const granted = status.state === "granted", missing = status.state === "missing";
    return `<div class="ready-row ${granted ? "" : "attention"}"><span class="${granted ? "success-text" : "danger-text"}">${icon(granted ? "check" : "alert")}</span><span class="ready-label">${e(granted ? label : t(missing ? "ui.folderNotSet" : "ui.folderExpired", { folder: label }))}</span>${granted ? `<span class="folder-name">${e(status.name)}</span>` : `<button type="button" class="small-button solid" data-action="${missing ? "choose-folder" : "allow-folder"}" data-value="${folder}">${e(t(missing ? "ui.choose" : "ui.allowAgain"))}</button>`}</div>`;
  };
  const checks = `<section class="ready-check"><div class="ready-heading"><span>${e(t("ui.readyCheck"))}</span><button type="button" class="link-button" data-action="settings">${e(t("ui.settings"))}</button></div><div class="ready-rows">${folderRow("source")}${folderRow("output")}<div class="ready-row"><span class="success-text">${icon("check")}</span><span class="ready-label">${e(t("ui.aspectRatio"))}</span><span class="folder-name">${e(state.platform === "gemini" ? t("ui.ratioOnPage", { ratio: state.aspectRatio }) : t("ui.fromPrompt"))}</span></div></div></section>`;
  const startLabel = state.starting ? t("ui.openingSession") : !readiness.ready ? t("ui.start") : toRun === 0 ? t("ui.allAlreadySaved", { total: state.loadedTasks.length }) : t("ui.startRun", { count: toRun, platform: platform.label });
  return `<header class="panel-header"><div class="topbar">${logo()}${settingsButton(state)}</div><div class="status-bar"><span class="status-left"><span class="status-dot ${readiness.ready ? "ready" : "not-ready"}"></span><strong>${e(t(readiness.ready ? "ui.ready" : "ui.notReady"))}</strong><span class="faint">·</span><span>${platform.label}</span></span><span class="${readiness.ready ? "" : "danger-text"}">${e(t(readiness.ready ? "ui.queued" : "ui.issuesCount", { count: readiness.ready ? toRun : readiness.issues.length }))}</span></div></header><main class="setup-main">${step("01", t("ui.platform"), t("ui.onePerRun"), `<div class="platform-cards">${cards}</div>`)}${step("02", t("ui.session"), t("ui.oneChat"), `<div class="card session-card">${segments}${sessionBody}</div>`, readiness.issues.includes("session"))}${step("03", t("ui.prompts"), ".json", prompts, readiness.issues.includes("prompts"), true)}${checks}${state.logCollapsed ? "" : `<div class="setup-log">${renderLogCard(state)}</div>`}</main><footer class="panel-footer">${primaryButton(startLabel, "start", !readiness.ready || toRun === 0 || state.starting)}${!readiness.ready ? `<div id="blockReason" class="block-reason">${e(t("ui.fixIssues", { count: readiness.issues.length, list: readiness.issues.map(issue => t(`ui.issue.${issue}`)).join(", ") }))}</div>` : ""}${state.setupMessage ? `<div class="block-reason" role="status">${e(state.setupMessage)}</div>` : ""}<div class="footer-links"><button type="button" class="text-button log-toggle ${!state.logCollapsed ? "expanded" : ""}" data-action="toggle-log" aria-expanded="${!state.logCollapsed}">${icon("chevron", 12)}${e(t("ui.log"))}</button><button type="button" class="text-button" data-action="reset">${e(t("ui.resetAll"))}</button></div></footer>`;
}
