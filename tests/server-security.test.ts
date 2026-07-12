import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAllowedBrowserOrigin, isAuthorizedRequest, safeHttpsUrl } from "../server/security";

describe("ContentDeck loopback API boundaries", () => {
  it("allows only the known web origins or token-authenticated file renderer", () => {
    assert.equal(isAllowedBrowserOrigin("http://127.0.0.1:5173", false), true);
    assert.equal(isAllowedBrowserOrigin("http://localhost:4173", false), true);
    assert.equal(isAllowedBrowserOrigin(undefined, false), true);
    assert.equal(isAllowedBrowserOrigin("null", true), true);
    assert.equal(isAllowedBrowserOrigin("null", false), false);
    assert.equal(isAllowedBrowserOrigin("https://attacker.example", true), false);
  });

  it("requires the exact bearer token when packaged", () => {
    assert.equal(isAuthorizedRequest(undefined, ""), true);
    assert.equal(isAuthorizedRequest("Bearer exact-token", "exact-token"), true);
    assert.equal(isAuthorizedRequest("Bearer other-token", "exact-token"), false);
    assert.equal(isAuthorizedRequest(undefined, "exact-token"), false);
  });

  it("accepts only credential-free HTTPS provider output", () => {
    assert.equal(safeHttpsUrl("https://cdn.example/video.mp4"), "https://cdn.example/video.mp4");
    assert.equal(safeHttpsUrl("http://cdn.example/video.mp4"), null);
    assert.equal(safeHttpsUrl("file:///tmp/video.mp4"), null);
    assert.equal(safeHttpsUrl("https://user:secret@cdn.example/video.mp4"), null);
  });
});
