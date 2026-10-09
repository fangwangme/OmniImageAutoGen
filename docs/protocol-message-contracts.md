# Runtime message contracts

Background routes filesystem/control requests and relays content logs. Content reports task state via runtime broadcasts. Sidepanel accepts task updates only for its active queue index and attempt sequence.

## Shared types

```ts
type PlatformId = "chatgpt" | "gemini";
type TaskErrorType = "generation" | "download" | "folder" | "locked-url";
type TaskScope = { taskIndex: number; taskRunSeq: number };
type StageId = "open-session" | "image-mode" | "send-prompt" | "generate" | "download" | "save";
type StageStatus = "todo" | "active" | "done" | "reused" | "skipped";
```

Task-originated requests/reports include `TaskScope`. Background retains that scope in the download arm and relayed logs.

## Filesystem and control requests

Every request below includes its `action`.

| Action | Sender | Additional request fields | Response |
| --- | --- | --- | --- |
| `CHECK_FILE_EXISTS` | Content/panel | `platform, filename` | `{exists}` or `{exists:false,error,errorType}` |
| `LIST_ALL_FILES` | Panel | `platform` | `{files:string[]}`; failures also carry error/type |
| `FOLDER_STATUS` | Panel | none | `{source:{name?,state},output:{name?,state}}` |
| `DOWNLOAD_ARM` | Content | `platform,targetFilename,taskIndex,taskRunSeq` | `{ok:true,armId}` or `{ok:false,error,errorType}` |
| `WAIT_AND_SAVE` | Content | `armId` | `{success:true,filename}` or `{success:false,error,errorType,cancelled?}` |
| `DOWNLOAD_CANCEL` | Panel | `reason` | `{ok:true}` |
| `OPEN_OPTIONS` | Panel | none | Opens Options |
| `RESET_STATE` | Panel/Options | none | `{success:true}`; cancels arm and resets hash |

Folder `state` is `granted | prompt | denied | missing`. Status reads never prompt for access. Output lookup uses `Output/<platform>/`; a missing subdirectory is an empty result and is not created during lookup.

An arm response guarantees the pre-click source baseline is ready. An unknown, stale or already-waiting arm ID cannot start another wait.

## Task reports

```ts
type TaskStage = TaskScope & {
  action: "TASK_STAGE";
  stage: StageId;
  status: StageStatus;
  meta?: string;
};
type TaskComplete = TaskScope & {
  action: "TASK_COMPLETE";
  skipped: boolean;
  skipReason?: "exists" | "warning";
  warningExcerpt?: string;
};
type TaskError = TaskScope & {
  action: "TASK_ERROR";
  error: string;
  errorType?: TaskErrorType;
};
type UpdateStatus = TaskScope & {
  action: "UPDATE_STATUS";
  status: string;
  isError?: boolean;
};
```

Content reports image/send/generation/download stages; background reports save active/done. The panel owns open-session timing. Advancing an active stage completes the previous active stage and records its duration.

Non-skipped completion is accepted only after a platform output existence check, with a 10-second post-check timeout. Missing output or timeout enters download error policy.

## Log relay and warning reload

`LOG` carries `level,message,data?,source,event?,verbose?` plus task scope. Background replies `{ok:true}` and broadcasts `PANEL_LOG` with the same fields and a timestamp.

Levels include `info,ok,warn,error`; legacy diagnostic `log` maps to info in panel storage. Short event lines are visible. Verbose diagnostics are hidden in the log card but included when copying logs. The panel stores at most 2,000 entries and filters Issues to non-verbose warn/error entries.

`RELOAD_WARNING_PATTERNS` is sent to tabs matching both supported platform domains after custom rules change. Content initializes listeners only after confirming the current task scope.

## Isolation and cancellation

Each attempt has a monotonic sequence in storage and the injected module query string. Content compares the expected sequence and a fresh storage snapshot before replacing a controller. Background validates scope before arming; panel checks task reports and scoped logs before rendering.

Stop, Reset, task errors and watchdog expiry cancel the arm and invalidate current task context. Async panel transitions check their run identity after waits. Late completion, error, stage or initialization work cannot advance a later run.

Error semantics are session mismatch `locked-url`, directory access `folder`, download/save `download`, and reply/generation `generation`. See [retry policy](timeout-and-retry-model.md).
