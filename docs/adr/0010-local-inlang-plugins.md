# 10. Load the inlang plugins from node_modules

Status: Accepted (2026-11-05)

## Context

Paraglide compiles `messages/*.json` with two inlang plugins: `plugin-message-format` and `plugin-m-function-matcher`. `project.inlang/settings.json` loaded them from jsDelivr with a major-version URL (`@4` and `@2`).

- Each compile downloaded the plugins. A build without access to jsDelivr could not load them. This includes offline work, locked-down CI runners and agent sandboxes.
- The inlang cache in `project.inlang/cache/` is a fallback. Git ignores it, so a fresh checkout has no cache.
- When the SDK cannot load a plugin, it only gives a warning, or no message for a local plugin. The compile then reports success and writes no messages. `pnpm check` then fails with many type errors that do not show the cause.
- A major-version URL can give a different plugin version in each build.

The installed app is not affected. The compiled messages are part of the bundle. The app and the service worker make no request to jsDelivr.

The inlang documentation supports local plugins from `node_modules`. It recommends CDN plugins, because external inlang apps such as Fink and Sherlock cannot resolve `node_modules` paths. For CI and agents, it recommends an exact version. This project does not use those external apps.

## Decision

- Install both plugins as dev dependencies. `pnpm-lock.yaml` pins the exact versions. Dependabot updates them with the other npm packages.
- In `project.inlang/settings.json`, refer to the plugins as `./node_modules/@inlang/<plugin>/dist/index.js`. The SDK resolves these paths from the directory that contains `project.inlang/`, which is the repository root.
- `pnpm i18n` runs `scripts/check-i18n.mjs` after the compile. The script fails when a message in `messages/en.json` has no compiled function.

## Consequences

- `pnpm i18n`, `pnpm check` and `pnpm build` need no network after `pnpm install`.
- Each build uses the plugin versions in `pnpm-lock.yaml`.
- A plugin that does not load stops `pnpm i18n` with a clear message.
- External inlang apps (Fink, Sherlock) cannot load the plugins. To use them, change the module paths back to exact-version jsDelivr URLs.
