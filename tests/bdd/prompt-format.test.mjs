import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBddIt } from "./_bddSteps.mjs";
import { composeTaskPrompt, promptAnchor } from "../../src/utils/promptFormat.js";

const bddIt = createBddIt(it);

describe("Task prompt formatting (BDD)", () => {
  bddIt("Given a safe name and a prompt, When composing, Then only the name and original prompt lines are sent", () => {
    const result = composeTaskPrompt("0000_000.png", "X 16:9.");
    assert.equal(result, "name: 0000_000.png\nprompt: X 16:9.");
    assert.equal(result.includes("aspect ratio"), false);
    assert.equal(composeTaskPrompt("a.png", "  line one\nline two  "), "name: a.png\nprompt:   line one\nline two  ");
  });

  bddIt("Given a safe name, When building a reply anchor, Then the original name line is returned", () => {
    assert.equal(promptAnchor("0000_000.png"), "name: 0000_000.png");
  });
});
