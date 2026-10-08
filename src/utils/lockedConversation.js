import { detectPlatform, normalizeSessionUrl, sessionUrlsMatch, validateSessionUrl } from "./platforms.js";

export const normalizeUrlForCompare = normalizeSessionUrl;
export const urlsMatch = sessionUrlsMatch;
export const isGeminiHost = (hostname) => detectPlatform(`https://${hostname}/`) === "gemini";

export const validateLockedConversationUrl = (url, t) => {
  const result = validateSessionUrl(url, "gemini", (key) => key);
  if (result.ok) return { ok: true };
  const key = {
    empty: "validation.lockedUrl.invalid",
    invalid: "validation.lockedUrl.invalid",
    "wrong-platform": "validation.lockedUrl.mustGemini",
    home: "validation.lockedUrl.mustSpecificConversation",
    "not-conversation": "validation.lockedUrl.mustConversation"
  }[result.code];
  return { ok: false, message: t(key) };
};
