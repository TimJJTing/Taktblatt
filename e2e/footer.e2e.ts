import { expect, test } from '@playwright/test';
import { formatted, openApp, storedPlan } from './helpers';

test.describe('footer', () => {
	test('fields edit, the date picker has a Today button, and values persist', async ({ page }) => {
		await openApp(page);
		for (const [id, text] of [
			['footer-note', 'Draft for review'],
			['footer-version', 'v1.2'],
			['footer-right', 'Confidential']
		]) {
			await page.getByTestId(id).click();
			await page.keyboard.type(text);
			await page.keyboard.press('Enter');
			await expect(page.getByTestId(id)).toHaveText(text);
		}

		await page.getByTestId('footer-date').click();
		await page.getByTestId('date-today').click();
		await page.getByRole('button', { name: 'Done', exact: true }).click();
		const today = new Date();
		const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
		await expect.poll(async () => (await storedPlan(page)).footer.date).toBe(iso);
		await expect(page.getByTestId('footer-date')).toHaveText(formatted(iso));

		await page.reload();
		await expect(page.getByTestId('footer-note')).toHaveText('Draft for review');
		await expect(page.getByTestId('footer-version')).toHaveText('v1.2');
		await expect(page.getByTestId('footer-right')).toHaveText('Confidential');
		await expect(page.getByTestId('footer-date')).toHaveText(formatted(iso));
		await expect(page.locator('[data-page-number]')).toBeEmpty();
	});

	test('the date is empty until the user sets it', async ({ page }) => {
		await openApp(page);
		expect((await storedPlan(page)).footer.date).toBeNull();
		await expect(page.getByTestId('footer-date')).toHaveText('Date');
	});

	test('an empty footer does not print', async ({ page }) => {
		await openApp(page);
		await page.emulateMedia({ media: 'print' });
		await expect(page.locator('footer')).toBeHidden();
	});
});
