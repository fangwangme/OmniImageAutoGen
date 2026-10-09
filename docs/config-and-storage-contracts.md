# Configuration and storage contracts

The sidepanel owns task/session state, Options owns user settings, and content/background consume a task-scoped snapshot. Directory handles remain in IndexedDB. Settings save automatically.

## Local storage

| Key | Type/default | Owner and purpose |
| --- | --- | --- |
| `uiLanguage` | `en` or `zh`; default `en` | Options; UI/content translation |
| `logCollapsed` | boolean; default true | Panel setup log visibility |
| `loadedTasksRaw` | raw JSON array | Panel; validation is rerun on reopening |
| `loadedTasks` | validated `{name,prompt}[]` | Panel; extra task fields discarded |
| `loadedTasksFileName` | string | Prompts card title |
| `ui_platform` | `chatgpt` or `gemini`; default `gemini` | Selected platform |
| `ui_sessionMode` | `new` or `existing`; default `new` | Selected session mode |
| `sessionUrl_chatgpt`, `sessionUrl_gemini` | string | Per-platform existing-session input/captured URL |
| `settings_aspectRatio` | `1:1`, `3:4`, `4:3`, `9:16`, `16:9`; default `16:9` | Gemini page ratio; ChatGPT uses prompt |
| `sourceSubfolder`, `outputSubfolder` | string | Cached directory `handle.name`, never a full path |
| `custom_warning_patterns` | string[]; default []; maximum 50 | Additional text-warning patterns |
| `currentTask` | TaskItem or null | Current task; null invalidates active content |
| `currentTaskMode` | `full` or `download-only` | Current attempt mode |
| `currentTaskIndex` | number | Queue index for scoped messages |
| `currentTaskRunSeq` | number | Unique monotonic attempt sequence |
| `currentTaskPlatform` | PlatformId | Current task's platform |
| `currentSessionUrl` | string | Locked/captured chat URL, empty while pending |
| `currentSessionPending` | boolean | New session has not yet captured a chat link |
| `currentHomeUrl` | string | Home URL used while pending |
| `currentTaskAttempt` | number, starting at 1 | Current attempt label |

## Timing and retry defaults

All timing values are seconds; retry/failure values are counts.

| Key | Default |
| --- | ---: |
| `settings_generationTimeout` | 120 |
| `settings_downloadTimeout` | 120 |
| `settings_pageLoadTimeout` | 30 |
| `settings_inputTimeout` | 5 |
| `settings_stepDelay` | 1 |
| `settings_taskInterval` | 5 |
| `settings_pollInterval` | 1 |
| `settings_maxRetries` | 3 |
| `settings_maxConsecutiveFailures` | 5 |

The existing fallback reads for `settings_inputPollInterval`, `settings_sendPollInterval`, `settings_generationPollInterval`, `settings_downloadPollInterval` and `settings_downloadStabilityInterval` remain supported. Options removes those legacy keys on timing save, along with obsolete `settings_downloadDetectTimeout` and `settings_downloadStabilityTimeout`.

Content reads settings per injection; background reads download/poll settings for each wait. The panel reads watchdog settings for each attempt, and updates the running download observation label when its timeout setting changes.

## Session migration

A valid Gemini `lockedConversationUrl` migrates to:

```ts
{ ui_platform: "gemini", ui_sessionMode: "existing", sessionUrl_gemini: legacyUrl }
```

An existing `sessionUrl_gemini` is preserved. Invalid legacy values are discarded. The old key is removed in every migration where it exists.

## IndexedDB compatibility

The database remains `GeminiAutoGenDB`, version 4, store `handles`. Handle keys remain `sourceHandle` and `outputHandle`. Directory selection uses picker IDs `gemini-autogen-source` and `gemini-autogen-output`.

Status queries call `queryPermission({mode:"readwrite"})` without prompting. User-initiated **Allow again** requests read/write permission. Output lookup does not create a missing platform directory; successful saving creates it.

## Reset

Reset cancels active downloads, invalidates content context and clears `chrome.storage.local`, then sends `RESET_STATE`. Background resets the active arm and previous-image hash. IDB handles, source directories and output images are retained.

Options cancels pending timing/warning saves and uses an epoch to reject delayed writes. The panel cancels pending URL saves and handles externally cleared storage without a recursive reset loop.
