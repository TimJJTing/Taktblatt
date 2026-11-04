import { expect, test, type Page } from '@playwright/test';
import { openApp, storedPlan } from './helpers';

const sections = (page: Page) => page.getByTestId('remark-section');

test.describe('remarks', () => {
	test('add a section, edit bullets with the keyboard, and trim empty bullets', async ({
		page
	}) => {
		await openApp(page);
		await page.getByTestId('add-remark-section').click();
		await page.keyboard.type('Risks');
		await page.keyboard.press('Enter');
		const first = sections(page).first();
		await expect(first.getByTestId('remark-title')).toHaveText('Risks');

		await first.hover();
		await first.getByTestId('add-remark-bullet').click();
		await page.keyboard.type('Budget');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Weather');
		await page.keyboard.press('Enter');
		// The third bullet is empty. Backspace removes it and focuses the previous bullet.
		await page.keyboard.press('Backspace');
		await expect(page.getByTestId('remark-bullet-input')).toHaveValue('Weather');
		await page.keyboard.press('End');
		await page.keyboard.type(' ');
		await page.keyboard.press('Tab');
		await expect(first.getByTestId('remark-bullet')).toHaveText(['Budget', 'Weather']);
		expect((await storedPlan(page)).remarks[0].bullets).toEqual(['Budget', 'Weather']);

		// A bullet that is emptied is removed on blur.
		await first.getByTestId('remark-bullet').first().click();
		await page.keyboard.press('ControlOrMeta+a');
		await page.keyboard.press('Delete');
		await page.getByTestId('plan-heading').click();
		await page.keyboard.press('Escape');
		await expect(first.getByTestId('remark-bullet')).toHaveText(['Weather']);
	});

	test('an empty new section is removed on blur', async ({ page }) => {
		await openApp(page);
		await page.getByTestId('add-remark-section').click();
		await expect(sections(page)).toHaveCount(1);
		await page.keyboard.press('Tab');
		await expect(sections(page)).toHaveCount(0);
		// The empty section left no undo step.
		await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
	});

	test('move a section down, delete it with confirmation, and undo', async ({ page }) => {
		await openApp(page);
		for (const title of ['One', 'Two']) {
			await page.getByTestId('add-remark-section').click();
			await page.keyboard.type(title);
			await page.keyboard.press('Enter');
		}
		const titles = page.getByTestId('remark-title');
		await expect(titles).toHaveText(['One', 'Two']);

		await sections(page).first().getByTestId('remark-menu').click();
		await page.getByRole('menuitem', { name: 'Move down' }).click();
		await expect(titles).toHaveText(['Two', 'One']);

		await sections(page).first().getByTestId('remark-menu').click();
		await page.getByRole('menuitem', { name: /Delete section/ }).click();
		await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
		await expect(titles).toHaveText(['One']);

		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(titles).toHaveText(['Two', 'One']);
	});
});
