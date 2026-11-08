import { expect, test, type Page, type Locator } from '@playwright/test';
import { openExample, row, storedPlan, waitForAnimations, writeStoredPlan } from './helpers.ts';

async function openPlannedWindow(page: Page) {
	await openExample(page);
	await writeStoredPlan(page, (plan) => {
		const parent = plan.tasks.find((task) => task.title === 'Soil preparation')!;
		const child = plan.tasks.find((task) => task.title === 'Soil test')!;
		Object.assign(parent, {
			start: '2027-02-01',
			end: '2027-02-28',
			owners: ['Own', 'Child'],
			status: 'done',
			dependsOn: []
		});
		Object.assign(child, {
			start: '2027-02-10',
			end: '2027-02-20',
			owners: ['Child'],
			status: 'done',
			dependsOn: []
		});
		plan.tasks = [parent, child];
		plan.range = { start: '2027-01-01', end: '2027-03-31' };
	});
}

async function openRange(page: Page, trigger: Locator) {
	await trigger.click();
	await expect(page.getByRole('textbox', { name: 'Start', exact: true })).toBeFocused();
	await waitForAnimations(page.locator('[data-slot="popover-content"]'));
}

async function typeRange(page: Page, start: string, end: string) {
	await page.getByRole('textbox', { name: 'Start', exact: true }).fill(start);
	await page.getByRole('textbox', { name: 'End', exact: true }).fill(end);
	await page.getByRole('textbox', { name: 'End', exact: true }).press('Enter');
}

async function parentValues(page: Page) {
	const plan = await storedPlan(page);
	return plan.tasks.find((task) => task.title === 'Soil preparation')!;
}

