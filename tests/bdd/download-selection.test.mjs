import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBddIt } from "./_bddSteps.mjs";
import { isImageFilename, selectDownloadCandidate } from "../../src/utils/downloadSelection.js";

const bddIt = createBddIt(it);
const entry = (name, lastModified) => ({ name, lastModified, size: 100 });
const select = (entries, baseline = new Set(), toleranceMs = 2000) => selectDownloadCandidate({ entries, baseline, clickTime: 10000, toleranceMs });

describe("Download candidate selection (BDD)", () => {
  bddIt("Given a pre-click baseline file and a newly arrived image, When scanning, Then the baseline file is excluded", () => {
    assert.deepEqual(select([entry("old.png", 11000), entry("new.jpg", 10000)], new Set(["old.png"])), entry("new.jpg", 10000));
  });

  bddIt("Given files before and within the click tolerance, When scanning, Then only the tolerance-boundary file is eligible", () => {
    assert.equal(select([entry("too-old.png", 7999)]), null);
    assert.deepEqual(select([entry("accepted.png", 8000)]), entry("accepted.png", 8000));
    assert.equal(select([entry("outside.png", 9500)], new Set(), 100), null);
  });

  bddIt("Given multiple candidates, When selecting the newest, Then modification time wins and names break ties", () => {
    assert.deepEqual(select([entry("z.jpg", 10000), entry("a.png", 11000), entry("z.png", 11000)]), entry("z.png", 11000));
  });

  bddIt("Given partial downloads and non-images, When scanning, Then those entries cannot be selected", () => {
    assert.equal(select([entry("image.png.crdownload", 10000), entry("notes.txt", 11000)]), null);
    assert.equal(isImageFilename("image.JPEG"), true);
    assert.equal(isImageFilename("image.WEBP"), true);
    assert.equal(isImageFilename("Unconfirmed.crdownload"), false);
  });

  bddIt("Given no eligible entries, When scanning, Then no candidate is returned", () => {
    assert.equal(select([]), null);
    assert.equal(select([entry("old.png", 10000)], new Set(["old.png"])), null);
  });
});
