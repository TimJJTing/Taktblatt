import { expect, test } from '@playwright/test';
import { openApp, openExample, stage, titles } from './helpers';

test.describe('work plan', () => {
	test('a new task gets a title, and an empty new task is removed on blur', async ({ page }) => {
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
		const harvest = stage(page, 2).getByTestId('task-row').filter({ hasText: 'First harvest' });
		await expect(harvest.getByTestId('ready-dot')).toHaveCount(0);
		await grow
			.getByTestId('task-row')
			.filter({ hasText: 'Sowing' })
			.getByTestId('task-done')
			.click();
		await expect(grow.getByTestId('stage-progress')).toContainText('1 / 2');
		await expect(harvest.getByTestId('ready-dot')).toBeVisible();
	});

	test('a subtask can be added, and the parent shows derived values', async ({ page }) => {
		await openExample(page);
		const first = stage(page, 0);
		const parent = first.getByTestId('task-row').filter({ hasText: 'Soil preparation' });
		await parent.getByTestId('task-toggle').click();
		await expect(parent.getByTestId('task-toggle')).toHaveAttribute('aria-expanded', 'true');
		await parent.hover();
		await first.getByTestId('add-subtask').first().click();
		await page.keyboard.type('Mulch');
		await page.keyboard.press('Enter');
		await expect(first.getByTestId('task-title')).toContainText([
			'Soil preparation',
			'Soil test',
			'Add compost',
			'Mulch'
		]);
		await expect(parent.getByTestId('task-owners')).toContainText('Kai');
	});

	test('a date change re-sorts the tasks', async ({ page }) => {
		await openExample(page);
		expect(await titles(page, 1)).toEqual(['Sowing', 'Watering rota']);
		const watering = stage(page, 1).getByTestId('task-row').filter({ hasText: 'Watering rota' });
		await watering.getByTestId('task-target').click();
		await page.getByTestId('date-start').fill('2020-01-01');
		await page.getByTestId('date-start').press('Enter');
		await page.getByRole('button', { name: 'Done', exact: true }).click();
		await expect.poll(() => titles(page, 1)).toEqual(['Watering rota', 'Sowing']);
	});

	test('owners can be added and renamed everywhere', async ({ page }) => {
		await openExample(page);
		const stall = stage(page, 2).getByTestId('task-row').filter({ hasText: 'Neighbourhood stall' });
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