test('a subtask edit widens the parent row and the last-subtask deletion keeps that window', async ({
	page
}) => {
	await openPlannedWindow(page);
	const parent = row(page, 'Soil preparation');
	await parent.getByRole('button', { name: 'Expand Soil preparation', exact: true }).click();
	const child = row(page, 'Soil test');
	const undo = page.getByRole('button', { name: 'Undo', exact: true });
	const redo = page.getByRole('button', { name: 'Redo', exact: true });
	await expect(undo).toBeDisabled();
	await expect(redo).toBeDisabled();
	const before = await parentValues(page);
	await openRange(page, child.getByRole('button', { name: /^Target:/ }));
	await typeRange(page, '2027-01-15', '2027-03-15');
	await page.getByRole('button', { name: 'Done', exact: true }).click();
	// The Target cell shows the end date. Its name has the full range.
	await expect(parent.getByRole('button', { name: /^Target:/ })).toContainText('Mar 15');
	await expect(parent.getByRole('button', { name: /^Target:/ })).toHaveAccessibleName(
		/Jan 15.*Mar 15/
	);
	await expect
		.poll(() => parentValues(page))
		.toMatchObject({ start: '2027-01-15', end: '2027-03-15' });
	const widened = await parentValues(page);
	await undo.click();
	await expect.poll(() => parentValues(page)).toEqual(before);
	await expect(undo).toBeDisabled();
	await redo.click();
	await expect.poll(() => parentValues(page)).toEqual(widened);
	await expect(redo).toBeDisabled();
	await child.getByRole('button', { name: 'Details: Soil test', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Subtask details', exact: true });
	await expect(dialog).toBeVisible();
	await waitForAnimations(dialog);
	await dialog.getByRole('button', { name: 'Delete…', exact: true }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(child).toHaveCount(0);
	await expect.poll(() => parentValues(page)).toEqual(widened);
	await expect(parent.getByRole('button', { name: /^Target:/ })).toContainText('Mar 15');
	await expect(parent.getByRole('button', { name: /^Owner:/ })).toContainText('Own');
	await expect(parent.getByRole('button', { name: /^Owner:/ })).toContainText('Child');
	await undo.click();
	await expect(child).toBeVisible();
	await expect.poll(() => parentValues(page)).toEqual(widened);
	await redo.click();
	await expect(child).toHaveCount(0);
	await expect.poll(() => parentValues(page)).toEqual(widened);
	await expect(redo).toBeDisabled();
});

test('the parent dialog edits its stored window and rejects dates inside the subtask floor', async ({
	page
}) => {
	await openPlannedWindow(page);
	await row(page, 'Soil preparation')
		.getByRole('button', { name: 'Details: Soil preparation', exact: true })
		.click();
	const dialog = page.getByRole('dialog', { name: 'Task details', exact: true });
	await expect(dialog).toBeVisible();
	await waitForAnimations(dialog);
	const range = dialog.getByRole('button', { name: /^Dates:/ });
	await expect(range).toContainText(/Feb 1\b.*28/);
	await expect(page.getByRole('img', { name: /^Soil preparation:/ })).toHaveAccessibleName(
		/Feb 1\b.*28/
	);
	await openRange(page, range);
	await typeRange(page, '2027-02-05', '2027-02-25');
	await page.getByRole('button', { name: 'Done', exact: true }).click();
	await expect
		.poll(() => parentValues(page))
		.toMatchObject({ start: '2027-02-05', end: '2027-02-25' });
	const before = await parentValues(page);
	for (const [start, end] of [
		['2027-02-11', '2027-02-25'],
		['2027-02-05', '2027-02-19'],
		['', '2027-02-25'],
		['2027-02-05', '']
	]) {
		await openRange(page, range);
		await typeRange(page, start, end);
		await expect(page.locator('[data-slot="popover-content"]').getByRole('alert')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();
		await expect.poll(() => parentValues(page)).toEqual(before);
		await page.keyboard.press('Escape');
		await expect(range).toBeFocused();
	}
	await openRange(page, range);
	await typeRange(page, '2027-02-11', '2027-02-25');
	await expect(page.locator('[data-slot="popover-content"]').getByRole('alert')).toBeVisible();
	// Ordinary dismissal must not save the invalid draft.
	// Click inside the dialog, outside the popover.
	const box = (await dialog.boundingBox())!;
	await page.mouse.click(box.x + 12, box.y + 12);
	await expect.poll(() => parentValues(page)).toEqual(before);
	if (await page.getByRole('textbox', { name: 'Start', exact: true }).isVisible()) {
		await page.keyboard.press('Escape');
	}
	// Select a different range in the calendar. It must satisfy the same floor.
	await openRange(page, range);
	await page.getByRole('button', { name: /February 12, 2027/ }).click();
	await page.getByRole('button', { name: /February 18, 2027/ }).click();
	await expect(page.locator('[data-slot="popover-content"]').getByRole('alert')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();
	await expect.poll(() => parentValues(page)).toEqual(before);
	await page.keyboard.press('Escape');
	await expect(range).toBeFocused();
	await dialog.getByRole('button', { name: 'OK', exact: true }).click();
	const parent = row(page, 'Soil preparation');
	await expect(parent.getByRole('button', { name: /^Target:/ })).toContainText('Feb 25');
	// The grid has the same date floor as the dialog.
	const gridRange = parent.getByRole('button', { name: /^Target:/ });
	await openRange(page, gridRange);
	await typeRange(page, '2027-02-11', '2027-02-25');
	await expect(page.locator('[data-slot="popover-content"]').getByRole('alert')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();
	await expect.poll(() => parentValues(page)).toEqual(before);
	await page.keyboard.press('Escape');
	await expect(gridRange).toBeFocused();
	await openRange(page, gridRange);
	await typeRange(page, '2027-02-01', '2027-02-28');
	await page.getByRole('button', { name: 'Done', exact: true }).click();
	await expect
		.poll(() => parentValues(page))
		.toMatchObject({ start: '2027-02-01', end: '2027-02-28' });
});

test('parent owner editors lock subtask owners and allow free owners to be removed and added', async ({
	page
}) => {
	await openPlannedWindow(page);
	await row(page, 'Soil preparation')
		.getByRole('button', { name: 'Details: Soil preparation', exact: true })
		.click();
	const dialog = page.getByRole('dialog', { name: 'Task details', exact: true });
	await expect(dialog).toBeVisible();
	await waitForAnimations(dialog);
	await dialog.getByRole('button', { name: /^Owner:/ }).click();
	const input = page.getByRole('textbox', { name: 'Name', exact: true });
	await expect(input).toBeVisible();
	await waitForAnimations(page.locator('[data-slot="popover-content"]'));
	await expect(page.getByRole('button', { name: 'Remove Child', exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Remove Own', exact: true }).click();
	await input.fill('Free');
	await input.press('Enter');
	await expect.poll(async () => (await parentValues(page)).owners).toEqual(['Child', 'Free']);
	await page.keyboard.press('Escape');
	await dialog.getByRole('button', { name: 'OK', exact: true }).click();
	await row(page, 'Soil preparation')
		.getByRole('button', { name: /^Owner:/ })
		.click();
	await expect(input).toBeVisible();
	await waitForAnimations(page.locator('[data-slot="popover-content"]'));
	await expect(page.getByRole('button', { name: 'Remove Child', exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Remove Free', exact: true }).click();
	await expect.poll(async () => (await parentValues(page)).owners).toEqual(['Child']);
});
