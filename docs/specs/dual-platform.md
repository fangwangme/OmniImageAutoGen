# Dual-platform image generation specification

This contract defines OmniImageAutoGen 6.0.0: one platform per run, serial tasks in one session, scoped native downloads and verified output under platform subdirectories.

## 1. Scope and invariants

- Supported platforms are ChatGPT and Gemini; automation uses the user's logged-in browser.
- A run selects one platform and one new/existing session. Only the active tab supplies account context.
- Prompt strings are sent unchanged; no ratio line or other prompt text is appended.
- UI uses native TypeScript/DOM/CSS, English/Chinese, system theme and locally bundled fonts.
- Directory handles and existing setting names/defaults retain compatibility.
- Output lookup and task identity compare safe filenames without case sensitivity.
- Download association uses a pre-click directory baseline and file modification time. It does not use the Chrome downloads API.
- Source deletion for a successful save follows output verification. The existing previous-source SHA-256 duplicate guard is preserved.
- Reset clears local storage and cancels runtime work, retaining IDB handles and images.

Parallel platforms, models/quality controls, per-site settings, API keys, prompt/task editing, Pause/Resume, real thumbnails, ratio validation and cross-run hash databases are outside this contract.

## 2. Types

```ts
type PlatformId = "chatgpt" | "gemini";
type SessionMode = "new" | "existing";
type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
type TaskItem = { name: string; prompt: string };
type StageId = "open-session" | "image-mode" | "send-prompt" | "generate" | "download" | "save";
type StageStatus = "todo" | "active" | "done" | "reused" | "skipped";
type TaskOutcome = "saved" | "skipped-exists" | "skipped-warning" | "failed";
```

Pure policies live in `src/utils/*.js` with matching `.d.ts`. TypeScript imports those policies with `.js` suffixes, and BDD tests import the same JavaScript implementation.

## 3. Platform and URL rules

| Platform | Label/badge/color | Host | Chat hint | Default home |
| --- | --- | --- | --- | --- |
| `chatgpt` | ChatGPT / C / #0E6E5C | `chatgpt.com` | `/c/…` | `https://chatgpt.com/` |
| `gemini` | Gemini / G / #5B3FD0 | `gemini.google.com` | `/app/…` | `https://gemini.google.com/app` |

`detectPlatform(url)` returns ChatGPT for exact `chatgpt.com`, Gemini for exact `gemini.google.com` or a host ending in `.gemini.google.com`, and null otherwise, including invalid URLs.

`getGeminiAccountPrefix(url)` reads pathname `^/u/(\d+)(/|$)` and returns `/u/<n>` or empty string. No account number is hardcoded.

After removing Gemini's account prefix and one trailing slash, a conversation path matches `^/app/[A-Za-z0-9_-]+$`. ChatGPT conversation paths match `^(/g/[^/]+)?/c/[A-Za-z0-9-]+$` after removing a trailing slash. The URL's detected platform must match the selected platform.

Gemini home paths after removing the account prefix are `/app`, `/app/` and `/`. ChatGPT home paths are `/` or empty. Home/conversation classification ignores query/hash.

`buildHomeUrl("gemini",activeTabUrl)` uses `https://gemini.google.com<account prefix>/app` only when the active tab detects as Gemini; otherwise it uses default home. ChatGPT always uses its default home.

`validateSessionUrl(url,platform,t)` checks in this order:

1. Empty/whitespace: `empty`.
2. Invalid URL: `invalid`.
3. Unrecognized/different platform: `wrong-platform`, with `detectedPlatform`.
4. Home route: `home`.
5. Any other non-chat route: `not-conversation`.
6. Success: `{ok:true,platform,accountPrefix}`.

Failure is `{ok:false,code,message,detectedPlatform?}`; message comes from i18n. `normalizeSessionUrl` compares origin plus pathname with trailing slash removed, ignoring query/hash. `sessionUrlsMatch` compares those normalized values.

## 4. Tasks, prompt and paths

`validateTasks(raw)` returns `{fatal:"not-array"}` for a non-array, otherwise `{tasks,issues,total}`.

Each item may produce multiple issues, in this order:

1. Null, arrays and primitives: `not-object`.
2. Missing/non-string name: `name-missing`; blank trimmed name: `name-empty`.
3. Missing/non-string prompt: `prompt-missing`; blank trimmed prompt: `prompt-empty`.
4. Apply the unchanged `toSafeTaskFilename` rule. Uppercase the base before its first period; CON, PRN, AUX, NUL, COM1–COM9 and LPT1–LPT9 produce `name-reserved`.
5. Compare the safe name lowercased. Second and later occurrences produce `name-collision`, pointing to the first source index.

