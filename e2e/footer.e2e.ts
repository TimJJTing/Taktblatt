import { expect, test } from '@playwright/test';
import { formatted, openApp, openPreview, storedPlan } from './helpers.ts';

test.describe('sheet footer fields in the Header', () => {
	test('fields edit, the date picker has a Today button, and values persist', async ({ page }) => {
		await page.clock.setFixedTime(new Date('2030-01-02T00:30:00Z'));
		await openApp(page);
		const footer = page.locator('#header').getByRole('group', { name: 'Sheet footer' });
		await expect(footer).toBeVisible();
		for (const [id, text] of [
			['footer-note', 'Draft for review'],
			['footer-version', 'v1.2'],
			['footer-right', 'Confidential']
		]) {
			await footer.getByTestId(id).click();
			await page.keyboard.type(text);
			await page.keyboard.press('Enter');
			await expect(footer.getByTestId(id)).toHaveText(text);
		}

		const iso = await page.evaluate(() => {
			const today = new Date();
			return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
		});
		await page.getByTestId('footer-date').click();
		await page.getByTestId('date-today').click();
		await page.getByRole('button', { name: 'Done', exact: true }).click();
		await expect.poll(async () => (await storedPlan(page)).footer.date).toBe(iso);
		await expect(page.getByTestId('footer-date')).toHaveText(formatted(iso));

		await page.reload();
		await expect(page.getByTestId('footer-note')).toHaveText('Draft for review');
		await expect(page.getByTestId('footer-version')).toHaveText('v1.2');
		await expect(page.getByTestId('footer-right')).toHaveText('Confidential');
		await expect(page.getByTestId('footer-date')).toHaveText(formatted(iso));
		await expect(page.locator('[data-workspace] [data-page-number]')).toHaveCount(0);
		await expect(page.locator('[data-workspace] footer')).toHaveCount(0);
	});

	test('the date is empty until the user sets it', async ({ page }) => {
		await openApp(page);
		expect((await storedPlan(page)).footer.date).toBeNull();
		await expect(page.getByTestId('footer-date')).toHaveText('Date');
	});

	test('an empty footer shows only the page number on the sheet', async ({ page }) => {
		await openApp(page);
		await openPreview(page);
		const sheet = page.getByTestId('sheet').first();
		await expect(sheet.getByTestId('sheet-footer-left')).toBeEmpty();
		await expect(sheet.getByTestId('sheet-footer-right')).toHaveCount(0);
		await expect(sheet.getByTestId('page-number')).toHaveText(/^1 \/ \d+$/);
	});
});
