import { expect, test } from '@playwright/test';
import { openApp, openExample, row, storedPlan } from './helpers';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('workspace', () => {
	test('the example load supports undo and redo, and a reload keeps the plan', async ({ page }) => {
		await openApp(page);
		await expect(page.getByTestId('plan-heading')).toHaveText('Untitled plan');
		await page.getByRole('button', { name: 'Load example' }).click();
		await expect(page.getByTestId('plan-heading')).toContainText('Community Garden');
		await page.getByRole('button', { name: 'Undo', exact: true }).click();
		await expect(page.getByTestId('plan-heading')).toHaveText('Untitled plan');
		await page.getByRole('button', { name: 'Redo', exact: true }).click();
		await expect(page.getByTestId('plan-heading')).toContainText('Community Garden');
		await page.reload();
		await expect(page.getByTestId('plan-heading')).toContainText('Community Garden');
		await expect(page).toHaveTitle(/Community Garden/);
		// The history is in memory only. A reload clears it.
		await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
	});

	test('the undo shortcut reverts the last commit', async ({ page }) => {
		await openExample(page);
		await page.keyboard.press(`${mod}+z`);
		await expect(page.getByTestId('plan-heading')).toHaveText('Untitled plan');
		await page.keyboard.press(`${mod}+Shift+z`);
		await expect(page.getByTestId('plan-heading')).toContainText('Community Garden');
	});

	test('the save shortcut shows a Saved toast', async ({ page }) => {
		await openApp(page);
		// Headless Chromium on macOS keeps Cmd+S for itself. The app also accepts Ctrl+S.
		await page.keyboard.press('Control+s');
		await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	});

	test('plans can be created, switched, deleted and restored', async ({ page }) => {
		await openExample(page);
		await page.getByTestId('plan-switcher').click();
		await page.getByRole('menuitem', { name: 'New plan' }).click();
		await expect(page.getByTestId('plan-heading')).toHaveText('Untitled plan');

		await page.getByTestId('plan-switcher').click();
		await page.getByRole('menuitemradio', { name: /Community Garden/ }).click();
		await expect(page.getByTestId('plan-heading')).toContainText('Community Garden');
		await row(page, 'Soil preparation').getByTestId('task-toggle').click();
		await expect(row(page, 'Soil test')).toBeVisible();

		await page.getByTestId('plan-switcher').click();
		await page.getByRole('menuitem', { name: 'Delete plan…' }).click();
		await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
		await expect(page.getByTestId('plan-heading')).toHaveText('Untitled plan');
		await page.getByRole('button', { name: 'Undo' }).filter({ hasText: 'Undo' }).click();
		await expect(page.getByTestId('plan-heading')).toContainText('Community Garden');
		// Undo also restores the expanded rows.
		await expect(row(page, 'Soil test')).toBeVisible();
	});

	test('rename changes the heading in one undo step', async ({ page }) => {
		await openExample(page);
		const original = (await storedPlan(page)).heading;
		await page.getByTestId('plan-switcher').click();
		await page.getByRole('menuitem', { name: 'Rename plan…' }).click();
		await page.getByTestId('plan-rename-input').fill('Spring plan');
		await page.getByTestId('plan-rename-input').press('Enter');
		await expect(page.getByTestId('plan-rename-dialog')).toBeHidden();
		await expect(page.getByTestId('plan-heading')).toHaveText('Spring plan');
		await expect(page.getByTestId('plan-switcher')).toContainText('Spring plan');
		await page.getByRole('button', { name: 'Undo', exact: true }).click();
		await expect(page.getByTestId('plan-heading')).toHaveText(original);
	});

	test('an empty name keeps the previous name', async ({ page }) => {
		await openExample(page);
		const original = (await storedPlan(page)).heading;
		await page.getByTestId('plan-switcher').click();
		await page.getByRole('menuitem', { name: 'Rename plan…' }).click();
		await page.getByTestId('plan-rename-input').fill('   ');
		await page.getByTestId('plan-rename-ok').click();
		await expect(page.getByTestId('plan-heading')).toHaveText(original);
	});

	test('duplicate adds a copy suffix', async ({ page }) => {
		await openExample(page);
		const original = (await storedPlan(page)).heading;
		await page.getByTestId('plan-switcher').click();
		await page.getByRole('menuitem', { name: 'Duplicate plan' }).click();
		await expect(page.getByTestId('plan-heading')).toHaveText(`${original} (copy)`);
	});

	test('Escape closes the rename dialog without a change', async ({ page }) => {
		await openExample(page);
		const original = (await storedPlan(page)).heading;
		await page.getByTestId('plan-switcher').click();
		await page.getByRole('menuitem', { name: 'Rename plan…' }).click();
		await page.getByTestId('plan-rename-input').fill('Other');
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('plan-rename-dialog')).toBeHidden();
		await expect(page.getByTestId('plan-heading')).toHaveText(original);
	});

	test('a change in one tab shows in the other tab', async ({ context }) => {
		const one = await context.newPage();
		await openApp(one);
		const two = await context.newPage();
		await openApp(two);
		await one.getByRole('button', { name: 'Load example' }).click();
		await expect(two.getByTestId('plan-heading')).toContainText('Community Garden');
	});

	test('damaged data shows a notice and the app starts', async ({ page }) => {
		await page.addInitScript(() => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.setItem('taktblatt:index', JSON.stringify({ planIds: ['x'], activeId: 'x' }));
			localStorage.setItem('taktblatt:plan:x', '{broken');
		});
		await page.goto('/');
		await expect(page.getByRole('alert').filter({ hasText: 'could not be read' })).toBeVisible();
		await expect(page.getByTestId('plan-heading')).toHaveText('Untitled plan');
		const download = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Download backup' }).click();
		expect((await download).suggestedFilename()).toBe('taktblatt-damaged-data.txt');
	});
});
