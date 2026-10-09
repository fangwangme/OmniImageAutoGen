# Troubleshooting playbook

## Readiness

When Start is disabled, use the listed categories: session link, prompts file, source folder and output folder.

- Existing mode needs a specific chat URL belonging to the selected platform.
- New mode opens the platform home page; Gemini carries over the active tab's account prefix.
- Task items require non-empty name/prompt strings. Conflicting safe filenames ignore case, and Windows reserved base names are rejected.
- **Choose…** opens folder settings; **Allow again** requests renewed read/write permission.

## Generation

Use the stage list and copied log to locate a failure. The visible log shows short events; copied logs also contain verbose diagnostics.

A missing image-mode control warns and continues. A missing composer, send acknowledgment, paired reply or download entry fails generation. Website DOM changes should be repaired in the corresponding adapter.

ChatGPT prompt insertion must preserve the image pill. Gemini's selected Create image checkbox must stay selected. If a text-only reply matches warning rules, the item is skipped with an excerpt; a non-warning text-only reply is a generation error.

## Session link errors

The new link is captured from the task tab, then retained for subsequent tasks and runs. If capture is still pending after the first non-skipped completion, the final tab lookup must find a specific chat URL or the run halts.

Use **Open chat**, copy a valid conversation link and select Existing session. Example URL shapes are `https://gemini.google.com/u/<n>/app/<id>` and `https://chatgpt.com/c/<id>`.

An existing chat that redirects elsewhere may indicate login/account changes. Confirm the selected account and supplied chat URL before retrying.

## Download and save failures

1. Confirm Source is Chrome's actual automatic download directory.
2. Turn off Chrome's request to choose a save location for each download.
3. Confirm source/output read/write permissions.
4. Check the single download budget. Native original downloads may take longer than previews.
5. Look for a complete PNG/JPG/JPEG/WebP source file. Temporary `.crdownload` files are ignored.
6. Confirm the output under the selected platform subdirectory.

The background baseline is recorded before clicking. Detection uses new filenames plus modification time, then stable size and decoding. It does not depend on the website's native filename.

Conversion or output verification failure retains the source. Newly created unverified output is cleaned before retry, avoiding a false already-saved result. The preserved consecutive duplicate-image guard deletes the duplicate source and classifies generation failure.

## Retry and Stop

Captured-session download failures retry without sending a prompt. Pending-session download failures retry the full task. If download-only cannot find the original reply, policy can retry full.

Stop cancels the background arm and invalidates content. Late reports cannot change a stopped or later attempt. **Run remaining** checks current outputs and uses the retained chat; **Back to setup** lets you change platform/session choices.

## Reset and diagnostics

Reset clears local settings, tasks and session links, while preserving directory handles and output images. Pending UI save timers are cancelled so old drafts cannot restore cleared settings. If Settings reset fails, the page restores its save controls and shows the save error.

For an issue report, capture the failed task's copied log, stage, timeout settings, permission status, native file arrival and output presence/format. Treat logs as private until sanitized: replace chat URLs with placeholders and remove personal paths or sensitive prompt data.

Build/reload with `bun run typecheck`, `bun run build` and `bun run test:bdd:quiet`. For verification scope, see [testing and quality](testing-and-quality.md).
