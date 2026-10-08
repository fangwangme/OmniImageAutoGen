import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBddIt } from "./_bddSteps.mjs";
import { validateTasks } from "../../src/utils/taskValidation.js";

const bddIt = createBddIt(it);

describe("Task JSON validation (BDD)", () => {
  bddIt("Given JSON that is not an array, When validating, Then a fatal error prevents loading", () => {
    for (const raw of [null, {}, "tasks", 1]) assert.deepEqual(validateTasks(raw), { fatal: "not-array" });
  });

  bddIt("Given primitive, null and array items, When validating, Then each receives its one-based not-object issue", () => {
    assert.deepEqual(validateTasks([null, [], 1]).issues, [{ index: 1, code: "not-object" }, { index: 2, code: "not-object" }, { index: 3, code: "not-object" }]);
  });

  bddIt("Given missing and empty task fields, When validating, Then each field issue uses the source item index", () => {
    const result = validateTasks([{ name: "ok.png", prompt: "" }, { prompt: "scene" }, { name: "  ", prompt: "scene" }, { name: "another.png" }, { name: "last.png", prompt: "  " }]);
    assert.deepEqual(result.issues.map(({ index, code }) => ({ index, code })), [{ index: 1, code: "prompt-empty" }, { index: 2, code: "name-missing" }, { index: 3, code: "name-empty" }, { index: 4, code: "prompt-missing" }, { index: 5, code: "prompt-empty" }]);
    assert.equal(result.tasks.length, 0);
  });

  bddIt("Given task names differing only in case, When validating, Then the second name collides with the first item", () => {
    const result = validateTasks([{ name: "A.png", prompt: "A" }, { name: "a.PNG", prompt: "B" }, { name: "a.png", prompt: "C" }]);
    assert.deepEqual(result.issues, [{ index: 2, code: "name-collision", field: "name", name: "a.PNG", otherIndex: 1 }, { index: 3, code: "name-collision", field: "name", name: "a.png", otherIndex: 1 }]);
    assert.deepEqual(result.tasks, [{ name: "A.png", prompt: "A" }]);
  });

  bddIt("Given unsafe names that normalize alike, When validating, Then collisions use the existing safe filename rules", () => {
    const result = validateTasks([{ name: "a b", prompt: "A" }, { name: "a?b.png", prompt: "B" }]);
    assert.equal(result.issues[0].code, "name-collision");
    assert.equal(result.issues[0].otherIndex, 1);
    assert.equal(result.issues[0].name, "a_b.png");
  });

  bddIt("Given Windows reserved base names, When validating, Then those items cannot enter the task queue", () => {
    for (const name of ["CON.png", "prn.jpg", "AUX.scene.png", "NUL", "COM1.png", "COM9.png", "LPT1.png", "LPT9.png"]) assert.equal(validateTasks([{ name, prompt: "scene" }]).issues[0].code, "name-reserved");
    assert.equal(validateTasks([{ name: "COM10.png", prompt: "scene" }]).issues.length, 0);
  });

  bddIt("Given optional task metadata and an invalid middle item, When validating, Then valid items retain original strings and source order", () => {
    const result = validateTasks([{ name: "0000_000.png", prompt: "  Editorial illustration, 16:9. [VISUAL]: A coast.  ", timestamp: "00:00", subtitle_ref: "s1" }, { name: "broken.png", prompt: "" }, { name: "0007_980.png", prompt: "Editorial illustration, 16:9. [VISUAL]: A ship.", subtitle_range: [1, 2] }]);
    assert.deepEqual(result.tasks, [{ name: "0000_000.png", prompt: "  Editorial illustration, 16:9. [VISUAL]: A coast.  " }, { name: "0007_980.png", prompt: "Editorial illustration, 16:9. [VISUAL]: A ship." }]);
    assert.equal(result.total, 3);
    assert.equal(result.issues[0].index, 2);
  });
});
