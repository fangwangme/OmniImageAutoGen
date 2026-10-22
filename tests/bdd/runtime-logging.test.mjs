import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBddIt } from "./_bddSteps.mjs";
import { filterDisplayLogs } from "../../src/utils/logFiltering.js";

const bddIt = createBddIt(it);

describe("Runtime log filtering (BDD)", () => {
  const sampleLogs = [
    { level: "info", message: "Task 1 started", verbose: false },
    { level: "info", message: "[Content] Injected and checking page", verbose: true },
    { level: "warn", message: "Waiting for input field", verbose: false },
    { level: "error", message: "Send button timeout", verbose: false }
  ];

  bddIt("Given a mix of standard and verbose step logs, When filtering with 'all', Then verbose logs are not dropped", () => {
    const visible = filterDisplayLogs(sampleLogs, "all");
    assert.equal(visible.length, 4);
    assert.deepEqual(visible.map(e => e.message), [
      "Task 1 started",
      "[Content] Injected and checking page",
      "Waiting for input field",
      "Send button timeout"
    ]);
  });

  bddIt("Given a mix of logs, When filtering with 'issues', Then only warn and error logs are returned", () => {
    const visible = filterDisplayLogs(sampleLogs, "issues");
    assert.equal(visible.length, 2);
    assert.deepEqual(visible.map(e => e.message), [
      "Waiting for input field",
      "Send button timeout"
    ]);
  });
});
