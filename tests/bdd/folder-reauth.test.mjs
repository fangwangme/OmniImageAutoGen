import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBddIt } from "./_bddSteps.mjs";
import { canReauthorizeHandle } from "../../src/utils/folderReauth.js";

const bddIt = createBddIt(it);

describe("Folder re-authorization logic (BDD)", () => {
  bddIt("Given a handle in prompt state, When checking re-authorization, Then it can be re-authorized in place", () => {
    assert.equal(canReauthorizeHandle("prompt", true), true);
  });

  bddIt("Given a handle in granted state, When checking re-authorization, Then no re-authorization is needed", () => {
    assert.equal(canReauthorizeHandle("granted", true), false);
  });

  bddIt("Given a folder in missing or denied state without handle, When checking re-authorization, Then it cannot be re-authorized in place", () => {
    assert.equal(canReauthorizeHandle("missing", false), false);
    assert.equal(canReauthorizeHandle("prompt", false), false);
    assert.equal(canReauthorizeHandle("denied", true), false);
  });
});
