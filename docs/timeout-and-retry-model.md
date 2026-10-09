# Timeout and retry model

Settings preserve their existing names/defaults. Timing values are seconds, with a default generation budget of 120, download budget of 120, page-load budget of 30, input budget of 5, step delay of 1, task interval of 5 and polling interval of 1.

## Budget ownership

| Layer | Wait | Budget |
| --- | --- | --- |
| Content | Page/input readiness | Input timeout |
| Content | Existing history settle | Page-load timeout × 2 |
| Content | Send-button readiness | max(input timeout, step delay × 5) |
| Content | Acknowledgment after Send | max(10s, input timeout × 2), at most two clicks |
| Content | Generation | Generation timeout |
| Content | No progress | min(generation timeout, max(page-load timeout, 15s)) |
| Content | Background response | Download timeout + 5s |
| Background | Scan, stabilize, decode, convert, write and verify | One deadline from arm time: download timeout |
| Panel | Tab load | Page-load timeout, followed by readiness delay |
| Panel | Completion output post-check | 10s |

Background controls the actual download deadline. There is no separate short trigger timeout or menu fallback timeout. The arm's timestamp is recorded before content clicks, so opening a native viewer is part of that budget.

Each polling/stability round checks cancellation and invokes an extension API to help keep the service worker alive. Conversion/writing/verification are guarded against cancellation and deadline expiry.

## Watchdog

The unchanged hard-budget formulas are:

- Full attempt: `generationTimeout + downloadTimeout + 15s`.
- Download-only: `downloadTimeout + 15s`.

Watchdog expiry cancels the arm, invalidates content, marks failure and advances without normal retry. It is a fallback to prevent an indefinitely stuck task.

## Normal retry policy

Default maximum retries is 3, meaning up to 4 attempts. Default consecutive-failure limit is 5; a zero limit disables that threshold.

| Error | Decision |
| --- | --- |
| Session URL mismatch or uncaptured required link | Halt immediately |
| Directory access/authorization | Halt immediately |
| Download/save failure, captured session | Retry download-only |
| Download/save failure, pending new session | Retry full |
| Generation/reply/prompt failure | Retry full |
| Retry budget exhausted | Mark failed and advance, or halt at consecutive-failure limit |

Every retry recreates the tab at home while pending or the captured chat otherwise. A missing original reply in download-only mode is generation-classified and can fall back to a full retry.

Settings are read again for each attempt/wait. The running observation bar follows changed download timeout settings. Invalid Options inputs are highlighted and are not saved.
