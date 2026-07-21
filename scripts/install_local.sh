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
CONTENTDECK_INSTALL=1 "$NPM" run app:pack
PACKAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/contentdeck-cli.XXXXXX")"
trap 'rm -rf "$PACKAGE_DIR"' EXIT
PACKAGE_NAME="$("$NPM" pack --pack-destination "$PACKAGE_DIR" --silent)"
"$NPM" install --global --prefix "$HOME/.local" "$PACKAGE_DIR/$PACKAGE_NAME"
CLI_ROOT="$(realpath "$HOME/.local/bin/contentdeck")"
case "$CLI_ROOT" in
  "$HOME/.local"/*) ;;
  *)
    echo "ContentDeck CLI installation escaped the trusted local prefix." >&2
    exit 5
    ;;
esac
echo "Installed the current signed ContentDeck app and CLI provider."
