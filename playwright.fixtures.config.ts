import { defineConfig } from '@playwright/test';
import { base } from './playwright.config.ts';

/**
 * The fixture suite. It builds the app with the test-only diagram views (ADR 20, vite.config.ts)
 * and runs only the `@diagram-fixtures` scenarios. It uses its own port and never reuses a server,
 * so a normal build never serves fixture tests and a fixture build never serves production checks.
 */
const port = 4174;

export default defineConfig(base, {
	grep: /@diagram-fixtures/,
	use: { baseURL: `http://localhost:${port}`, trace: 'on-first-retry' },
	webServer: {
		command: `pnpm build && pnpm preview --port ${port}`,
		env: { TAKTBLATT_DIAGRAM_FIXTURES: '1' },
		port,
		reuseExistingServer: false
	}
});
