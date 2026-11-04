/**
 * The service worker caches the app shell and all files of the build.
 * It answers with the cache first. It never requests anything outside the app (ADR 7).
 * The cache name contains the build version. A new build deletes the old caches.
 *
 * Update rule: a new worker does not call `skipWaiting`. It waits until all tabs of the
 * old build are closed. Then it activates and deletes the old cache. So an open tab never
 * loses the files of its own build. The first worker takes control with `clients.claim`.
 * The install step bypasses the HTTP cache (`cache: 'reload'`). So it never stores a stale file.
 * A page navigation without network gets the cached app shell.
 */
import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';
import { self as sw } from '$app/service-worker';

const CACHE = `taktblatt-${version}`;
// The app can run under a sub-path. The scope of the worker is the root of the app.
const scope = sw.registration.scope;
const toUrl = (path: string) => new URL(path.replace(/^\//, ''), scope).href;
const ASSETS = [
	...new Set([...immutable, ...assets, ...prerendered].map((entry) => toUrl(entry.path)))
];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
			)
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	// Do not touch requests to other origins.
	if (new URL(request.url).origin !== sw.location.origin) return;
	event.respondWith(respond(request));
});

async function respond(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	const cached = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
	if (cached) return cached;
	try {
		return await fetch(request);
	} catch (error) {
		// The app is one page. A page navigation falls back to the cached app shell.
		if (request.mode === 'navigate') {
			const shell = await cache.match(scope);
			if (shell) return shell;
		}
		throw error;
	}
}
