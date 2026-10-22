import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBddIt } from "./_bddSteps.mjs";
import { isTabNavigationComplete } from "../../src/utils/tabNavigationGuard.js";

const bddIt = createBddIt(it);

describe("Tab navigation guard (BDD)", () => {
  bddIt("Given a tab with status complete but URL about:blank, When checking navigation, Then it is not complete", () => {
    assert.equal(isTabNavigationComplete("about:blank", "gemini", "complete"), false);
    assert.equal(isTabNavigationComplete("", "chatgpt", "complete"), false);
  });

  bddIt("Given a tab on ChatGPT with loading status, When checking navigation, Then it is not complete", () => {
    assert.equal(isTabNavigationComplete("https://chatgpt.com/", "chatgpt", "loading"), false);
  });

  bddIt("Given a tab on Gemini with complete status and valid platform URL, When checking navigation, Then it is complete", () => {
    assert.equal(isTabNavigationComplete("https://gemini.google.com/app", "gemini", "complete"), true);
    assert.equal(isTabNavigationComplete("https://gemini.google.com/u/1/app", "gemini", "complete"), true);
  });

  bddIt("Given a tab on ChatGPT with complete status and valid platform URL, When checking navigation, Then it is complete", () => {
    assert.equal(isTabNavigationComplete("https://chatgpt.com/", "chatgpt", "complete"), true);
    assert.equal(isTabNavigationComplete("https://chatgpt.com/c/123-abc", "chatgpt", "complete"), true);
  });

  bddIt("Given a tab with mismatching platform host, When checking navigation, Then it is not complete", () => {
    assert.equal(isTabNavigationComplete("https://chatgpt.com/", "gemini", "complete"), false);
    assert.equal(isTabNavigationComplete("https://accounts.google.com/signin", "gemini", "complete"), false);
  });
});
