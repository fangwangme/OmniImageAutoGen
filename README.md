# OmniImageAutoGen

[English](README.md) | [简体中文](README.zh-CN.md)

A Chrome extension for batch image generation on ChatGPT and Gemini. Choose one platform, load a JSON task file, and generate images serially in one conversation. Full-size native downloads are saved with your filenames under `Output/<platform>/`.

![Screenshot](docs/images/image-en.png)

## Features

- ChatGPT and Gemini, with one platform per run.
- New sessions with automatic chat-link capture, or existing sessions supplied by URL.
- JSON validation for missing fields, reserved filenames and names that collide after sanitizing, ignoring case.
- Skip existing outputs and rerun only missing images.
- Native image downloads, with real PNG/JPEG transcoding to match the target extension.
- Gemini aspect ratio selection; ChatGPT uses the ratio in your prompt.
- Per-image retries, download-only recovery and a task watchdog.
- Stage progress, elapsed/remaining time and logs with copy/clear controls.
- Settings that save automatically, English/简体中文 and system light/dark themes.
- Locally bundled fonts and no remote UI assets.

## Installation

Download a release ZIP from [Releases](https://github.com/fangwangme/OmniImageAutoGen/releases), extract it, then load the extracted folder in Chrome's `chrome://extensions/` with **Developer mode** enabled.

To build from source:

```bash
git clone https://github.com/fangwangme/OmniImageAutoGen.git
cd OmniImageAutoGen
bun install
bun run build
```

In `chrome://extensions/`, choose **Load unpacked** and select `.local/dist`. Click the extension icon to open its side panel.

## Before running

1. Sign in to the selected platform in Chrome.
2. In Chrome's download settings, turn off **Ask where to save each file before downloading**.
3. Open the extension's **Settings**. Set **Source folder** to Chrome's automatic download directory and **Output folder** to the final destination.
4. Grant read/write access to both directories. The extension displays directory names, such as `Downloads` and `Output`.
5. Set the language, aspect ratio and timeouts as needed. Changes save automatically.

The output directory gets separate `chatgpt/` and `gemini/` subdirectories. A download's source file is removed only after the output has been written and verified. Reset preserves directory handles and output images.

## Usage

Prepare a JSON array:

```json
[
  { "name": "sunset_beach.png", "prompt": "Editorial illustration, 16:9. A beach at sunset." },
  { "name": "mountain_lake.jpg", "prompt": "Editorial illustration, 16:9. A mountain lake." }
]
```

Each item needs non-empty string `name` and `prompt` fields. Additional fields, such as `timestamp` and `subtitle_ref`, are ignored. Prompts are sent unchanged as `name: <safe filename>\nprompt: <original prompt>`.

1. Choose **ChatGPT** or **Gemini**.
2. Choose **New session** or **Existing session**. New sessions open the platform home page; Gemini carries over an account prefix such as `/u/<n>/` from the active tab. Existing sessions need a specific chat URL for the chosen platform.
3. Choose your JSON file and fix any reported issues.
4. Check folder permissions, then click **Start**.
5. Watch generation, download and save progress. **Stop** cancels the current attempt.
6. On completion, copy the captured chat link or choose **Run the remaining** to retry missing outputs in that conversation.

The extension recreates its tab between tasks and retries. Existing output names are compared without case sensitivity. Gemini's ratio setting changes the page control; ChatGPT relies on the ratio expressed in the prompt.

## Troubleshooting

- **Not ready:** fix the session link, task file or directory permissions listed by the readiness check. Use **Allow again** when access has expired.
- **Download timeout:** check that Source matches Chrome's download directory and that Chrome does not ask where to save. Native downloads can take time; the default download budget is 120 seconds.
- **Chat link was not captured:** open the platform chat and copy a specific conversation URL into **Existing session**.
- **Repeated generation failures:** check the site's current UI and the task's prompt, then copy the log for diagnosis.
- **All images already saved:** outputs already exist in the selected platform's subdirectory.
- **Reset all:** clears loaded tasks, settings and stored session links. It cancels active work and keeps directory handles and output files.

See [technical documentation](docs/README.md), [architecture](docs/ARCHITECTURE.md) and the [dual-platform specification](docs/specs/dual-platform.md).

## Development

```bash
bun run typecheck
bun run build
bun run test:bdd:quiet
```

Build output is `.local/dist`; local preview evidence and release bundles belong under `.local/`. See [testing and quality](docs/testing-and-quality.md) for preview and manual acceptance steps.

## License and contributions

MIT License. Issues and pull requests are welcome at [OmniImageAutoGen](https://github.com/fangwangme/OmniImageAutoGen).
