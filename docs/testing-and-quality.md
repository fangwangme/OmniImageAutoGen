# Testing and quality

## Required commands

```bash
bun run typecheck
bun run build
bun run test:bdd:quiet
```

The committed BDD suite contains 77 scenarios across 16 files. The eight new files add 38 scenarios for platform/session URLs, legacy migration, task validation, prompt formatting, platform output keys, download selection, image-format decisions and readiness.

Existing coverage retains error/retry/watchdog policies, filename/queue rules, window protection, history wait and URL compatibility. The history-wait regression gives an existing unloaded image precedence over text-warning detection.

The suite imports pure JavaScript policy modules. Chrome DOM interaction, filesystem integration and image encoding are not fully covered by those committed tests. A Node reporter may summarize test files rather than individual scenarios; retain failure status and relevant assertions as evidence.

## Regression evidence

For a representative case such as case-insensitive filename collision:

1. Run the correct implementation and confirm it passes.
2. Temporarily remove case normalization from that comparison.
3. Run the affected test and capture its failing assertion.
4. Restore the implementation and rerun all three required commands.

Keep the intentional regression out of commits. Evidence should quote only relevant lines and identify whether it came from executor self-checks, browser fixtures or user acceptance. Local fixtures are additional evidence, not part of the committed test guarantee.

## Build checks

Verify the built manifest has both platform host permissions and web-accessible matches, the OmniImageAutoGen name and version 6.0.0.

```bash
jq '.host_permissions, .web_accessible_resources[0].matches, .name, .version' .local/dist/manifest.json
rg -n "Math.abs\(ratio - 1.0\)|CONFIG_DOWNLOAD_TRIGGER_TIMEOUT|isPreferredGeminiFilename|getDownloadMenuItem|WAIT_AND_RENAME" src
rg -n "https?://" .local/dist/*.html .local/dist/styles .local/dist/*.js | rg -v "gemini.google.com|chatgpt.com|www.w3.org"
```

The removal/remote-resource scans should have no output. Fonts and interface assets must be local. Review the complete diff for scope and public-content hygiene; do not commit local evidence, agent state, real chat URLs or personal paths.

## UI previews

Build first, then run `bun run preview:ui`. Open the printed local HTTP URL. Module scripts require HTTP rather than direct file opening.

Panel preview states are `setup, setup-attention, running, finished, stopped, halted, pending-session` via `sidepanel.html?preview=<state>`. Settings uses `options.html?preview=1`. Optional `lang=zh` previews Chinese.

Preview is enabled only when there is a preview parameter and no extension runtime ID. Normal extension pages ignore preview parameters. Preview data makes no Chrome/IDB calls.

Compare every state to the design frames, including system dark mode, Settings and a 320px panel. Store screenshots under `.local/data/` without committing them. For example, with Chromium available:

```bash
chromium --headless=new --disable-gpu --no-sandbox --hide-scrollbars --window-size=400,900 --virtual-time-budget=3000 --screenshot=.local/data/ui-running.png "http://127.0.0.1:4173/sidepanel.html?preview=running"
```

Check layout, color, spacing, text and overflow; minor font rasterization differences are acceptable. Previews validate UI rendering, not real website automation.

## Manual acceptance

Load `.local/dist`; sign into both websites. Source must be Chrome's automatic download directory, Output an authorized directory, and download-location prompts disabled. Use a two-task JSON array with distinct names.

1. **Gemini New session:** start from an active Gemini tab with `/u/<n>/`; confirm the computed home retains that prefix. After the first send, confirm link capture and the second image in the same chat. Two outputs must be under `Output/gemini/`, with real PNG format for PNG targets.
2. **Gemini Existing session:** remove one output and rerun with the retained link; only the missing image runs.
3. **ChatGPT New/Existing:** repeat both checks with `Output/chatgpt/`.
4. **Download-only retry:** reduce Download timeout during a run, for example to 3s. Observe the download-only retry event and confirm no new prompt is sent.
5. **Stop:** stop during Download original. A source file arriving afterward must not be moved or renamed into Output by that cancelled attempt.
6. **All saved:** rerun with all outputs present; setup shows **All N images already saved**.
7. **Wrong platform URL:** paste a Gemini chat URL while ChatGPT is selected; confirm the error and **Switch to Gemini** action.
8. **Expired directory access:** revoke Output permission; readiness offers **Allow again**, and granting access restores readiness.

Real authenticated site runs, non-English site UI, changing ChatGPT paste behavior and long service-worker lifetime remain manual checks. Test results and fixture evidence should not claim these were verified unless they actually were.
