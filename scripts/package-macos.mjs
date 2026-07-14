import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const [target = "dir", mode = "development"] = process.argv.slice(2);
if (!new Set(["dir", "dmg", "zip", "release"]).has(target)) throw new Error("Unsupported package target.");
if (!new Set(["development", "release", "test"]).has(mode)) throw new Error("Unsupported signing mode.");

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(execFileSync("/bin/cat", [resolve(root, "package.json")], { encoding: "utf8" }));
const commit = git(["rev-parse", "HEAD"]);
const number = Number(git(["rev-list", "--count", "HEAD"]));
const dirty = Boolean(git(["status", "--porcelain"]));
if (mode === "release" && dirty) throw new Error("Release packaging requires a clean Git checkout.");
mkdirSync(resolve(root, "integration"), { recursive: true });
writeFileSync(
  resolve(root, "integration", "build-provenance.json"),
  `${JSON.stringify({ schemaVersion: 1, version: pkg.version, commit, number, dirty }, null, 2)}\n`,
);

const env = { ...process.env };
if (mode === "test") {
  env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
} else {
  const identityClass = mode === "release" ? "Developer ID Application" : "Developer ID Application or Apple Development";
  const identity = process.env.CONTENTDECK_SIGNING_IDENTITY
    || findIdentity("Developer ID Application")
    || (mode === "development" ? findIdentity("Apple Development") : "");
  if (!identity) throw new Error(`No ${identityClass} identity is available.`);
  env.CSC_NAME = identity.replace(/^(?:Developer ID Application|Apple Development):\s*/, "");
  env.CSC_IDENTITY_AUTO_DISCOVERY = "true";
}

const targets = target === "release" ? ["dmg", "zip"] : [target];
const result = spawnSync(
  "npm",
  ["exec", "electron-builder", "--", "--mac", ...targets, `--config.buildVersion=${number}`],
  {
  cwd: root,
  env,
  stdio: "inherit",
  shell: false,
  },
);
if (result.status !== 0) process.exit(result.status ?? 1);

if (mode !== "test") {
  const appPath = resolve(root, "dist-mac", "mac-arm64", "ContentDeck.app");
  execFileSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath], { stdio: "inherit" });
  if (process.env.CONTENTDECK_INSTALL === "1") {
    const installDirectory = resolve(homedir(), "Applications");
    const installedApp = resolve(installDirectory, "ContentDeck.app");
    mkdirSync(installDirectory, { recursive: true });
    rmSync(installedApp, { recursive: true, force: true });
    execFileSync("ditto", [appPath, installedApp], { stdio: "inherit" });
    execFileSync("codesign", ["--verify", "--deep", "--strict", installedApp], { stdio: "inherit" });
  }
}

if (mode === "release") {
  const profile = process.env.NOTARY_PROFILE;
  if (!profile) throw new Error("NOTARY_PROFILE is required for a release package.");
  const outputDirectory = resolve(root, "dist-mac");
  for (const name of readdirSync(outputDirectory).filter((item) => item.endsWith(".dmg"))) {
    const artifact = resolve(outputDirectory, name);
    execFileSync("xcrun", ["notarytool", "submit", artifact, "--keychain-profile", profile, "--wait"], { stdio: "inherit" });
    execFileSync("xcrun", ["stapler", "staple", artifact], { stdio: "inherit" });
  }
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 5_000 }).trim();
}

function findIdentity(identityClass) {
  const output = execFileSync("security", ["find-identity", "-v", "-p", "codesigning"], { encoding: "utf8" });
  const escaped = identityClass.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return output.match(new RegExp(`"(${escaped}:[^"]+)"`))?.[1] ?? "";
}
