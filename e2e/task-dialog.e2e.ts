import { expect, test, type Page } from '@playwright/test';
import { openExample, row, stage, storedPlan, writeStoredPlan } from './helpers.ts';

async function openDetails(page: Page, title: string) {
	await row(page, title).getByTestId('task-details').click();
	await expect(page.getByTestId('task-dialog')).toBeVisible();
}

async function setDates(page: Page, title: string, start: string, end: string) {
	await row(page, title).getByTestId('task-target').click();
	await page.getByTestId('date-start').fill(start);
	await page.getByTestId('date-end').fill(end);
	await page.getByTestId('date-end').press('Enter');
	await page.getByRole('button', { name: 'Done', exact: true }).click();
}

test.describe('task dialog', () => {
	test('Esc closes the dialog and the focus goes back to the "…" button', async ({ page }) => {
		await openExample(page);
		await openDetails(page, 'Sowing');
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('task-dialog')).toBeHidden();
		await expect(row(page, 'Sowing').getByTestId('task-details')).toBeFocused();
	});

	test('a title change in the dialog shows in the table and in mentions', async ({ page }) => {
		await openExample(page);
		await row(page, 'Soil preparation').getByTestId('task-toggle').click();
		await openDetails(page, 'Add compost');
		await page.getByTestId('dialog-title').click();
		await page.keyboard.press('ControlOrMeta+a');
		await page.keyboard.type('Spread compost');
		await page.keyboard.press('Enter');
		await page.getByTestId('dialog-ok').click();
		await expect(row(page, 'Spread compost')).toBeVisible();
		await openDetails(page, 'Sowing');
		await expect(page.getByTestId('note-display')).toContainText('@Spread compost');
	});

	test('a mention can be inserted in the note', async ({ page }) => {
		await openExample(page);
		await openDetails(page, 'Neighbourhood stall');
		await page.getByTestId('note-display').click();
		await page.keyboard.type('Bring produce from @first har');
		await page.keyboard.press('Enter');
		await page.keyboard.type('please.');
		await page.getByTestId('dialog-ok').click();
		await openDetails(page, 'Neighbourhood stall');
		await expect(page.getByTestId('note-display')).toHaveText(
			'Bring produce from @First harvest please.'
		);
	});

	test('the dependency picker marks cycle candidates and adds a dependency', async ({ page }) => {
		await openExample(page);
		await openDetails(page, 'Sowing');
		await page.getByTestId('dependency-input').fill('harvest');
		// "First harvest" depends on "Sowing", so it is allowed with a cycle warning.
		await expect(
			page.getByRole('option', { name: /First harvest.*Makes a dependency cycle/ })
		).toBeVisible();
		await expect(page.getByRole('option', { name: /First harvest/ })).toHaveAccessibleName(
			/Starts after this task ends/
		);
		await page.getByTestId('dependency-input').fill('site');
		await expect(page.getByRole('option', { name: 'Site survey' })).toBeVisible();
		await page.keyboard.press('Enter');
		await expect(page.getByTestId('dependency-list')).toContainText('Site survey');
	});

	test('a later first subtask widens the parent end and keeps its planned start', async ({
		page
	}) => {
		await openExample(page);
		// "First harvest" depends on "Sowing" and ends 70 days from today.
		// Give "Watering rota" later dates. The planned start of "Sowing" stays unchanged.
		// Get the local dates from the browser, as the example plan does.
		const [start, end] = await page.evaluate(() =>
			[90, 95].map((days) => {
				const date = new Date();
				date.setDate(date.getDate() + days);
				return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
			})
		);
		await setDates(page, 'Watering rota', start, end);
		const before = await storedPlan(page);
		const plannedStart = before.tasks.find((task) => task.title === 'Sowing')!.start;
		await openDetails(page, 'Watering rota');
		await page.getByTestId('dialog-parent').click();
		await page.getByRole('option', { name: 'Sowing' }).click();
		await expect(page.getByTestId('move-dialog')).toHaveCount(0);
		await expect(page.getByTestId('dialog-parent')).toContainText('Sowing');
		await expect
			.poll(async () => {
				const plan = await storedPlan(page);
				const parent = plan.tasks.find((task) => task.title === 'Sowing')!;
				return { start: parent.start, end: parent.end };
			})
			.toEqual({ start: plannedStart, end });
		await page.getByTestId('dialog-ok').click();
		await expect(row(page, 'Sowing').getByTestId('task-toggle')).toBeVisible();
	});

	test('moving under an undated parent clears the conflicting start in one undo step', async ({
		page
	}) => {
		await openExample(page);
		await writeStoredPlan(page, (plan) => {
			const base = { ...plan.tasks[0], parentId: null, owners: [], dependsOn: [], note: '' };
			plan.tasks = [
				{ ...base, id: 'destination', title: 'Destination', start: null, end: null },
				{
					...base,
					id: 'dependent',
					title: 'Dependent',
					start: null,
					end: '2027-01-10',
					dependsOn: ['destination']
				},
				{ ...base, id: 'incoming', title: 'Incoming', start: '2027-01-20', end: '2027-01-25' }
			];
		});
		const before = await storedPlan(page);
		const undo = page.getByRole('button', { name: 'Undo', exact: true });
		const redo = page.getByRole('button', { name: 'Redo', exact: true });
		await expect(undo).toBeDisabled();
		await expect(redo).toBeDisabled();
		await openDetails(page, 'Incoming');
		await page.getByTestId('dialog-parent').click();
		await page.getByRole('option', { name: 'Destination', exact: true }).click();
		const dialog = page.getByTestId('move-dialog');
		await expect(dialog).toContainText(
			'Clear the start date of this task. Else “Destination” would start after “Dependent” ends.'
		);
		await dialog.getByRole('button', { name: 'Remove and move', exact: true }).click();
		await expect(dialog).toBeHidden();
		await expect(page.getByTestId('dialog-parent')).toContainText('Destination');
		await expect
			.poll(async () => (await storedPlan(page)).tasks.find((task) => task.id === 'incoming'))
			.toMatchObject({ parentId: 'destination', start: null, end: '2027-01-25' });
		const moved = await storedPlan(page);
		expect(moved.tasks.find((task) => task.id === 'destination')).toMatchObject({
			start: null,
			end: '2027-01-25'
		});
		await page.getByTestId('dialog-ok').click();
		await undo.click();
		await expect.poll(async () => (await storedPlan(page)).tasks).toEqual(before.tasks);
		await expect(undo).toBeDisabled();
		await redo.click();
		await expect.poll(async () => (await storedPlan(page)).tasks).toEqual(moved.tasks);
		await expect(redo).toBeDisabled();
	});

	test('delete shows the impact and removes the task', async ({ page }) => {
		await openExample(page);
		await openDetails(page, 'Soil preparation');
		await page.getByRole('button', { name: 'Delete…' }).click();
		await expect(page.getByRole('alertdialog')).toContainText('Subtasks deleted with the task: 2');
		await expect(page.getByRole('alertdialog')).toContainText('Other tasks that depend on it: 1');
		await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
		await expect(stage(page, 0).getByTestId('task-title')).toHaveText([
			'Site survey',
			'Order seeds'
		]);
	});
});