Issue shape is `{index,code,field?,name?,otherIndex?}`; indices are 1-based. Invalid items are excluded from tasks. Valid tasks keep original name/prompt strings and order; extra fields are discarded. Setup marks both members of a collision as problems and blocks Start while any issue exists.

```js
composeTaskPrompt(safeName, prompt) // "name: " + safeName + "\nprompt: " + prompt
promptAnchor(safeName)             // "name: " + safeName
platformSubdir(platform)           // "chatgpt" or "gemini"
taskKey(platform, name)            // platform + ":" + toSafeTaskFilename(name).toLowerCase()
```

Output is `<output handle>/<platform>/<safe filename>`. UI displays `handle.name`, never a full filesystem path. Thumbnail UI remains a placeholder.

## 5. Storage and migration

### Local keys

| Keys | Type/default |
| --- | --- |
| `uiLanguage`, `logCollapsed` | `en | zh`; boolean default true |
| `loadedTasks` | Validated TaskItem[] |
| `loadedTasksRaw`, `loadedTasksFileName` | Raw JSON array; string |
| `ui_platform`, `ui_sessionMode` | PlatformId default Gemini; SessionMode default new |
| `sessionUrl_chatgpt`, `sessionUrl_gemini` | Per-platform input/captured URLs |
| `settings_aspectRatio` | AspectRatio default 16:9 |
| `custom_warning_patterns` | string[], maximum 50 |
| `sourceSubfolder`, `outputSubfolder` | Cached directory names |
| `currentTask`, `currentTaskMode`, `currentTaskIndex`, `currentTaskRunSeq` | Current task, full/download-only mode and scoped index/sequence |
| `currentTaskPlatform`, `currentTaskAttempt` | PlatformId; attempt starting at 1 |
| `currentSessionUrl`, `currentSessionPending`, `currentHomeUrl` | Captured URL or empty; pending boolean; home URL |

Existing numeric keys/defaults remain `settings_generationTimeout=120`, `settings_downloadTimeout=120`, `settings_pageLoadTimeout=30`, `settings_inputTimeout=5`, `settings_stepDelay=1`, `settings_taskInterval=5`, `settings_pollInterval=1`, `settings_maxRetries=3`, `settings_maxConsecutiveFailures=5`.

Legacy polling fallback reads remain supported. Options removes the legacy polling keys and obsolete detect/stability timeout keys on timing save. See [complete key list](../config-and-storage-contracts.md).

### Migration and directories

If `lockedConversationUrl` exists and is a valid Gemini chat, migration sets Gemini/existing mode and `sessionUrl_gemini`, then removes the old key. If a new Gemini session key already exists, it is not overwritten and only the old key is removed. Invalid old values are only removed; absence is a no-op.

IDB is `GeminiAutoGenDB`, version 4, store `handles`, keys `sourceHandle/outputHandle`. Reset does not delete these handles or output files.

## 6. Platform adapter interface

```ts
interface PlatformAdapter {
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
type ReplyState = {
  scopeFound: boolean;
  busy: boolean;
  complete: boolean;
  hasLoadedImage: boolean;
  downloadReady: boolean;
  hasAnyImageNode: boolean;
};
```

Composer/send/download methods operate on visible/enabled controls. User text uses `innerText`; ChatGPT requires it for multiline anchors. Reply text excludes user prompt text. Anchor recovery chooses the last matching user message.

Gemini prepares the page ratio and downloads within the bound conversation. ChatGPT preserves its image pill while writing, pairs assistant blocks by DOM order, opens a bound generated-image preview and locates the dialog titled Image preview. Each attempt clicks one native download after ARM acknowledgment.

## 7. Runtime messages

Every request includes its action. Task-originated reports/requests include `taskIndex,taskRunSeq`.

| Action | Direction | Request fields | Response |
| --- | --- | --- | --- |
| `CHECK_FILE_EXISTS` | Content/panel → background | platform, filename | exists, or error/type |
| `LIST_ALL_FILES` | Panel → background | platform | files:string[] |
| `FOLDER_STATUS` | Panel → background | none | source/output name? and state |
| `DOWNLOAD_ARM` | Content → background | platform, targetFilename, taskIndex, taskRunSeq | ok+armId, or error/type |
| `WAIT_AND_SAVE` | Content → background | armId | success+filename, or error/type/cancelled? |
| `DOWNLOAD_CANCEL` | Panel → background | reason | ok:true |
| `TASK_STAGE` | Content/background → panel | stage, status, meta?, taskIndex, taskRunSeq | none |
| `LOG` | Content → background | level, message, data?, source, event?, verbose?, scope | ok:true |
| `PANEL_LOG` | Background → panel | same log fields plus timestamp | none |
| `OPEN_OPTIONS` | Panel → background | none | Opens Options |
| `RESET_STATE` | Panel/Options → background | none | Cancels arm and resets hash |
| `RELOAD_WARNING_PATTERNS` | Panel → platform tabs | none | Reloads custom rules |
| `TASK_COMPLETE` | Content → panel | skipped, skipReason?:exists/warning, warningExcerpt?, scope | none |
| `TASK_ERROR` | Content → panel | error, errorType?, scope | none |
| `UPDATE_STATUS` | Content → panel | status, isError?, scope | none |

