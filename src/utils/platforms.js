export const PLATFORM_IDS = ["chatgpt", "gemini"];

export const PLATFORMS = {
  chatgpt: {
    id: "chatgpt", label: "ChatGPT", host: "chatgpt.com", badge: "C",
    brandColor: "#0E6E5C", conversationHint: "/c/…", defaultHome: "https://chatgpt.com/"
  },
  gemini: {
    id: "gemini", label: "Gemini", host: "gemini.google.com", badge: "G",
    brandColor: "#5B3FD0", conversationHint: "/app/…", defaultHome: "https://gemini.google.com/app"
  }
};

const parseUrl = (url) => {
  try { return new URL(url); } catch { return null; }
};

export const detectPlatform = (url) => {
  const parsed = parseUrl(url);
  if (!parsed) return null;
  if (parsed.hostname === "chatgpt.com") return "chatgpt";
  if (parsed.hostname === "gemini.google.com" || parsed.hostname.endsWith(".gemini.google.com")) return "gemini";
  return null;
};

export const getGeminiAccountPrefix = (url) =>
  parseUrl(url)?.pathname.match(/^\/u\/(\d+)(\/|$)/)?.[0].replace(/\/$/, "") || "";

const platformPath = (platform, url) => {
  const pathname = parseUrl(url)?.pathname || "";
  return platform === "gemini" ? pathname.slice(getGeminiAccountPrefix(url).length) : pathname;
};

export const isConversationUrl = (platform, url) => {
  if (detectPlatform(url) !== platform) return false;
  const path = platformPath(platform, url).replace(/\/$/, "");
  return platform === "gemini"
    ? /^\/app\/[A-Za-z0-9_-]+$/.test(path)
    : /^(\/g\/[^/]+)?\/c\/[A-Za-z0-9-]+$/.test(path);
};

export const isHomeUrl = (platform, url) => {
  if (detectPlatform(url) !== platform) return false;
  const path = platformPath(platform, url);
  return platform === "gemini"
    ? ["/app", "/app/", "/"].includes(path)
    : ["/", ""].includes(path);
};

export const buildHomeUrl = (platform, activeTabUrl) => platform === "gemini"
  ? `https://gemini.google.com${detectPlatform(activeTabUrl) === "gemini" ? getGeminiAccountPrefix(activeTabUrl) : ""}/app`
  : PLATFORMS.chatgpt.defaultHome;

export const validateSessionUrl = (url, platform, t) => {
  const definition = PLATFORMS[platform];
  const vars = { platform: definition.label, label: definition.label, hint: `${definition.host}${definition.conversationHint}` };
  const fail = (code, key, extra = {}) => ({ ok: false, code, message: t(key, vars), ...extra });
  if (!url.trim()) return fail("empty", "validation.sessionUrl.empty");
  if (!parseUrl(url)) return fail("invalid", "validation.sessionUrl.invalid");
  const detectedPlatform = detectPlatform(url);
  if (detectedPlatform !== platform) {
    vars.detected = detectedPlatform ? PLATFORMS[detectedPlatform].label : "";
    return fail("wrong-platform", "validation.sessionUrl.wrongPlatform", { detectedPlatform });
  }
  if (isHomeUrl(platform, url)) return fail("home", "validation.sessionUrl.home");
  if (!isConversationUrl(platform, url)) return fail("not-conversation", "validation.sessionUrl.notConversation");
  return { ok: true, platform, accountPrefix: platform === "gemini" ? getGeminiAccountPrefix(url) : "" };
};

export const normalizeSessionUrl = (url) => {
  const parsed = parseUrl(url);
  return parsed ? `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}` : url.replace(/\/$/, "");
};

export const sessionUrlsMatch = (a, b) => normalizeSessionUrl(a) === normalizeSessionUrl(b);

export const migrateLegacyState = (stored) => {
  if (!Object.prototype.hasOwnProperty.call(stored, "lockedConversationUrl")) return { set: {}, remove: [] };
  const remove = ["lockedConversationUrl"];
  const url = stored.lockedConversationUrl;
  if (Object.prototype.hasOwnProperty.call(stored, "sessionUrl_gemini") || typeof url !== "string" || !isConversationUrl("gemini", url)) return { set: {}, remove };
  return { set: { ui_platform: "gemini", ui_sessionMode: "existing", sessionUrl_gemini: url }, remove };
};
