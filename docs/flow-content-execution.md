# Content execution flow

`src/content.ts` handles one injected task. `src/content/runner.ts` implements platform-independent flow through `src/content/adapters/gemini.ts` or `chatgpt.ts`.

## Entry and task isolation

The panel imports `content.js?v=<sequence>&taskRunSeq=<sequence>`. Entry checks the expected sequence against storage, then reads a fresh task/index/sequence/platform snapshot before creating a controller. A delayed old import cannot adopt a later task or abort its controller.

Only after scope is validated does warning-pattern initialization replace previous listeners and load custom rules. Each content scope aborts when its task is removed or its index/sequence changes. Actions and reported messages carry the task index and sequence.

## Full generation

1. Build the existing safe target filename and check output existence for the selected platform. Existing output reports `TASK_COMPLETE` with `skipReason:"exists"`.
2. Assert the selected chat URL matches the page. While a new session is pending, the page must be the selected platform's home route before typing and sending.
3. Wait for page/input readiness. Existing sessions also wait for history to settle.
4. Scroll down and prepare image mode. Gemini selects the configured aspect ratio. Missing mode/ratio controls produce a warning and a skipped meta label, then continue.
5. Snapshot current user messages, write `name: <safe filename>\nprompt: <original prompt>` and confirm sending.
6. Confirm a new user-message element after the baseline that contains the name anchor. Send is clicked at most twice; a confirmed new message is never sent again.
7. Bind its reply scope and wait for a loaded generated image plus an available native download entry.
8. A completed text-only response matching a warning rule reports `skipReason:"warning"` and an excerpt. A non-warning text-only reply or generation timeout is a generation failure.
9. Arm background before clicking one native download entry, then wait for background save and verification.
10. Report completion; the panel performs its own output existence post-check.

The prompt is not trimmed or rewritten, and no aspect-ratio line is appended.

## Download-only recovery

A captured/locked chat is required. After output and URL pre-checks, locate the last user message matching the task's name anchor. Mark image mode and send as reused, wait for that reply's loaded image/download readiness, then run the same arm/download/save handshake. No new prompt is sent.

If the original reply cannot be found, the error is classified as generation and normal policy can choose a full retry.

## Platform interaction

Gemini scopes reply images and `Download full size image` to the current `.conversation-container`. An already-selected Create image checkbox is left selected.

ChatGPT keeps the image pill while inserting prompt text, reads user messages with `innerText`, and binds assistant blocks between that user bubble and the next user bubble. It opens the last generated-image preview in those blocks, locates the dialog titled **Image preview**, clicks its **Download** once and closes the viewer afterward.

## Download handshake and reporting

Content sends `DOWNLOAD_ARM`, awaits a baseline-ready response, clicks once, and sends `WAIT_AND_SAVE`. Its response timeout is the configured download budget plus 5 seconds; background owns the actual download deadline.

Content emits scoped stage updates and short event logs. Verbose diagnostic logs remain available in copied logs. Errors use `generation`, `download`, `folder` or `locked-url`; cancellation exits without completing another task.

See [adapter/DOM contracts](selectors-and-dom-contracts.md) and [message protocol](protocol-message-contracts.md).
