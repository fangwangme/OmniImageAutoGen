import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBddIt } from "./_bddSteps.mjs";
import { computeReadiness } from "../../src/utils/readiness.js";

const bddIt = createBddIt(it);
const input = () => ({ platform: "gemini", sessionMode: "existing", sessionValidation: { ok: true, platform: "gemini", accountPrefix: "" }, tasksState: { hasFile: true, tasks: [{ name: "a.png", prompt: "A" }], issues: [] }, folderStatus: { source: { state: "granted", name: "Downloads" }, output: { state: "granted", name: "Output" } } });

describe("Run readiness (BDD)", () => {
  bddIt("Given a valid session, tasks and authorized folders, When checking readiness, Then the run is ready", () => {
    assert.deepEqual(computeReadiness(input()), { ready: true, issues: [] });
  });

  bddIt("Given an invalid existing session, When checking readiness, Then the session category blocks the run", () => {
    assert.deepEqual(computeReadiness({ ...input(), sessionValidation: { ok: false, code: "home", message: "home" } }), { ready: false, issues: ["session"] });
  });

  bddIt("Given new session mode and no valid chat URL, When checking readiness, Then the URL does not block the run", () => {
    assert.deepEqual(computeReadiness({ ...input(), sessionMode: "new", sessionValidation: { ok: false, code: "empty", message: "empty" } }), { ready: true, issues: [] });
  });

  bddIt("Given missing files, fatal JSON, empty tasks or item issues, When checking readiness, Then prompts block the run", () => {
    for (const tasksState of [{ hasFile: false, tasks: [{ name: "a.png", prompt: "A" }], issues: [] }, { hasFile: true, fatal: "not-array" }, { hasFile: true, tasks: [], issues: [] }, { hasFile: true, tasks: [{ name: "a.png", prompt: "A" }], issues: [{ index: 2, code: "prompt-empty" }] }]) assert.deepEqual(computeReadiness({ ...input(), tasksState }).issues, ["prompts"]);
  });

  bddIt("Given expired or missing folder permissions, When checking readiness, Then source and output categories are reported", () => {
    for (const state of ["prompt", "denied", "missing"]) assert.deepEqual(computeReadiness({ ...input(), folderStatus: { source: { state }, output: { state } } }).issues, ["source", "output"]);
  });

  bddIt("Given all categories are invalid, When checking readiness, Then the issue order is session, prompts, source, output", () => {
    assert.deepEqual(computeReadiness({ ...input(), sessionValidation: undefined, tasksState: { hasFile: false, tasks: [], issues: [] }, folderStatus: { source: { state: "missing" }, output: { state: "denied" } } }), { ready: false, issues: ["session", "prompts", "source", "output"] });
  });
});
