const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { parseContentDeckDeepLink } = require("../electron/deep-link.cjs");

describe("ContentDeck deep links", () => {
  it("accepts encoded HTTPS URLs for supported providers", () => {
    for (const mediaUrl of [
      "https://www.youtube.com/watch?v=abc_DEF-123",
      "https://x.com/example/status/123456",
      "https://www.tiktok.com/@example/video/123456",
    ]) {
      const link = `contentdeck://open?url=${encodeURIComponent(mediaUrl)}`;
      assert.deepEqual(parseContentDeckDeepLink(link), { kind: "open", url: mediaUrl });
    }
  });

  it("accepts only opaque session identifiers", () => {
    assert.deepEqual(parseContentDeckDeepLink("contentdeck://session/session_0123456789abcdef01234567"), {
      kind: "session",
      sessionId: "session_0123456789abcdef01234567",
    });
    assert.equal(parseContentDeckDeepLink("contentdeck://session/../../private"), null);
  });

  it("rejects unsafe schemes, unsupported hosts, credentials, and routes", () => {
    for (const mediaUrl of [
      "http://youtube.com/watch?v=abc",
      "javascript:alert(1)",
      "file:///tmp/video.mp4",
      "data:text/html,hello",
      "custom://example",
      "https://youtube.com.evil.example/watch?v=abc",
      "https://user:secret@youtube.com/watch?v=abc",
    ]) {
      assert.equal(parseContentDeckDeepLink(`contentdeck://open?url=${encodeURIComponent(mediaUrl)}`), null);
    }
    assert.equal(parseContentDeckDeepLink("contentdeck://shell?command=rm"), null);
  });
});
