import { constants } from "node:fs";
import { accessSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

export const appVersion = "0.1.0";
export const capabilities = [
  "open-media-url",
  "open-session",
  "recent-sessions",
  "launch-player",
  "provider-status",
];

const integrationDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(integrationDirectory, "..");

export function getStatusDocument(now = new Date()) {
  const sessions = readSessionMirror();
  const resolverAvailable = findResolver();
  return {
    schemaVersion: 1,
    providerId: "content-looper",
    displayName: "ContentDeck",
    appVersion,
    generatedAt: now.toISOString(),
    state: resolverAvailable ? "ok" : "partial",
    summary: resolverAvailable
      ? "ContentDeck is ready for supported media URLs."
      : "ContentDeck is available; native YouTube resolution needs yt-dlp setup.",
    capabilities,
    providers: [
      { id: "youtube", supported: true, preciseLoop: true, subtitles: "provider-dependent" },
      { id: "x", supported: true, preciseLoop: false, subtitles: "not-reported" },
      { id: "tiktok", supported: true, preciseLoop: false, subtitles: "not-reported" },
    ],
    resolver: { available: resolverAvailable },
    recentSessionCount: sessions.length,
    warnings: resolverAvailable
      ? []
      : [{ code: "resolver-unavailable", message: "Install yt-dlp or open ContentDeck to use provider fallbacks." }],
  };
}

export function getRecentSessionsDocument(limit = 10, now = new Date()) {
  const sessions = readSessionMirror();
  return {
    schemaVersion: 1,
    providerId: "content-looper",
    appVersion,
    generatedAt: now.toISOString(),
    total: sessions.length,
    sessions: sessions.slice(0, Math.max(0, Math.min(limit, 30))),
  };
}

export function readSessionMirror() {
  try {
    const value = JSON.parse(readFileSync(getStatePath(), "utf8"));
    if (value?.schemaVersion !== 1 || value?.providerId !== "content-looper" || !Array.isArray(value.sessions)) return [];
    return value.sessions
      .filter(isSafeSession)
      .map((session) => ({
        sessionId: session.sessionId,
        provider: session.provider,
        updatedAt: session.updatedAt,
        loopMode: session.loopMode,
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 30);
  } catch {
    return [];
  }
}

function isSafeSession(value) {
  return Boolean(
    value &&
      /^session_[a-f0-9]{24}$/.test(value.sessionId) &&
      ["youtube", "x", "tiktok"].includes(value.provider) &&
      ["full", "segment"].includes(value.loopMode) &&
      typeof value.updatedAt === "string" &&
      Number.isFinite(Date.parse(value.updatedAt)),
  );
}

function getStatePath() {
  const override = process.env.CONTENTDECK_STATE_DIR;
  const directory = override && isAbsolute(override) ? override : join(homedir(), ".contentdeck");
  return join(directory, "integration-sessions-v1.json");
}

function findResolver() {
  const override = process.env.YTDLP_PATH;
  const candidates = [
    override && isAbsolute(override) ? override : null,
    join(packageRoot, "bin", "yt-dlp_macos"),
    join(packageRoot, ".venv", "bin", "yt-dlp"),
  ].filter(Boolean);
  if (candidates.some(isExecutableFile)) return true;
  try {
    execFileSync("yt-dlp", ["--version"], { stdio: "ignore", timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

function isExecutableFile(path) {
  try {
    return statSync(path).isFile() && (accessSync(path, constants.X_OK), true);
  } catch {
    return false;
  }
}
