# ContentDeck security boundaries

## Renderer and navigation

- Electron keeps `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`.
- The preload allowlist exposes one receive-only callback for already validated media/session requests. It exposes no filesystem, Node, shell, general IPC send method, or API credential.
- New windows and main-frame navigation are denied. Credential-free HTTPS links may be handed to the system browser; all other schemes are rejected.
- Webviews and renderer permission requests are denied.
- External media input and deep links accept only bounded, credential-free HTTPS YouTube, X, or TikTok URLs with exact host boundaries.

## Local service

- Fastify binds to `127.0.0.1`; it never binds to all interfaces.
- Browser CORS is limited to the known Vite development/preview origins. Packaged file rendering requires an ephemeral random bearer token injected by Electron and never placed in tracked configuration or renderer state.
- Studio does not receive the token and does not call this private service.
- Health output reports resolver availability as a boolean, not a binary path.

## Processes and remote content

- yt-dlp and Ollama use `execFile` with fixed argument arrays and no shell.
- yt-dlp overrides must be absolute executable regular files. Ollama installation accepts only registered model IDs.
- Provider media, caption, thumbnail, and canonical URLs are revalidated before use; unsafe schemes are discarded.
- Child-process diagnostics returned to the renderer are bounded and do not include commands, tokens, local paths, or raw provider output.

## Studio-visible data

The recent-session mirror is derived from canonical renderer localStorage. It contains only an opaque session ID, provider, timestamp, and `full` or `segment` loop mode. It never contains media URLs, titles, notes, subtitles, playback positions, tokens, or local paths. A missing or corrupt mirror degrades to an empty recent-session list and does not affect ContentDeck history.
