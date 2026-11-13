import { defineConfig, devices } from '@playwright/test';

/**
 * TAKTBLATT_DIAGRAM_FIXTURES=1 builds the app with the test-only diagram views (ADR 20) and runs
 * only the `@diagram-fixtures` scenarios. It uses its own port and never reuses a server, so a
 * normal build never serves fixture tests and a fixture build never serves production checks.
 */
const fixtures = process.env.TAKTBLATT_DIAGRAM_FIXTURES === '1';
const port = fixtures ? 4174 : 4173;

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	grep: fixtures ? /@diagram-fixtures/ : undefined,
	grepInvert: fixtures ? undefined : /@diagram-fixtures/,
	use: { baseURL: `http://localhost:${port}`, trace: 'on-first-retry' },
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: fixtures ? `pnpm build && pnpm preview --port ${port}` : 'pnpm build && pnpm preview',
		port,
		reuseExistingServer: !process.env.CI && !fixtures
	}
});
