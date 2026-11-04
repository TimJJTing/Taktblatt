import { expect, test, type Page } from '@playwright/test';
import { openExample, stage } from './helpers';

const row = (page: Page, stageIndex: number, title: string) =>
	stage(page, stageIndex).getByTestId('task-row').filter({ hasText: title });

async function openDetails(page: Page, stageIndex: number, title: string) {
	await row(page, stageIndex, title).getByTestId('task-details').click();
	await expect(page.getByTestId('task-dialog')).toBeVisible();
}

async function setDates(page: Page, stageIndex: number, title: string, start: string, end: string) {
	await row(page, stageIndex, title).getByTestId('task-target').click();
	await page.getByTestId('date-start').fill(start);
	await page.getByTestId('date-end').fill(end);
	await page.getByTestId('date-end').press('Enter');
	await page.getByRole('button', { name: 'Done', exact: true }).click();
}

test.describe('task dialog', () => {
	test('Esc closes the dialog and the focus goes back to the "…" button', async ({ page }) => {
		await openExample(page);
		await openDetails(page, 1, 'Sowing');
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('task-dialog')).toBeHidden();
		await expect(row(page, 1, 'Sowing').getByTestId('task-details')).toBeFocused();
	});

	test('a title change in the dialog shows in the table and in mentions', async ({ page }) => {
		await openExample(page);
		await row(page, 0, 'Soil preparation').getByTestId('task-toggle').click();
		await openDetails(page, 0, 'Add compost');
		await page.getByTestId('dialog-title').click();
		await page.keyboard.press('ControlOrMeta+a');
		await page.keyboard.type('Spread compost');
		await page.keyboard.press('Enter');
		await page.getByTestId('dialog-ok').click();
		await expect(stage(page, 0).getByTestId('task-title')).toContainText(['Spread compost']);
		await openDetails(page, 1, 'Sowing');
		await expect(page.getByTestId('note-display')).toContainText('@Spread compost');
	});

	test('a mention can be inserted in the note', async ({ page }) => {
		await openExample(page);
		await openDetails(page, 2, 'Neighbourhood stall');
		await page.getByTestId('note-display').click();
		await page.keyboard.type('Bring produce from @first har');
		await page.keyboard.press('Enter');
		await page.keyboard.type('please.');
		await page.getByTestId('dialog-ok').click();
		await openDetails(page, 2, 'Neighbourhood stall');
		await expect(page.getByTestId('note-display')).toHaveText(
			'Bring produce from @First harvest please.'
		);
	});

	test('the dependency picker hides invalid candidates and adds a dependency', async ({ page }) => {
		await openExample(page);
		await openDetails(page, 1, 'Sowing');
		await page.getByTestId('dependency-input').fill('harvest');
		// "First harvest" depends on "Sowing", so it would make a cycle.
		await expect(page.getByRole('option')).toHaveCount(0);
		await page.getByTestId('dependency-input').fill('site');
		await expect(page.getByRole('option', { name: 'Site survey' })).toBeVisible();
		await page.keyboard.press('Enter');
		await expect(page.getByTestId('dependency-list')).toContainText('Site survey');
	});

	test('a parent change with a date conflict asks to clear the date', async ({ page }) => {
		await openExample(page);
		// "First harvest" depends on "Sowing" and ends 70 days from today.
		// Give "Watering rota" dates after that, then make it the first subtask of "Sowing".
		const today = new Date();
		const iso = (days: number) =>
			new Date(today.getTime() + days * 86_400_000).toISOString().slice(0, 10);
		await setDates(page, 1, 'Watering rota', iso(90), iso(95));
		await openDetails(page, 1, 'Watering rota');
		await page.getByTestId('dialog-parent').click();
		await page.getByRole('option', { name: 'Sowing' }).click();
		const dialog = page.getByTestId('move-dialog');
		await expect(dialog).toContainText('Clear the start date of this task');
		await dialog.getByRole('button', { name: 'Remove and move' }).click();
		await expect(page.getByTestId('dialog-parent')).toContainText('Sowing');
		await page.getByTestId('dialog-ok').click();
		await expect(row(page, 1, 'Sowing').getByTestId('task-toggle')).toBeVisible();
	});

	test('delete shows the impact and removes the task', async ({ page }) => {
		await openExample(page);
		await openDetails(page, 0, 'Soil preparation');
		await page.getByRole('button', { name: 'Delete…' }).click();
		await expect(page.getByRole('alertdialog')).toContainText('2 subtasks');
		await expect(page.getByRole('alertdialog')).toContainText('1 other tasks depend');
		await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
		await expect(stage(page, 0).getByTestId('task-title')).toHaveText([
			'Site survey',
			'Order seeds'
		]);
	});
});
