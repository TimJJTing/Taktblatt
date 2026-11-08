import { expect, test, type Page } from '@playwright/test';
import {
	importJson,
	openExample,
	openPreview,
	row,
	storedPlan,
	waitForAnimations,
	writeStoredPlan
} from './helpers.ts';

const candidateHint = 'Makes a dependency cycle.';
const rowHint = 'This dependency is part of a cycle.';
const cycleToast = 'This change makes a dependency cycle.';

async function openCyclePlan(page: Page, inherited = false) {
	await openExample(page);
	await writeStoredPlan(page, (plan) => {
		plan.range = { start: '2027-01-01', end: '2027-02-28' };
		const base = {
			...plan.tasks[0],
			stageId: plan.stages[0].id,
			parentId: null,
			start: '2027-01-01',
			end: '2027-01-02',
			status: 'todo',
			note: '',
			dependsOn: []
		};
		plan.tasks = inherited
			? [
					{ ...base, id: 'p', title: 'Prepare report', dependsOn: ['x'] },
					{ ...base, id: 'x', title: 'Approve brief', dependsOn: ['s'], status: 'done' },
					{ ...base, id: 's', title: 'Write report', parentId: 'p' }
				]
			: [
					{ ...base, id: 'a', title: 'Prepare report', dependsOn: ['b'] },
					{ ...base, id: 'b', title: 'Approve brief' },
					{ ...base, id: 'c', title: 'Publish report' }
				];
	});
}

async function openDetails(page: Page, title: string) {
	await row(page, title).getByTestId('task-details').click();
	const dialog = page.getByTestId('task-dialog');
	await expect(dialog).toBeVisible();
	await waitForAnimations(dialog);
	return dialog;
}

test('a cycle candidate sorts last, exposes a hint, and commits one warning toast with undo and redo', async ({
	page
}) => {
	await openCyclePlan(page);
	const undo = page.getByRole('button', { name: 'Undo', exact: true });
	const redo = page.getByRole('button', { name: 'Redo', exact: true });
	await expect(undo).toBeDisabled();
	await expect(redo).toBeDisabled();
	const dialog = await openDetails(page, 'Approve brief');
	const input = dialog.getByTestId('dependency-input');
	await input.focus();
	await expect(input).toBeFocused();
	const list = page.getByRole('listbox');
	await expect(list).toBeVisible();
	await waitForAnimations(list);
	const options = list.getByRole('option');
	await expect(options).toHaveCount(2);
	await expect(options.first()).toHaveAccessibleName('Publish report');
	await expect(options.last()).toHaveAccessibleName(new RegExp(`Prepare report.*${candidateHint}`));
	await options.last().hover();
	const hint = page.locator('[data-slot="tooltip-content"]');
	await expect(hint).toBeVisible();
	await waitForAnimations(hint);
	await expect(hint).toHaveText(candidateHint);
	await input.fill('Prepare');
	await input.press('Enter');
	const toast = page.getByText(cycleToast, { exact: true });
	await expect(toast).toHaveCount(1);
	await expect(toast).toBeVisible();
	const chip = dialog.getByTestId('dependency-list').getByRole('listitem');
	await expect(chip.getByRole('img')).toHaveCount(1);
	await expect(chip.getByRole('img')).toHaveAccessibleName(rowHint);
	await chip.getByText('Prepare report', { exact: true }).hover();
	await expect(hint).toBeVisible();
	await waitForAnimations(hint);
	await expect(hint).toContainText(rowHint);
	await dialog.getByTestId('dialog-ok').click();
	// The attribute belongs to the line itself.
	const cycleLines = page.getByTestId('gantt-dependency').and(page.locator('[data-cycle="true"]'));
	await expect(cycleLines).toHaveCount(2);
	await expect(toast).toBeHidden({ timeout: 15_000 });
	await undo.click();
	await expect
		.poll(() =>
			storedPlan(page).then(
				(plan) => plan.tasks.find((t: { id: string }) => t.id === 'b').dependsOn
			)
		)
		.toEqual([]);
	await expect(cycleLines).toHaveCount(0);
	await expect(toast).toHaveCount(0);
	await expect(undo).toBeDisabled();
	const undone = await openDetails(page, 'Prepare report');
	await expect(undone.getByTestId('dependency-list')).toContainText('Approve brief');
	await expect(undone.getByTestId('dependency-list').getByRole('img')).toHaveCount(0);
	await undone.getByTestId('dialog-ok').click();
	await redo.click();
	await expect(cycleLines).toHaveCount(2);
	await expect(toast).toHaveCount(0);
	await expect(redo).toBeDisabled();
	const reopened = await openDetails(page, 'Approve brief');
	await expect(reopened.getByTestId('dependency-list').getByRole('img')).toHaveAccessibleName(
		rowHint
	);
	// An unrelated forward edit preserves the cycle but must not repeat its toast.
	await reopened.getByTestId('dialog-title').click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.type('Approved brief');
	await page.keyboard.press('Enter');
	await reopened.getByTestId('dialog-ok').click();
	await expect(row(page, 'Approved brief')).toBeVisible();
	await expect(toast).toHaveCount(0);
});

