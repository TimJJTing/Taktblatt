import { defineConfig, devices } from '@playwright/test';

/**
 * The normal end-to-end suite. It serves the production build on port 4173 and skips the
 * `@diagram-fixtures` scenarios. `playwright.fixtures.config.ts` runs those scenarios.
 */
export const base = defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});

export default defineConfig(base, {
	grepInvert: /@diagram-fixtures/,
	use: { baseURL: 'http://localhost:4173', trace: 'on-first-retry' },
	webServer: {
		command: 'pnpm build && pnpm preview',
		port: 4173,
		reuseExistingServer: !process.env.CI
	}
});
