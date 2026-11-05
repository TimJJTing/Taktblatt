import { expect, test, type Page } from '@playwright/test';

test('the app shell shows the app name', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('banner')).toContainText('Taktblatt');
});

test('the UI language changes and stays after a reload', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Language' }).click();
	await page.getByRole('menuitemradio', { name: 'Deutsch' }).click();
	await expect(page.getByTestId('plan-switcher')).toHaveText('Unbenannter Plan');
	await page.reload();
	await expect(page.getByTestId('plan-switcher')).toHaveText('Unbenannter Plan');
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
});

const stored = (page: Page) => page.evaluate(() => localStorage.getItem('taktblatt:locale'));

test.describe('the first UI language comes from the browser', () => {
	test.describe('de-AT', () => {
		test.use({ locale: 'de-AT' });
		test('a supported language with a region is used', async ({ page }) => {
			await page.goto('/');
			await expect(page.getByTestId('plan-switcher')).toHaveText('Unbenannter Plan');
			await expect(page.locator('html')).toHaveAttribute('lang', 'de');
			// Paraglide saves the language it found, so the choice stays the same later.
			expect(await stored(page)).toBe('de');
		});
	});

	test.describe('zh-Hant-TW', () => {
		test.use({ locale: 'zh-Hant-TW' });
		test('Traditional Chinese with a script subtag gives zh-TW', async ({ page }) => {
			await page.goto('/');
			await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
		});
	});

	test.describe('zh-CN', () => {
		test.use({ locale: 'zh-CN' });
		test('Simplified Chinese falls back to English', async ({ page }) => {
			await page.goto('/');
			await expect(page.getByTestId('plan-switcher')).toHaveText('Untitled plan');
			await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		});
	});

	test.describe('fr-FR', () => {
		test.use({ locale: 'fr-FR' });
		test('an unsupported language falls back to English', async ({ page }) => {
			await page.goto('/');
			await expect(page.getByTestId('plan-switcher')).toHaveText('Untitled plan');
			await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		});
	});

	test.describe('fr-FR first, then ja', () => {
		test.use({ locale: 'fr-FR' });
		test('the next supported language in the list is used', async ({ page }) => {
			await page.addInitScript(() => {
				Object.defineProperty(navigator, 'languages', { get: () => ['fr-FR', 'ja-JP', 'en'] });
			});
			await page.goto('/');
			await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
		});
	});

	test.describe('a saved choice', () => {
		test.use({ locale: 'de-AT' });
		test('wins over the browser language', async ({ page }) => {
			await page.addInitScript(() => localStorage.setItem('taktblatt:locale', 'ja'));
			await page.goto('/');
			await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
		});
	});
});

test('a chosen language is saved under taktblatt:locale', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Language' }).click();
	await page.getByRole('menuitemradio', { name: 'Deutsch' }).click();
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	expect(await stored(page)).toBe('de');
	await page.reload();
	expect(await stored(page)).toBe('de');
	await expect(page.getByTestId('plan-switcher')).toHaveText('Unbenannter Plan');
});

test('another open tab reloads in the new UI language', async ({ context }) => {
	const first = await context.newPage();
	const second = await context.newPage();
	await first.goto('/');
	await second.goto('/');
	await expect(second.getByTestId('plan-switcher')).toHaveText('Untitled plan');
	await first.getByRole('button', { name: 'Language' }).click();
	await first.getByRole('menuitemradio', { name: 'Deutsch' }).click();
	await expect(second.locator('html')).toHaveAttribute('lang', 'de');
	await expect(second.getByTestId('plan-switcher')).toHaveText('Unbenannter Plan');
});
