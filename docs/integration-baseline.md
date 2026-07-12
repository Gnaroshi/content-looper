# ContentDeck integration baseline

Baseline: `Gnaroshi/content-looper` `main` at `e229c8a4a3e1bad9aa3d4ff0692846cffd323ea8` on 2026-07-12. The worktree was clean and matched `origin/main`.

## Naming decision

- Stable repository and integration ID: `content-looper`.
- Current product display name: **ContentDeck**.
- Package name: `content-looper`; macOS product/bundle display name: `ContentDeck`; bundle ID: `local.contentdeck.app`.
- This integration does not rename the repository, package, product, bundle, or existing storage keys. Any public repository rename remains an owner decision because it affects URLs, release automation, links, and compatibility independently of the product display name.

## Current workflow and provider support

| Area | Verified behavior |
| --- | --- |
| Input prerequisite | A supported shared URL. Invalid or unsupported links leave the current session intact and show an error. |
| YouTube | Watch, `youtu.be`, Shorts, embed, and live URLs. Start time accepts seconds or `h/m/s` syntax. |
| X/Twitter | `x.com`, `twitter.com`, and mobile status URLs normalized to an official status embed. |
| TikTok | Full `/@user/video/<id>` and `vm`/`vt` short redirect URLs rendered through the official embed script. |
| Provider asymmetry | YouTube has resolver/native playback, iframe API, and embed fallback. X/TikTok are embed-only and do not claim precise loop controls. |
| Full loop | YouTube end events restart at zero; repeat target, rest interval, speed ladder, and session count remain available. |
| Segment loop | Valid start/end boundaries seek to the segment start. Saved segments preserve ID, label, score, note, and exact seconds. |
| Subtitle behavior | yt-dlp metadata selects manual VTT before automatic captions, prefers an exact/native language prefix, merges Korean by nearby start time, and falls back to deterministic learning items when local Ollama is unavailable. It does not currently run MLX Whisper transcription. |
| Session ownership | `contentdeck.history.v1` in renderer localStorage owns history, positions, loop segments, scores, and notes. `~/.contentdeck/learning-config.json` owns hardware/model preferences. |

## Runtime modes and commands

- Web mode: Vite on `127.0.0.1:5173`, proxying `/api` to Fastify on `127.0.0.1:8787`.
- Electron mode: the same React application in an Electron 42 window; packaged API defaults to `127.0.0.1:18787` and may select a random loopback port when busy.
- Commands: `dev`, `dev:web`, `dev:api`, `build`, `preview`, `app:dev`, `app:build:server`, `app:pack`, and `app:dmg`.
- Build output: `dist/` web assets, `dist-server/` Fastify output, and `dist-mac/mac-arm64/ContentDeck.app` for a macOS directory build.

## yt-dlp selection order

The observed order is: local `YTDLP_PATH`; packaged resource `bin/yt-dlp_macos`; packaged resource `.venv/bin/yt-dlp`; source/build-adjacent `bin/yt-dlp_macos`; source/build-adjacent `.venv/bin/yt-dlp`; current-workspace `.venv/bin/yt-dlp`; then fixed command name `yt-dlp` on `PATH`. The resolver uses `execFile` with a fixed option array, no playlist, a 45-second timeout, a 32 MiB stdout bound, and cancellation.

## Security baseline

| Boundary | Observed state |
| --- | --- |
| Electron renderer | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`; no preload is configured, so the renderer has no preload API surface. |
| Navigation | New windows are denied and forwarded to `shell.openExternal`, but the URL scheme is not currently restricted. Main-frame navigation is not explicitly guarded. |
| Local API | Fastify binds explicitly to `127.0.0.1`. Development uses 8787; packaged mode uses 18787 with loopback random-port fallback. |
| CORS/authentication | `origin: true` reflects every origin and no capability token is required. This is unsafe because model installation and config mutation share the API. |
| URL validation | Zod accepts any valid URL scheme before provider parsing; the server passes accepted strings to yt-dlp. HTTPS and exact provider host boundaries are not enforced. |
| Files/binaries | No user file path endpoint exists. Optional binaries are selected from environment/bundle/repository/venv/PATH candidates, but absolute candidates are checked only for existence, not executable regular-file status. |
| Child processes | yt-dlp and Ollama use `execFile`, not a shell. yt-dlp options are fixed; the model name is a single argument but its allowed shape is broad. |
| Remote content | YouTube/X/TikTok scripts and iframes load in the sandboxed renderer. Caption, media, thumbnail, and metadata URLs returned by providers are not all independently scheme-validated. |
| Deep link | No protocol is registered in the packaged `Info.plist`; no handler exists. |

## Destructive and recovery behavior

- History entries/segments can be deleted or all history cleared from localStorage.
- Learning configuration is overwritten; `ollama pull` may consume network and disk after a user action.
- ContentDeck never deletes source media.
- localStorage normalization preserves compatible existing history and converts invalid storage to empty. There is no backup/export/undo/restore contract.
- Studio version 1 must not clear history, install models, mutate playback/subtitle state, or read localStorage/config directly.

## Baseline validation

- Initial `npm run build` was blocked until declared dependencies were installed with `npm ci`; the clean source then built successfully.
- Web output: approximately 426 KB JavaScript and 30 KB CSS before gzip.
- `CSC_IDENTITY_AUTO_DISCOVERY=false npm run app:pack` succeeded; output was approximately 309 MB at `dist-mac/mac-arm64/ContentDeck.app` and used an ad-hoc signature without notarization.
- The default signed package path selected a configured Developer ID but did not complete within the baseline observation window; it was stopped without changing source.
- The baseline had no tests. The first integration commit adds URL/provider and timing regression tests before product/security refactoring.
