# MDS-001: Studio integration

- Status: accepted
- Date: 2026-07-12
- Baseline: `e229c8a4a3e1bad9aa3d4ff0692846cffd323ea8`

## Decision

Keep ContentDeck an independently runnable Vite/React web application and Electron desktop application. Integrate it with Gnaroshi Studio through a schema-versioned manifest, fixed JSON CLI commands, sanitized recent-session summaries, application launch, and allowlisted deep links. Studio is a control plane; it does not embed the player, invoke arbitrary shell text, call the private Fastify API, or become the source of truth for playback or learning state.

The stable repository and integration ID remains `content-looper`. The current product display name remains `ContentDeck`. This change does not rename either one. A repository rename remains an owner decision because repository URLs, release automation, clones, package metadata, and external links require a separate compatibility plan.

## Preserved functionality

- HTTPS YouTube, X/Twitter, and TikTok provider detection and existing provider asymmetry.
- YouTube native yt-dlp resolution, iframe API, and embed fallback order.
- Full and segment looping, saved segments, practice controls, notes, scores, and history.
- Manual-before-automatic subtitle selection, language preference, Korean merge, deterministic fallback, and optional local Ollama analysis.
- Web development/preview mode, Electron mode, loopback Fastify service, package commands, app bundle ID, localStorage keys, and learning configuration location.
- ContentDeck ownership of playback, subtitles, loop state, and history.

## MDS guidance applied

- The input workflow states its HTTPS prerequisite, supported providers, provider limitations, loading/readiness state, blocker, and next valid action.
- Invalid input, unavailable resolver, missing recent session, and provider limitations use text in addition to color.
- Dark mode remains the primary working theme with a readable violet pastel accent.
- The layout was validated at the Electron minimum of 760 by 600 and a narrow 360 by 640 web viewport without horizontal overflow.
- The integration is read-only first and degrades when yt-dlp, history, or ContentDeck itself is unavailable.

## Intentional deviations

- Electron is retained instead of being rewritten as Tauri; the proven web/Electron workflow has no integration-driven reason to migrate.
- Fastify remains private to ContentDeck because media resolution and local learning tools need a Node process. Studio uses the CLI/deep-link contract instead of local HTTP.
- Existing React architecture and focused player layout remain. Studio receives no embedded player and ContentDeck receives no dashboard redesign.
- Functional controls continue to use one consistent Lucide icon family rather than mascot imagery.

## Compatibility and migration

The contract is additive. Existing users do not need to migrate localStorage or learning configuration. The app generates a rebuildable opaque recent-session mirror after history changes. Existing HTTP or unsupported provider inputs are now rejected at the boundary; users must supply supported HTTPS share URLs. OS deep-link handling becomes available after installing or launching a packaged app that registers the `contentdeck` scheme.

Version `0.2.1` adds a fixed clean-source local installer used by Studio's owner-enabled update-before-open policy. It also retains Git commit/build provenance, health/recent manifest declarations, Apple Development signing for stable local identity, and a Developer ID/notarized GitHub Release path. The packaged Electron app checks the public GitHub release feed and asks before download and restart; Studio refuses dirty or diverged source and never resets local work.

The local installer packages the CLI into an npm archive before installing it under `~/.local`. This keeps the executable's canonical path inside Studio's trusted prefix instead of leaving a global symlink to a mutable source checkout. The installer verifies that containment before reporting success.

## Validation

- `npm test`
- `npm run build`
- `npm run app:build:server`
- `npm audit --audit-level=low`
- `CSC_IDENTITY_AUTO_DISCOVERY=false npm run app:pack`
- Packaged `Info.plist` inspection for `contentdeck` registration
- Packaged loopback authorization check: renderer requests succeeded; an unauthenticated health request returned HTTP 401
- Rendered minimum/narrow layout and invalid-link state checks

## Risk and rollback

Strict URL validation may reject permissive inputs that were never safe provider URLs. Deep-link registration depends on installation state. A stale summary mirror can hide recent sessions from Studio but cannot damage canonical history. Roll back the six focused integration commits in reverse order; no data migration must be undone. Removing the mirror file is optional because it is derived and ignored by older versions.

## Related repository

`Gnaroshi/gnaroshi-studio` validates the same schema-v1 manifest and consumes only fixed JSON commands and constructed allowlisted deep links. Its linked change must remain independently revertible.
