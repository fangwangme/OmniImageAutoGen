# Selectors and DOM contracts

Selectors are centralized in `src/content/adapters/gemini.ts` and `chatgpt.ts`. Shared helpers in `dom.ts` implement visibility/enabled checks, normalized text, image loading, hover/click events, waits and Escape.

## Gemini

| Purpose | Primary contract |
| --- | --- |
| Composer | `.ql-editor.textarea[contenteditable="true"]`, with scoped editor/textbox fallbacks |
| Page ready | Document complete, visible composer and chat container/main, no visible loading spinner |
| Image mode | `button[aria-label="Upload & tools"]` (with localized `上传和工具` / `工具` fallbacks); Create image `button[role="menuitemcheckbox"]` (`Create images` / `创建图片` / `生成图片`) |
| Selected image mode | Visible `button[aria-label="Deselect Images"]` or menu item's `aria-checked="true"` |
| Ratio | `button[aria-label^="Aspect ratio"]` / `button[aria-label^="宽高比"]`; option `[role="menuitemradio"]` matching ratio via regex `/\b(1:1|3:4|4:3|9:16|16:9)\b/` |
| Send/stop | `Send message` / `Stop response` aria labels (with localized `发送消息` / `停止回答` fallbacks), with existing button fallbacks |
| User and reply | `user-query` and its closest `.conversation-container` |
| Generation | Reply's `model-response [aria-busy="true"]`, footer complete, loaded generated image |
| Download | Current container's `button[aria-label="Download full size image"]` (with `下载全尺寸图片` / `下载原图` fallbacks), with specific download-component fallbacks |

An already-selected image mode must not be clicked again. The ratio option is not assumed to be a button. Global historical `aria-busy` does not block page readiness.

History waiting gives an existing image priority: an unloaded last image keeps waiting even if warning text exists. When there is no image, a text-only reply settles history if it matches a warning pattern or its footer shows the reply is complete; otherwise a later task would wait for an image that never arrives.

Download lookup remains within the bound conversation container. It hovers the image overlay and clicks the native download button once.

## ChatGPT

| Purpose | Primary contract |
| --- | --- |
| Composer | `div.ProseMirror[contenteditable="true"]`, with composer textbox fallbacks |
| Image mode | Tools `button[aria-label="Add files and more"]` (with localized `添加文件等内容` / `附件` fallbacks); Create image `button[data-list-navigation-item]` (`Create image` / `创建图片`) |
| Selected image mode | Composer's `[data-inline-selection-pill][data-system-hint-type="picture_v2"]` |
| Send/stop | `button[aria-label="Send prompt"]` / `button[aria-label="Send"]` (localized `发送提示` / `发送`); stop `button[aria-label="Stop streaming"]` / `button[aria-label="Stop"]` (localized `停止`) |
| User message | `[data-user-message-bubble]`, read using `innerText` |
| Assistant markers | `h4[data-conversation-role="assistant"]`; blocks after the bound user and before the next user |
| Completion | Last paired turn's `data-talvt-turn-state="complete"` |
| Generated image | Paired blocks' `[data-testid="generated-image-preview"] img` |
| Viewer | A `[role="dialog"]` titled **Image preview** or **图片预览** |
| Viewer download/close | That dialog's `button[aria-label="Download"]` / `button[aria-label="下载"]` and `button[aria-label="Close"]` / `button[aria-label="关闭"]` / `button[aria-label="Close viewer"]` |

Prompt insertion preserves the composer image pill. A paste event is preferred, with insertText fallback; selecting all composer contents would remove the pill. Image mode is checked for each task because it may not survive sending/reopening.

Generated images are identified within paired assistant blocks, not by their alt text. The last preview in those blocks opens the specifically titled dialog; unrelated dialogs are excluded.

## Cross-platform invariants

- Capture user-message element references before sending.
- Confirm a new matching user message after the baseline; never click Send again after acknowledgment.
- Bind the reply to the name anchor, and choose the last matching user message for download-only retry.
- Loaded generated images have meaningful natural dimensions; unloaded nodes do not satisfy download readiness.
- Arm the source baseline before clicking a native download once per attempt.
- Hardcoded dynamic IDs, hash classes, blob URLs and absolute XPath are not selectors.
- Warning patterns inspect reply text without including the user's prompt.
- Missing image-mode controls warn and continue; missing bound download controls fail the task.

Adapters include bilingual English and Chinese selector fallbacks for primary buttons and dialogs. Other non-English site UI remains a manual compatibility check.
