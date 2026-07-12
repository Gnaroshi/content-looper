const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { describe, it } = require("node:test");

const cli = join(__dirname, "..", "bin", "contentdeck.mjs");

describe("ContentDeck Studio contract", () => {
  it("publishes version, health, recent, signing, and update declarations", () => {
    const manifest = JSON.parse(readFileSync(join(__dirname, "..", "gnaroshi.app.json"), "utf8"));
    assert.equal(manifest.version, "0.2.0");
    assert.deepEqual(manifest.entrypoints.cli.recentActivitySubcommand, ["sessions", "recent", "--json", "--limit", "5"]);
    assert.equal(manifest.health.contractVersion, 1);
    assert.equal(manifest.distribution.source.mode, "git-fetch");
    assert.equal(manifest.distribution.macos.releaseSigning, "developer-id");
  });

  it("returns versioned, path-free status JSON", () => {
    const stateDirectory = mkdtempSync(join(tmpdir(), "contentdeck-status-"));
    const result = run(["status", "--json"], stateDirectory);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.providerId, "content-looper");
    assert.equal(payload.displayName, "ContentDeck");
    assert.equal(payload.appVersion, "0.2.0");
    assert.deepEqual(Object.keys(payload.build).sort(), ["commit", "dirty", "number"]);
    assert.equal(JSON.stringify(payload).includes(stateDirectory), false);
  });

  it("returns only sanitized recent-session summaries", () => {
    const stateDirectory = mkdtempSync(join(tmpdir(), "contentdeck-sessions-"));
    writeFileSync(
      join(stateDirectory, "integration-sessions-v1.json"),
      JSON.stringify({
        schemaVersion: 1,
        providerId: "content-looper",
        generatedAt: "2026-07-12T00:00:00.000Z",
        sessions: [
          {
            sessionId: "session_0123456789abcdef01234567",
            provider: "youtube",
            updatedAt: "2026-07-12T00:00:00.000Z",
            loopMode: "segment",
            url: "https://www.youtube.com/watch?v=private",
            note: "private note",
          },
        ],
      }),
    );
    const result = run(["sessions", "recent", "--json"], stateDirectory);
    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(payload.sessions, [
      {
        sessionId: "session_0123456789abcdef01234567",
        provider: "youtube",
        updatedAt: "2026-07-12T00:00:00.000Z",
        loopMode: "segment",
      },
    ]);
    assert.equal(result.stdout.includes("private"), false);
    assert.equal(result.stdout.includes(stateDirectory), false);
  });

  it("fails closed on unknown commands and invalid limits", () => {
    const stateDirectory = mkdtempSync(join(tmpdir(), "contentdeck-invalid-"));
    assert.equal(run(["shell", "rm -rf"], stateDirectory).status, 2);
    assert.equal(run(["sessions", "recent", "--json", "--limit", "100"], stateDirectory).status, 2);
  });
});

function run(args, stateDirectory) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env: { ...process.env, CONTENTDECK_STATE_DIR: stateDirectory, YTDLP_PATH: "" },
  });
}
