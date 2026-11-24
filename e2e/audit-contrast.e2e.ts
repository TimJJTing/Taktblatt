import { expect, test } from '@playwright/test';
import { openApp, sampleElementColors } from './helpers.ts';

test('empty objective placeholder has sufficient contrast in both themes', async ({ page }) => {
	await openApp(page);
	const placeholder = page.getByText('Add an objective', { exact: true });
	for (const theme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: theme });
		await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
		const { contrast } = await sampleElementColors(placeholder);
		expect(contrast, `${theme} placeholder contrast`).toBeGreaterThanOrEqual(4.5);
	}
});
