import { expect, test } from '@playwright/test';
import { openApp, openExample, row, stage, titles } from './helpers';

test.describe('work plan', () => {
	test('a new task gets a title, and Escape removes an empty new task', async ({ page }) => {
		await openApp(page);
		const first = stage(page, 0);
		await first.hover();
		await first.getByTestId('add-task').click();
		await page.keyboard.type('Write brief');
		await page.keyboard.press('Enter');
		await expect(first.getByTestId('task-title')).toHaveText(['Write brief']);

		await first.getByTestId('add-task').click();
		await page.keyboard.press('Escape');
		await expect(first.getByTestId('task-row')).toHaveCount(1);
		// The empty row left no undo step. Undo reverts the title, then the new task.
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(first.getByTestId('task-title')).toHaveText(['New task']);
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(first.getByTestId('task-row')).toHaveCount(0);
	});

	test('Enter commits and moves to the same column in the next row', async ({ page }) => {
		await openExample(page);
		const first = stage(page, 0);
		await first.getByTestId('task-deliverable').first().click();
		await page.keyboard.press('ControlOrMeta+a');
		await page.keyboard.type('Site map');
		await page.keyboard.press('Enter');
		await expect(first.getByTestId('task-deliverable').first()).toHaveText('Site map');
		await expect(first.getByTestId('task-deliverable').nth(1)).toBeFocused();
	});

	test('the done checkbox updates the stage progress and the ready light', async ({ page }) => {
		await openExample(page);
		const grow = stage(page, 1);
		await expect(grow.getByTestId('stage-progress')).toContainText('0 / 2');
		// "First harvest" depends on "Sowing". Marking "Sowing" done turns on the ready light of "First harvest".
		const harvest = row(page, 'First harvest');
		await expect(harvest.getByTestId('ready-dot')).toHaveCount(0);
		await row(page, 'Sowing').getByTestId('task-done').click();
		await expect(grow.getByTestId('stage-progress')).toContainText('1 / 2');
		await expect(harvest.getByTestId('ready-dot')).toBeVisible();
	});

	test('a subtask can be added, and the parent shows derived values', async ({ page }) => {
		await openExample(page);
		const first = stage(page, 0);
		const parent = row(page, 'Soil preparation');
		await parent.getByTestId('task-toggle').click();
		await expect(parent.getByTestId('task-toggle')).toHaveAttribute('aria-expanded', 'true');
		await parent.hover();
		await first.locator('tbody', { has: parent }).getByTestId('add-subtask').click();
		await page.keyboard.type('Mulch');
		await page.keyboard.press('Enter');
		await expect(titles(page, 0)).toHaveText([
			'Site survey',
			'Soil preparation',
			'Soil test',
			'Add compost',
			'Mulch',
			'Order seeds'
		]);
		await expect(parent.getByTestId('task-owners')).toContainText('Kai');
	});

	test('a date change re-sorts the tasks', async ({ page }) => {
		await openExample(page);
		await expect(titles(page, 1)).toHaveText(['Sowing', 'Watering rota']);
		const watering = row(page, 'Watering rota');
		await watering.getByTestId('task-target').click();
		await page.getByTestId('date-start').fill('2020-01-01');
		await page.getByTestId('date-start').press('Enter');
		await page.getByRole('button', { name: 'Done', exact: true }).click();
		await expect(titles(page, 1)).toHaveText(['Watering rota', 'Sowing']);
	});

	test('owners can be added and renamed everywhere', async ({ page }) => {
		await openExample(page);
		const stall = row(page, 'Neighbourhood stall');
		await stall.getByTestId('owner-field').click();
		await page.getByTestId('owner-input').fill('Lee');
		await page.getByTestId('owner-input').press('Enter');
		await page.keyboard.press('Escape');
		await expect(stall.getByTestId('owner-field')).toContainText('Lee');

		await stall.getByTestId('owner-field').click();
		await page.getByRole('button', { name: 'Rename “Kai” everywhere' }).click();
		await page.getByRole('menuitem', { name: 'Rename everywhere…' }).click();
		await page.getByRole('dialog').getByRole('textbox').fill('Kairo');
		await page.getByRole('dialog').getByRole('button', { name: 'Rename' }).click();
		await expect(page.getByText('Kai', { exact: true })).toHaveCount(0);
		await expect(page.getByText('Kairo', { exact: true }).first()).toBeVisible();
	});

	test('stages can be added, renamed, recolored, moved and deleted', async ({ page }) => {
		await openExample(page);
		await page.getByTestId('add-stage').click();
		await expect(page.getByTestId('stage')).toHaveCount(4);
		const last = stage(page, 3);
		await last.getByTestId('stage-title').click();
		await page.keyboard.type('Review');
		await page.keyboard.press('Enter');
		await expect(last.getByTestId('stage-title')).toHaveText('Review');

		await last.getByTestId('stage-color').click();
		await page.getByRole('radio', { name: 'violet' }).click();
		await expect(last.getByTestId('stage-color')).toHaveAttribute(
			'aria-label',
			'Stage color: violet'
		);

		await last.getByTestId('stage-menu').click();
		await page.getByRole('menuitem', { name: 'Move up' }).click();
		await expect(stage(page, 2).getByTestId('stage-title')).toHaveText('Review');

		await stage(page, 0).getByTestId('stage-menu').click();
		await page.getByRole('menuitem', { name: 'Delete stage…' }).click();
		await expect(page.getByRole('alertdialog')).toContainText('5 tasks');
		await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
		await expect(page.getByTestId('stage')).toHaveCount(3);
	});
});
