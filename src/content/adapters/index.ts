import type { PlatformId } from "../../types.js";
import { createChatGPTAdapter } from "./chatgpt.js";
import { createGeminiAdapter } from "./gemini.js";
import type { PlatformAdapter, Translator } from "./types.js";

export const getAdapter = (platform: PlatformId, t: Translator, signal?: AbortSignal): PlatformAdapter =>
  platform === "chatgpt" ? createChatGPTAdapter(t, signal) : createGeminiAdapter(t, signal);
