#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCE="$ROOT/identity/app-icon/contentdeck-v1.png"
BUILD="$ROOT/build"
ICONSET="$BUILD/AppIcon.iconset"

command -v magick >/dev/null || { echo "ImageMagick is required." >&2; exit 2; }
command -v iconutil >/dev/null || { echo "iconutil is required on macOS." >&2; exit 2; }

rm -rf "$ICONSET"
mkdir -p "$ICONSET"
magick "$SOURCE" -filter point -resize 1024x1024 "$BUILD/icon.png"
for size in 16 32 128 256 512; do
  magick "$SOURCE" -filter point -resize "${size}x${size}" "$ICONSET/icon_${size}x${size}.png"
  doubled=$((size * 2))
  magick "$SOURCE" -filter point -resize "${doubled}x${doubled}" "$ICONSET/icon_${size}x${size}@2x.png"
done
iconutil -c icns "$ICONSET" -o "$BUILD/icon.icns"

