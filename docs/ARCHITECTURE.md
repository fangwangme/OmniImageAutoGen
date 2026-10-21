# OmniImageAutoGen architecture

OmniImageAutoGen is a Manifest V3 Chrome extension that runs one platform and one image task at a time. It automates a logged-in website session and saves native downloads through File System Access directory handles.

## Components

| Component | Entry and modules | Responsibility |
| --- | --- | --- |
| Sidepanel | `src/sidepanel.ts`, `src/sidepanel/state.ts`, `taskLifecycle.ts`, `startRun.ts`, `sessionCapture.ts`, `views/*` | Setup/readiness, platform and session choice, validated tasks, queue/retry scheduling, tab lifecycle, stages, logs and finished summaries |
| Content | `src/content.ts`, `src/content/runner.ts`, `adapters/*`, `dom.ts`, `warningText.ts` | One injected task: page interaction, message/reply binding, generation waiting and native download triggering |
| Background | `src/background.ts`, `src/background/fsHandles.ts`, `downloadPipeline.ts` | Directory status and output lookup, download arms, scanning, stable decoding, format conversion, writing, verification and source deletion |
| Options | `options.html`, `src/options.ts`, `styles/options.css` | Automatically saved language, folder permissions, ratio, timing/retry settings, warning patterns and Reset |

Pure policies live in `src/utils/*.js` with matching `.d.ts` declarations. BDD tests import these modules directly. UI uses TypeScript, DOM, CSS and locally bundled fonts.

## Run flow

1. Setup validates tasks, the selected existing-session URL when applicable, and directory permissions.
2. Start opens a new platform home page or reuses/opens the selected existing chat.
3. Output names under the selected platform are compared ignoring case. The queue contains only missing images.
4. The panel persists one task and a unique attempt sequence, then injects `content.js` with that sequence in its query string.
5. Content validates its storage snapshot before creating a controller. Old imports and task messages cannot adopt a later task.
6. The selected adapter writes the original prompt, confirms a new user message and waits for its paired reply.
7. Content arms the background baseline before clicking one native download entry.
8. Background detects, stabilizes and decodes the new image; it copies matching formats or transcodes to the target format.
9. The output is verified before deleting the source. The panel independently checks output existence before accepting a save.
10. The panel advances or retries after recreating its tab, preserving the captured chat URL.

## Sessions and outputs

New sessions are supported directly. Gemini preserves the active tab's `/u/<n>` account prefix when building its home URL. A specific chat URL is captured from tab updates, with a final tab lookup after the first non-skipped completion. Subsequent tasks stay in that chat.

Outputs are separated as `Output/chatgpt/<safe name>` and `Output/gemini/<safe name>`. The tuple `(platform, safe name ignoring case)` identifies a task for output lookup and retries.

## Cancellation and recovery

Stop, Reset, task errors and watchdog expiry cancel the active download arm and invalidate the stored task context. Async panel transitions check run identity and sequence after awaits. Content controllers abort on changed or removed task scope.

A new arm waits for cancellation cleanup of the previous save. Newly created, unverified output files are removed after failed or cancelled writes, while source files remain available for retry. Verified output files are preserved.

Download errors retry download-only once a chat link exists. While a new session is still pending, they retry the full task. Folder and session errors halt immediately. The watchdog fails the task and advances without entering normal retries.

Reset clears local storage and background memory, while preserving IDB directory handles and images. Options and panel reset paths cancel pending UI saves so delayed timers cannot restore cleared settings.

## Details

See the [documentation index](README.md), [normative specification](specs/dual-platform.md) and [testing guide](testing-and-quality.md).