Folder state is `granted | prompt | denied | missing`. File/list lookup operates in the platform subdirectory without creating a missing one. Folder status reads do not request permission.

Errors classify as `folder` for authorization, `download` for transfer/save failures, `generation` for generation/reply failures, and `locked-url` for session mismatch.

## 8. Download algorithm

An active arm contains id, platform, targetFilename, task scope, baseline image-name set, armedAt and aborted flag. Only one arm and one wait are active.

### Arm

1. Validate the request against current stored task scope.
2. Abort an older arm and wait for any save cleanup to finish.
3. Recheck scope/cancellation generation; resolve authorized source/output handles.
4. Snapshot top-level source PNG/JPG/JPEG/WebP filenames.
5. Store arm timestamp and reply `{ok:true,armId}`; only then may content click.

### Wait and save

The deadline is arm time plus download timeout. Poll using current unified/legacy fallback interval:

1. Check cancellation and call an extension API each round for service-worker activity.
2. Read eligible top-level image entries and select a filename outside baseline with `lastModified >= armedAt - 2000`.
3. Choose maximum lastModified, then maximum filename as tie-breaker; no candidate means continue.
4. Report save active. Require three equal positive file-size readings, within the same deadline.
5. Read bytes and decode. A decode failure returns to scanning.
6. SHA-256 equal to the previous successful source deletes the duplicate source and returns generation failure.
7. Target MIME is JPEG for jpg/jpeg extension, PNG otherwise. Source magic identifies PNG (89 50 4E 47), JPEG (FF D8 FF), or RIFF/WEBP.
8. Copy equal formats. Otherwise use OffscreenCanvas with target MIME; JPEG quality is 0.95.
9. Write and close under the selected platform subdirectory.
10. Verify positive output size, target magic and successful decoding.
11. Check cancellation/deadline, delete source, update last hash, report save done and return success.

Cancelled/failed attempts abort writing and remove a newly created target if it was never verified. Source remains, except for the preserved duplicate-source guard. Verified output is retained. A next arm waits for old cleanup before reusing the name.

Timeout returns download error. Folder-auth exceptions return folder error; other pipeline exceptions return download error. Cancel and Reset abort the arm; Reset also clears the hash.

## 9. UI and runtime state

```text
setup -> running -> finished
  ^          |          |
  +----------+----------+  Reset / Back to setup
```

Setup readiness issues have fixed order `session,prompts,source,output`:

- Session: existing mode and invalid session URL. New mode ignores it.
- Prompts: missing file, fatal parse/shape, any item issue or no valid tasks.
- Source/output: state is not granted.

Start opens/reuses the selected session, filters existing files and stays in setup if nothing remains. A new-session URL update captures the platform chat and persists existing mode for the next run. The first non-skipped completion retries capture once via tab lookup; failure halts.

Run state retains platform/session, queue/index, scoped sequence, attempt mode, stage timestamps, outcome, per-task results and retry/failure counters. Stages update only for current scope. Download-only reuses earlier stages. Logs store at most 2,000 entries; visible entries exclude verbose diagnostics, while copying includes them.

Completion requires output existence post-check. Download errors retry download-only after capture and full while pending. Folder/session errors halt; exhausted retries can hit consecutive-failure stop. Watchdog budgets are generation+download+15s for full and download+15s for download-only; watchdog failure advances without normal retries.

Stop cancels downloads, invalidates stored task and shows stopped results. Hard halt shows its reason and recovery action. Finish persists the captured URL and refreshes outputs for remaining work. Reset cancels task/UI timers, clears local storage and keeps IDB/images; delayed writes and task callbacks cannot restore cleared state.

## 10. Validation boundary

Pure policy BDD tests and required typecheck/build gates are committed. UI preview screenshots and browser/filesystem fixtures are local executor evidence. Authenticated real-site runs, non-English website controls, ChatGPT frontend paste compatibility and long service-worker behavior require manual acceptance; see [testing and quality](../testing-and-quality.md).
