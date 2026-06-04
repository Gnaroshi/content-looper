# Local binaries

Optional runtime binaries can be placed here for local packaging.

For macOS media resolving, place a `yt-dlp_macos` executable in this directory if you want the packaged app to carry its own resolver binary. The app also falls back to `.venv/bin/yt-dlp` or a system `yt-dlp` on `PATH`.

Large local binaries are intentionally not committed.