test('a candidate with cycle and date warnings shows two complete sentences', async ({ page }) => {
	await openCyclePlan(page);
	await writeStoredPlan(page, (plan) => {
		plan.tasks.find((task: { id: string }) => task.id === 'a').start = '2027-02-01';
		plan.tasks.find((task: { id: string }) => task.id === 'a').end = '2027-02-02';
	});
	const dialog = await openDetails(page, 'Approve brief');
	await dialog.getByTestId('dependency-input').fill('Prepare');
	const option = page.getByRole('listbox').getByRole('option');
	const text = 'Makes a dependency cycle. Starts after this task ends.';
	await expect(option).toHaveAccessibleName(`Prepare report ${text}`);
	await option.hover();
	const hint = page.locator('[data-slot="tooltip-content"]');
	await expect(hint).toBeVisible();
	await waitForAnimations(hint);
	await expect(hint).toHaveText(text);
});

test('an inherited From parent chip warns for the parent-stored edge and both Gantt renderers mark it', async ({
	page
}) => {
	await openCyclePlan(page, true);
	await row(page, 'Prepare report').getByTestId('task-toggle').click();
	const dialog = await openDetails(page, 'Write report');
	const chip = dialog.getByTestId('dependency-list').getByRole('listitem');
	await expect(chip).toContainText('Approve brief');
	await expect(chip).toContainText('From parent Prepare report.');
	await expect(chip.getByRole('button')).toHaveCount(0);
	await expect(chip.getByRole('img')).toHaveCount(1);
	await expect(chip.getByRole('img')).toHaveAccessibleName(rowHint);
	await chip.hover();
	const hint = page.locator('[data-slot="tooltip-content"]');
	await expect(hint).toBeVisible();
	await waitForAnimations(hint);
	await expect(hint).toHaveText('From parent Prepare report. This dependency is part of a cycle.');
	await dialog.getByTestId('dialog-ok').click();
	const lines = page.getByTestId('gantt-dependency');
	await expect(lines).toHaveCount(2);
	for (const line of await lines.all()) {
		await expect(line).toHaveAttribute('data-cycle', 'true');
		await expect(line).toHaveCSS('opacity', '1');
	}
	const preview = await openPreview(page);
	await page.evaluate(() => document.fonts.ready);
	const printed = preview.getByTestId('sheet-gantt-dependency');
	await expect(printed).toHaveCount(2);
	for (const line of await printed.all()) {
		await expect(line).toHaveAttribute('data-cycle', 'true');
		await expect(line).toHaveCSS('opacity', '1');
	}
	await page.emulateMedia({ media: 'print' });
	for (const line of await printed.all()) {
		await expect(line).toHaveAttribute('data-cycle', 'true');
		await expect(line).toHaveCSS('opacity', '1');
	}
	await page.emulateMedia({ media: 'screen' });
});

test('import counts stored rows with cycle and date warnings once without a commit toast', async ({
	page
}) => {
	await openCyclePlan(page);
	const plan = await storedPlan(page);
	plan.id = 'imported-cycle';
	plan.tasks.find((task: { id: string }) => task.id === 'b').dependsOn = ['a'];
	plan.tasks.find((task: { id: string }) => task.id === 'a').start = '2027-02-01';
	plan.tasks.find((task: { id: string }) => task.id === 'a').end = '2027-02-02';
	await importJson(page, { schemaVersion: 1, kind: 'plan', plan });
	await expect(page.getByText('Plan imported', { exact: true })).toBeVisible();
	await expect(page.getByText(/(?:Dependencies|Dependency).*: 2/)).toBeVisible();
	await expect(page.getByText(cycleToast, { exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
	const dialog = await openDetails(page, 'Approve brief');
	const icon = dialog.getByTestId('dependency-list').getByRole('img');
	await expect(icon).toHaveCount(1);
	await expect(icon).toHaveAccessibleName(
		'This dependency is part of a cycle. Prepare report starts after this task ends.'
	);
});

test('a forward move that creates an inherited cycle shows one toast for both new warning rows', async ({
	page
}) => {
	await openCyclePlan(page, true);
	await writeStoredPlan(page, (plan) => {
		plan.tasks.find((task: { id: string }) => task.id === 's').parentId = null;
	});
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
	await expect(page.getByText(cycleToast, { exact: true })).toHaveCount(0);
	const dialog = await openDetails(page, 'Write report');
	await dialog.getByTestId('dialog-parent').click();
	const list = page.getByRole('listbox');
	await expect(list).toBeVisible();
	await waitForAnimations(list);
	await list.getByRole('option', { name: 'Prepare report', exact: true }).click();
	const toast = page.getByText(cycleToast, { exact: true });
	await expect(toast).toHaveCount(1);
	await expect(toast).toBeVisible();
	await expect(dialog.getByTestId('dependency-list').getByRole('img')).toHaveAccessibleName(
		rowHint
	);
	await dialog.getByTestId('dialog-ok').click();
	await expect(toast).toBeHidden({ timeout: 15_000 });
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect
		.poll(() =>
			storedPlan(page).then((plan) => plan.tasks.find((t: { id: string }) => t.id === 's').parentId)
		)
		.toBeNull();
	await expect(toast).toHaveCount(0);
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect
		.poll(() =>
			storedPlan(page).then((plan) => plan.tasks.find((t: { id: string }) => t.id === 's').parentId)
		)
		.toBe('p');
	await expect(toast).toHaveCount(0);
});
