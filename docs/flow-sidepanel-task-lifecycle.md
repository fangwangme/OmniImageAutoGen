# Sidepanel task lifecycle

The store in `src/sidepanel/state.ts` supplies setup, running and finished views. `startRun.ts` prepares a run; `taskLifecycle.ts` schedules its serial attempts; `sessionCapture.ts` captures new-chat URLs.

## Setup and Start

Readiness requires a validated task file and granted source/output access. Existing mode also requires a chat URL for the selected platform. New mode does not require a chat URL.

Start reads selected platform/session/settings and refreshes active-tab, folder and output state. Existing mode reuses a matching tab in the current window or opens the supplied URL. New mode opens a fresh platform home tab; Gemini keeps the active Gemini tab's account prefix.

After page load, readiness delay and existing-chat URL checking, output names are compared ignoring case against safe task names. An empty queue stays in setup with **All N images already saved**. A non-empty queue switches to running and starts session capture.

## Attempt state

Each attempt stores task, mode, queue index, unique monotonic sequence, platform, chat URL/pending state, home URL and attempt number. Storage writes are serialized and checked against the current run.

The watchdog is armed per attempt using current generation/download settings. Content is injected with the expected sequence in its module URL. Async transitions check run identity/index/sequence after awaits, including tab creation and output post-checks.

Stages are Open session, Image mode, Send prompt, Generate image, Download original and Convert & save. A new active stage completes the previous active stage. Reused/skipped states retain their labels. Task stage and log messages are filtered by task scope.

## New-chat capture

For the run's current tab, a URL update matching the selected platform's conversation route sets the captured chat URL, clears pending state and stores the platform-specific session link with existing mode.

After the first non-skipped completion, a final tab lookup attempts capture again. If no specific chat URL exists, the run halts with a chat-link error. While capture is pending, download failures choose full retries; afterward they can retry download-only.

## Completion and retry

A skipped task records existing-output or warning outcome. A non-skipped task must pass platform-specific `CHECK_FILE_EXISTS` with a 10-second post-check budget before it counts as saved.

Successful/skipped completion resets consecutive failures and advances. Retry counts use `taskKey(platform,name)`. Normal errors use the unchanged retry policy:

- Session or directory errors halt immediately.
- Download errors retry download-only when the chat is known.
- Other errors retry the full task.
- Exhausted retries mark failure, advance or halt at the configured consecutive-failure threshold.
- Watchdog expiry marks failure and advances without normal retries.

Every task transition/retry recreates the automation tab. Closing the last tab first creates a placeholder to preserve the window. The target is home while pending, otherwise the captured chat.

## Stop, Reset and finish

Errors, watchdog expiry, Stop and Reset cancel background downloads and invalidate the stored task, causing content to abort. Late task messages cannot update a stopped or later run.

Stop keeps results and presents stopped output. Hard-stop reasons appear in the halted finished view; directory errors offer permission recovery, and session errors offer **Open chat**. Normal completion retains the captured link for later runs. Output files are refreshed to calculate remaining tasks.

Reset clears local storage and runtime queue/log state, cancels pending URL saves, and preserves IDB handles and images. External Options reset clears the panel without recursively clearing storage again.

Finished views offer **Copy log**, **Back to setup** and rerunning missing outputs in the retained conversation.
