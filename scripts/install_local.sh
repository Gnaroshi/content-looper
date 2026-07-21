#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if pgrep -x ContentDeck >/dev/null 2>&1; then
  echo "Quit ContentDeck before replacing its signed application bundle." >&2
  exit 3
fi
if [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then
  echo "ContentDeck has uncommitted files; preserve them before automatic installation." >&2
  exit 4
fi
NPM="$(command -v npm || true)"
[[ -n "$NPM" ]] || { echo "npm is required to build ContentDeck." >&2; exit 2; }
cd "$ROOT"
"$NPM" ci
"$NPM" install --global --prefix "$HOME/.local" "$ROOT"
CONTENTDECK_INSTALL=1 "$NPM" run app:pack
echo "Installed the current signed ContentDeck app and CLI provider."
