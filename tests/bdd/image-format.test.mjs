import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBddIt } from "./_bddSteps.mjs";
import { targetMimeForFilename, sniffImageMime, decideSaveAction, targetExtLabel } from "../../src/utils/imageFormat.js";

const bddIt = createBddIt(it);

describe("Image format and save action (BDD)", () => {
  bddIt("Given PNG, JPEG and WebP magic bytes, When detecting the source format, Then each actual format is recognized", () => {
    assert.equal(sniffImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), "image/png");
    assert.equal(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff]).buffer), "image/jpeg");
    assert.equal(sniffImageMime(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), "image/webp");
    assert.equal(sniffImageMime(new Uint8Array([1, 2, 3, 4])), null);
    assert.equal(sniffImageMime(new ArrayBuffer(0)), null);
  });

  bddIt("Given a PNG target and either PNG or JPEG bytes, When choosing the save action, Then equal formats copy and different formats transcode", () => {
    assert.equal(decideSaveAction("image/jpeg", targetMimeForFilename("scene.png")), "transcode");
    assert.equal(decideSaveAction("image/png", targetMimeForFilename("scene.png")), "copy");
    assert.equal(decideSaveAction(null, "image/png"), "transcode");
    assert.equal(decideSaveAction("image/png", targetMimeForFilename("scene.jpg")), "transcode");
  });

  bddIt("Given target filename extensions, When choosing MIME and labels, Then JPG and PNG match the requested extension", () => {
    assert.equal(targetMimeForFilename("scene.jpg"), "image/jpeg");
    assert.equal(targetMimeForFilename("scene.JPEG"), "image/jpeg");
    assert.equal(targetMimeForFilename("scene.PNG"), "image/png");
    assert.equal(targetExtLabel("scene.JPG"), "JPG");
    assert.equal(targetExtLabel("scene.png"), "PNG");
  });
});
