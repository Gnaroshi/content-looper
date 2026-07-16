const assert = require("node:assert/strict");
const { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
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

  it("never treats a parent checkout as ContentDeck build provenance", () => {
    const parent = mkdtempSync(join(tmpdir(), "contentdeck-parent-git-"));
    assert.equal(spawnSync("git", ["init", parent], { encoding: "utf8" }).status, 0);
    writeFileSync(join(parent, "marker.txt"), "parent repository\n");
    assert.equal(spawnSync("git", ["-C", parent, "add", "marker.txt"], { encoding: "utf8" }).status, 0);
    assert.equal(spawnSync("git", ["-C", parent, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "parent"], { encoding: "utf8" }).status, 0);

    const installedRoot = join(parent, "lib", "node_modules", "content-looper");
    mkdirSync(join(installedRoot, "bin"), { recursive: true });
    mkdirSync(join(installedRoot, "integration"), { recursive: true });
    copyFileSync(cli, join(installedRoot, "bin", "contentdeck.mjs"));
    copyFileSync(join(__dirname, "..", "integration", "contract.mjs"), join(installedRoot, "integration", "contract.mjs"));

    const stateDirectory = mkdtempSync(join(tmpdir(), "contentdeck-parent-state-"));
    const result = run(["status", "--json"], stateDirectory, join(installedRoot, "bin", "contentdeck.mjs"));
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout).build, { commit: null, number: null, dirty: null });
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

function run(args, stateDirectory, executable = cli) {
  return spawnSync(process.execPath, [executable, ...args], {
    encoding: "utf8",
    env: { ...process.env, CONTENTDECK_STATE_DIR: stateDirectory, YTDLP_PATH: "" },
  });
}
