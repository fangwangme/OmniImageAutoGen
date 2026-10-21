import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBddIt } from "./_bddSteps.mjs";
import { detectPlatform, getGeminiAccountPrefix, isConversationUrl, isHomeUrl, buildHomeUrl, validateSessionUrl, normalizeSessionUrl, sessionUrlsMatch } from "../../src/utils/platforms.js";

const bddIt = createBddIt(it);
const t = (key) => key;
const chatId = "12345678-1234-1234-1234-123456789abc";

describe("Platform and session URLs (BDD)", () => {
  bddIt("Given platform and unrelated URLs, When detecting the host, Then only exact supported hosts are identified", () => {
    assert.equal(detectPlatform("https://chatgpt.com/"), "chatgpt");
    assert.equal(detectPlatform("https://gemini.google.com/app"), "gemini");
    assert.equal(detectPlatform("https://test.gemini.google.com/app"), "gemini");
    assert.equal(detectPlatform("https://example.com/"), null);
    assert.equal(detectPlatform("https://gemini.google.com.example.com/"), null);
    assert.equal(detectPlatform("invalid"), null);
  });

  bddIt("Given Gemini chats with and without account prefixes, When validating, Then each chat and its account are accepted", () => {
    assert.deepEqual(validateSessionUrl("https://gemini.google.com/u/2/app/abc", "gemini", t), { ok: true, platform: "gemini", accountPrefix: "/u/2" });
    assert.deepEqual(validateSessionUrl("https://gemini.google.com/app/abc", "gemini", t), { ok: true, platform: "gemini", accountPrefix: "" });
    assert.equal(getGeminiAccountPrefix("https://gemini.google.com/u/17/app/abc"), "/u/17");
    assert.equal(getGeminiAccountPrefix("https://gemini.google.com/u/not-a-number/app/abc"), "");
  });

  bddIt("Given standard and custom GPT chats, When validating, Then both ChatGPT conversation routes are accepted", () => {
    assert.equal(validateSessionUrl(`https://chatgpt.com/c/${chatId}`, "chatgpt", t).ok, true);
    assert.equal(validateSessionUrl(`https://chatgpt.com/g/g-123/c/${chatId}`, "chatgpt", t).ok, true);
    assert.equal(isConversationUrl("chatgpt", "https://chatgpt.com/c/"), false);
    assert.equal(isConversationUrl("gemini", "https://gemini.google.com/app/a/b"), false);
  });

  bddIt("Given either platform home page, When validating it as an existing session, Then the home error is returned", () => {
    assert.equal(validateSessionUrl("https://gemini.google.com/app", "gemini", t).code, "home");
    assert.equal(validateSessionUrl("https://chatgpt.com/", "chatgpt", t).code, "home");
  });

  bddIt("Given a ChatGPT chat while Gemini is selected, When validating, Then the detected platform is available for switching", () => {
    const result = validateSessionUrl(`https://chatgpt.com/c/${chatId}`, "gemini", t);
    assert.equal(result.code, "wrong-platform");
    assert.equal(result.detectedPlatform, "chatgpt");
    assert.equal(result.message, "validation.sessionUrl.wrongPlatform");
    assert.equal(validateSessionUrl("https://example.com/app/abc", "gemini", t).detectedPlatform, null);
  });

  bddIt("Given empty, malformed and non-chat paths, When validating in order, Then their specific error codes are returned", () => {
    assert.equal(validateSessionUrl("  ", "gemini", t).code, "empty");
    assert.equal(validateSessionUrl("not-a-url", "gemini", t).code, "invalid");
    assert.equal(validateSessionUrl("https://gemini.google.com/settings", "gemini", t).code, "not-conversation");
  });

  bddIt("Given an active tab, When building a new home URL, Then only Gemini account prefixes are carried forward", () => {
    assert.equal(buildHomeUrl("gemini", "https://gemini.google.com/u/2/app/x"), "https://gemini.google.com/u/2/app");
    assert.equal(buildHomeUrl("gemini", "https://example.com/u/2/app/x"), "https://gemini.google.com/app");
    assert.equal(buildHomeUrl("gemini"), "https://gemini.google.com/app");
    assert.equal(buildHomeUrl("chatgpt", "https://gemini.google.com/u/2/app/x"), "https://chatgpt.com/");
  });

  bddIt("Given query, hash and trailing slash differences, When comparing sessions, Then the same path matches and another chat does not", () => {
    assert.equal(normalizeSessionUrl("https://gemini.google.com/u/2/app/abc/?q=1#x"), "https://gemini.google.com/u/2/app/abc");
    assert.equal(sessionUrlsMatch("https://gemini.google.com/app/abc/?q=1#x", "https://gemini.google.com/app/abc"), true);
    assert.equal(sessionUrlsMatch("https://gemini.google.com/app/abc", "https://gemini.google.com/app/def"), false);
  });

  bddIt("Given platform home routes and conversation routes, When checking home status, Then only supported home paths match", () => {
    for (const path of ["/", "/app", "/app/", "/u/2/app", "/u/2/app/", "/u/2/"]) assert.equal(isHomeUrl("gemini", `https://gemini.google.com${path}?x=1#y`), true);
    assert.equal(isHomeUrl("chatgpt", "https://chatgpt.com/?x=1#y"), true);
    assert.equal(isHomeUrl("gemini", "https://gemini.google.com/app/abc"), false);
    assert.equal(isHomeUrl("chatgpt", `https://chatgpt.com/c/${chatId}`), false);
    assert.equal(isHomeUrl("gemini", "https://chatgpt.com/"), false);
  });
});
