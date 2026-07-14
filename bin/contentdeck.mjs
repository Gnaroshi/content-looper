#!/usr/bin/env node

import { appVersion, getRecentSessionsDocument, getStatusDocument } from "../integration/contract.mjs";

const args = process.argv.slice(2);

if (args.length === 1 && (args[0] === "--version" || args[0] === "version")) {
  process.stdout.write(`${appVersion}\n`);
} else if (args[0] === "status" && args.includes("--json")) {
  writeJson(getStatusDocument());
} else if (args[0] === "sessions" && args[1] === "recent" && args.includes("--json")) {
  const limitIndex = args.indexOf("--limit");
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : 10;
  if (!Number.isInteger(limit) || limit < 0 || limit > 30) fail("--limit must be an integer from 0 through 30.");
  writeJson(getRecentSessionsDocument(limit));
} else {
  fail("Usage: contentdeck status --json | contentdeck sessions recent --json [--limit N] | contentdeck --version");
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
