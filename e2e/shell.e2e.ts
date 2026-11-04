import { expect, test } from '@playwright/test';

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
