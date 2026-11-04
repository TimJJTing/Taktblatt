# 7. Static SPA, offline, no network

Status: accepted (2026-11-05)

## Context

The app has no server and no authentication. All data is local.

## Decision

- SvelteKit with `adapter-static`. SSR is off. The app shell is prerendered.
- A service worker caches the app. A web manifest makes the app installable.
- The font is self-hosted with `@fontsource`.
- The app does not send requests at runtime. It has no analytics and no telemetry.

## Consequences

- Any static host can serve the app.
- The app works offline after the first visit.
