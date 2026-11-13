import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import type { Plugin } from 'vite';

/**
 * Test-only diagram views (ADR 20). Only the build-time flag TAKTBLATT_DIAGRAM_FIXTURES=1 imports
 * them. Without the flag, the module exports an empty list and the build has no fixture code.
 */
function diagramViewFixtures(): Plugin {
	const id = 'virtual:diagram-view-fixtures';
	const resolved = `\0${id}`;
	const enabled = process.env.TAKTBLATT_DIAGRAM_FIXTURES === '1';
	return {
		name: 'taktblatt-diagram-view-fixtures',
		resolveId: (source) => (source === id ? resolved : undefined),
		load: (source) => {
			if (source !== resolved) return undefined;
			return enabled
				? "export { fixtures } from '/e2e/fixtures/diagram-views/index.ts';"
				: 'export const fixtures = [];';
		}
	};
}

export default defineConfig({
	plugins: [
		diagramViewFixtures(),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ fallback: '404.html' })
		}),
		paraglideVitePlugin({ project: './project.inlang' })
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}', 'scripts/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
