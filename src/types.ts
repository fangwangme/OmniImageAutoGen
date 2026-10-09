export type TaskItem = {
  name: string;
  prompt: string;
};

export type PlatformId = "chatgpt" | "gemini";
export type SessionMode = "new" | "existing";
export type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
export type StageId = "open-session" | "image-mode" | "send-prompt" | "generate" | "download" | "save";
export type StageStatus = "todo" | "active" | "done" | "reused" | "skipped";
export type TaskOutcome = "saved" | "skipped-exists" | "skipped-warning" | "failed";
