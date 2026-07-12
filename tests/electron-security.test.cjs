const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  isSafeDevelopmentServerUrl,
  isSafeExternalHttpsUrl,
  isSameRendererDocument,
} = require("../electron/security.cjs");

describe("Electron renderer boundaries", () => {
  it("allows only bounded HTTPS external navigation", () => {
    assert.equal(isSafeExternalHttpsUrl("https://www.youtube.com/watch?v=abc"), true);
    for (const value of [
      "http://example.com",
      "file:///tmp/a",
      "javascript:alert(1)",
      "data:text/html,hello",
      "contentdeck://open",
      "https://user:secret@example.com",
      "https://example.com:8443",
    ]) {
      assert.equal(isSafeExternalHttpsUrl(value), false);
    }
  });

  it("limits development renderer origins to known loopback Vite ports", () => {
    assert.equal(isSafeDevelopmentServerUrl("http://127.0.0.1:5173"), true);
    assert.equal(isSafeDevelopmentServerUrl("http://localhost:4173"), true);
    assert.equal(isSafeDevelopmentServerUrl("http://0.0.0.0:5173"), false);
    assert.equal(isSafeDevelopmentServerUrl("https://127.0.0.1:5173"), false);
    assert.equal(isSafeDevelopmentServerUrl("http://127.0.0.1:9999"), false);
  });

  it("permits hash-only changes within the loaded renderer document", () => {
    assert.equal(
      isSameRendererDocument("file:///Applications/ContentDeck.app/index.html#history", "file:///Applications/ContentDeck.app/index.html"),
      true,
    );
    assert.equal(isSameRendererDocument("https://example.com", "file:///Applications/ContentDeck.app/index.html"), false);
  });
});
