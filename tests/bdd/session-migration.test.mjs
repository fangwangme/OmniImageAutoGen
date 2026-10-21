import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBddIt } from "./_bddSteps.mjs";
import { migrateLegacyState } from "../../src/utils/platforms.js";

const bddIt = createBddIt(it);

describe("Legacy session migration (BDD)", () => {
  bddIt("Given a valid legacy Gemini chat, When migrating, Then Gemini existing mode and its link replace the legacy key", () => {
    const url = "https://gemini.google.com/u/2/app/abc";
    assert.deepEqual(migrateLegacyState({ lockedConversationUrl: url }), { set: { ui_platform: "gemini", ui_sessionMode: "existing", sessionUrl_gemini: url }, remove: ["lockedConversationUrl"] });
  });

  bddIt("Given an existing new session key, When migrating a legacy key, Then the stored session is preserved", () => {
    assert.deepEqual(migrateLegacyState({ lockedConversationUrl: "https://gemini.google.com/app/old", sessionUrl_gemini: "https://gemini.google.com/app/new" }), { set: {}, remove: ["lockedConversationUrl"] });
  });

  bddIt("Given an invalid legacy value, When migrating, Then only the legacy key is removed", () => {
    for (const url of ["invalid", "", "https://gemini.google.com/app", "https://chatgpt.com/c/abc"]) assert.deepEqual(migrateLegacyState({ lockedConversationUrl: url }), { set: {}, remove: ["lockedConversationUrl"] });
  });

  bddIt("Given no legacy key, When migrating, Then no storage operations are needed", () => {
    assert.deepEqual(migrateLegacyState({ ui_platform: "chatgpt" }), { set: {}, remove: [] });
  });
});
