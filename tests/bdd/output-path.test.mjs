import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBddIt } from "./_bddSteps.mjs";
import { platformSubdir, taskKey } from "../../src/utils/outputPath.js";

const bddIt = createBddIt(it);

describe("Platform output paths (BDD)", () => {
  bddIt("Given either platform, When choosing an output subdirectory, Then its stable platform id is used", () => {
    assert.equal(platformSubdir("chatgpt"), "chatgpt");
    assert.equal(platformSubdir("gemini"), "gemini");
  });

  bddIt("Given equivalent safe task names, When building keys, Then the key ignores case and includes the platform", () => {
    assert.equal(taskKey("gemini", "A.png"), "gemini:a.png");
    assert.equal(taskKey("gemini", "A.png"), taskKey("gemini", "a.PNG"));
    assert.equal(taskKey("gemini", "a b"), "gemini:a_b.png");
    assert.notEqual(taskKey("gemini", "a.png"), taskKey("chatgpt", "a.png"));
  });
});
