# Background download pipeline

`src/background.ts` routes messages. `src/background/fsHandles.ts` owns handle access and platform output lookup; `src/background/downloadPipeline.ts` owns one cancellable download attempt.

## Arm before clicking

Content sends `DOWNLOAD_ARM` with platform, target filename, queue index and attempt sequence. Background rejects stale context before cancelling another arm. It waits for any prior save cleanup, rechecks scope and resolves both authorized directory handles.

Before replying, it records top-level source image filenames as a baseline and stores `armedAt = Date.now()`. Content clicks the platform's native download once only after receiving `{ok:true,armId}`.

## Wait and save

`WAIT_AND_SAVE {armId}` accepts the matching active arm once. Its single deadline is `armedAt + settings_downloadTimeout * 1000`.

1. Check cancellation and call `chrome.runtime.getPlatformInfo()` each polling round to help keep the service worker alive.
2. Scan top-level PNG/JPG/JPEG/WebP files. Ignore baseline names, temporary/non-image files and entries older than `armedAt - 2000ms`.
3. Choose the largest `lastModified`; break a tie with the lexicographically largest filename.
4. Enter the save stage. Wait for three consecutive positive, equal file-size readings, using the same deadline. A disappearing file returns to scanning.
5. Decode with `createImageBitmap`. Decode failure returns to scanning until timeout.
6. Compute SHA-256. A match with the previous successfully saved source invokes the preserved duplicate-image guard: delete that duplicate source and return a generation error.
7. Detect source MIME by magic bytes. Copy matching PNG/JPEG bytes; otherwise draw the bitmap onto `OffscreenCanvas` and encode to the target format. JPEG quality is 0.95.
8. Write `Output/<platform>/<safe target name>`, then close the stream.
9. Reopen the output and verify positive size, target magic bytes and successful decoding.
10. Check cancellation/deadline again, remove the native source file, update the last hash and report save done.

The target extension controls encoding: `.png` means PNG; `.jpg` means JPEG. No aspect ratio validation occurs after download.

## Cancellation and failed output cleanup

`DOWNLOAD_CANCEL`, Reset, task errors and watchdog expiry abort the active arm and writable stream. Guards run around async work, including conversion, writing and verification.

A newly created target that was never verified is removed during cleanup. Its source is retained for retry. Verified output is preserved. The next arm waits for cleanup before it can reuse a target name, preventing an old attempt from deleting a later attempt's output.

The duplicate-image guard is the preserved exception to retaining source files on failure; it deletes the identified duplicate.

## Filesystem endpoints

- `CHECK_FILE_EXISTS {platform,filename}`: case-insensitive filename lookup under that platform; absent directory means false.
- `LIST_ALL_FILES {platform}`: top-level output filenames; absent directory means [].
- `FOLDER_STATUS`: names and read/write permission states, without requesting access.
- `RESET_STATE`: cancel the current arm and reset in-memory duplicate state.

Folder/auth failures are `folder`; scanning, writing, timeout and verification failures are `download`; duplicate images are `generation`. See [message contracts](protocol-message-contracts.md).
