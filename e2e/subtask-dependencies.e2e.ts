import { expect, test, type Page } from '@playwright/test';
import {
	importJson,
	openExample,
	row,
	storedPlan,
	waitForAnimations,
	writeStoredPlan
} from './helpers.ts';

const help =
	'To depend on another task, make this subtask a task, or move it under the same parent.';
const scopeHint = 'A subtask can depend only on tasks with the same parent.';

async function openScopePlan(page: Page) {
	await openExample(page);
	await writeStoredPlan(page, (plan) => {
		const base = {
			...plan.tasks[0],
			stageId: plan.stages[0].id,
			parentId: null,
			start: null,
			end: null,
			status: 'todo',
			note: '',
			dependsOn: []
		};
		// Store children apart from their parents to check picker grouping.
		plan.tasks = [
			{ ...base, id: 'p', title: 'Prepare report' },
			{ ...base, id: 'q', title: 'Publish report' },
			{ ...base, id: 'task', title: 'Approve brief' },
			{ ...base, id: 's', title: 'Write report', parentId: 'p' },
			{ ...base, id: 't', title: 'Review report', parentId: 'p' },
			{ ...base, id: 'u', title: 'Send report', parentId: 'q' }
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

test('a subtask picker offers only siblings and a plain help line', async ({ page }) => {
	await openScopePlan(page);
	await row(page, 'Prepare report').getByTestId('task-toggle').click();
	const dialog = await openDetails(page, 'Write report');
	const input = dialog.getByTestId('dependency-input');
	await input.focus();
	await expect(input).toBeFocused();
	const list = page.getByRole('listbox');
	await expect(list).toBeVisible();
	await waitForAnimations(list);
	await expect(list.getByRole('option')).toHaveText(['Review report']);
	const line = dialog.getByText(help, { exact: true });
	await expect(line).toBeVisible();
	await expect(input).toHaveAccessibleDescription(help);
	// The open list is below the input. The help must not be under the list.
	const helpBox = (await line.boundingBox())!;
	const listBox = (await list.boundingBox())!;
	expect(helpBox.y + helpBox.height).toBeLessThanOrEqual(listBox.y);
	expect(await line.evaluate((element) => element.matches('button, a, input, [tabindex]'))).toBe(
		false
	);
	await input.fill('Approve');
	await expect(list.getByRole('option')).toHaveCount(0);
	await expect(line).toBeVisible();
	await input.fill('Review');
	await input.press('Enter');
	await expect(dialog.getByTestId('dependency-list')).toContainText('Review report');
});

test('a task picker groups indented subtasks under parents in plan order and searches parent titles', async ({
	page
}) => {
	await openScopePlan(page);
	const dialog = await openDetails(page, 'Approve brief');
	const input = dialog.getByTestId('dependency-input');
	await input.focus();
	await expect(input).toBeFocused();
	const options = page.getByRole('listbox').getByRole('option');
	await expect(options).toHaveText([
		'Prepare report',
		/Write report.*Prepare report/,
		/Review report.*Prepare report/,
		'Publish report',
		/Send report.*Publish report/
	]);
	await expect
		.poll(() =>
			options.evaluateAll((elements) => {
				const left = elements.map((element) => {
					const range = document.createRange();
					range.selectNodeContents(element);
					return range.getBoundingClientRect().left;
				});
				return left[1] > left[0] && left[2] > left[0] && left[4] > left[3];
			})
		)
		.toBe(true);
	await input.fill('Prepare');
	await expect(options).toHaveText([
		'Prepare report',
		/Write report.*Prepare report/,
		/Review report.*Prepare report/
	]);
	await input.fill('Write');
	await expect(options).toHaveText([/Write report.*Prepare report/]);
});

test('unwarned options fill the limit first and a subtask stays before its warned parent', async ({
	page
}) => {
	await openScopePlan(page);
	await writeStoredPlan(page, (plan) => {
		const parent = plan.tasks.find((task: { id: string }) => task.id === 'p')!;
		parent.dependsOn = ['task'];
		const base = plan.tasks.find((task: { id: string }) => task.id === 'u')!;
		for (let i = 0; i < 8; i++) {
			plan.tasks.push({ ...base, id: `extra-${i}`, title: `Delivery ${i}` });
		}
	});
	const dialog = await openDetails(page, 'Approve brief');
	const input = dialog.getByTestId('dependency-input');
	await input.focus();
	const options = page.getByRole('listbox').getByRole('option');
	await expect(options).toHaveCount(8);
	await expect(options).toHaveText([
		'Publish report',
		/Send report.*Publish report/,
		/Delivery 0.*Publish report/,
		/Delivery 1.*Publish report/,
		/Delivery 2.*Publish report/,
		/Delivery 3.*Publish report/,
		/Delivery 4.*Publish report/,
		/Delivery 5.*Publish report/
	]);
	// An unwarned subtask stays before its warned parent and sibling.
	await page.keyboard.press('Escape');
	await page.getByTestId('dialog-ok').click();
	await writeStoredPlan(page, (plan) => {
		plan.tasks.find((task: { id: string }) => task.id === 'p')!.dependsOn = [];
		plan.tasks.find((task: { id: string }) => task.id === 'task')!.end = '2027-01-01';
		plan.tasks.find((task: { id: string }) => task.id === 't')!.start = '2027-02-01';
	});
	const reopened = await openDetails(page, 'Approve brief');
	await reopened.getByTestId('dependency-input').fill('Prepare');
	await expect(options).toHaveText([
		/Write report.*Prepare report/,
		/Prepare report/,
		/Review report.*Prepare report/
	]);
	await expect(options.nth(1)).toHaveAccessibleName(/Starts after this task ends\./);
	await expect(options.nth(2)).toHaveAccessibleName(/Starts after this task ends\./);
	await options.nth(1).hover();
	const hint = page.locator('[data-slot="tooltip-content"]');
	await expect(hint).toBeVisible();
	await waitForAnimations(hint);
	await expect(hint).toHaveText('Starts after this task ends.');
});

test('legacy imports count warned rows once and show one icon with all warning reasons', async ({
	page
}) => {
	await openScopePlan(page);
	const plan = await storedPlan(page);
	plan.id = 'legacy-scope';
	const source = plan.tasks.find((task: { id: string }) => task.id === 's')!;
	source.dependsOn = ['task', 'u'];
	source.end = '2027-01-01';
	plan.tasks.find((task: { id: string }) => task.id === 'u')!.start = '2027-02-01';
	await importJson(page, { schemaVersion: 1, kind: 'plan', plan });
	await expect(page.getByText('Plan imported', { exact: true })).toBeVisible();
	await expect(page.getByText(/(?:Dependencies|Dependency).*: 2/)).toBeVisible();
	await row(page, 'Prepare report').getByTestId('task-toggle').click();
	const dialog = await openDetails(page, 'Write report');
	const list = dialog.getByTestId('dependency-list');
	const external = list.getByRole('listitem').filter({ hasText: 'Approve brief' });
	await expect(external.getByRole('img')).toHaveCount(1);
	await expect(external.getByRole('img')).toHaveAccessibleName(scopeHint);
	const both = list.getByRole('listitem').filter({ hasText: 'Send report' });
	await expect(both.getByRole('img')).toHaveCount(1);
	await expect(both.getByRole('img')).toHaveAccessibleName(
		'Send report starts after this task ends. A subtask can depend only on tasks with the same parent.'
	);
	await both.getByText('Send report', { exact: true }).hover();
	const hint = page.locator('[data-slot="tooltip-content"]');
	await expect(hint).toBeVisible();
	await waitForAnimations(hint);
	await expect(hint).toHaveText(
		'Send report starts after this task ends. A subtask can depend only on tasks with the same parent.'
	);
	await page.getByTestId('dialog-ok').click();
	const parent = await openDetails(page, 'Prepare report');
	await expect(parent.getByTestId('dependency-list')).toHaveCount(0);
});

test('a move removes non-sibling dependencies in one undo step', async ({ page }) => {
	await openScopePlan(page);
	await writeStoredPlan(page, (plan) => {
		plan.tasks.find((task: { id: string }) => task.id === 'task')!.dependsOn = ['q'];
	});
	const before = await storedPlan(page);
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
	const dialog = await openDetails(page, 'Approve brief');
	await dialog.getByTestId('dialog-parent').click();
	const listbox = page.getByRole('listbox');
	await expect(listbox).toBeVisible();
	await waitForAnimations(listbox);
	await listbox.getByRole('option', { name: 'Prepare report', exact: true }).click();
	const move = page.getByTestId('move-dialog');
	await expect(move).toContainText(
		'Remove dependency: a subtask can depend only on tasks with the same parent'
	);
	await move.getByRole('button', { name: 'Remove and move' }).click();
	await expect(move).toBeHidden();
	await expect(dialog.getByTestId('dependency-list')).toHaveCount(0);
	await dialog.getByTestId('dialog-ok').click();
	const moved = () =>
		storedPlan(page).then((plan) => plan.tasks.find((task: { id: string }) => task.id === 'task'));
	await expect.poll(moved).toMatchObject({ parentId: 'p', dependsOn: [] });
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect
		.poll(moved)
		.toMatchObject(before.tasks.find((task: { id: string }) => task.id === 'task'));
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect.poll(moved).toMatchObject({ parentId: 'p', dependsOn: [] });
	await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();
});

test('the dependency list scrolls into the dialog when it opens near the dialog bottom', async ({
	page
}) => {
	await openExample(page);
	const dialog = await openDetails(page, 'First harvest');
	await dialog.getByTestId('dependency-input').focus();
	const list = page.getByRole('listbox');
	await expect(list).toBeVisible();
	// The dialog scrolls. The full list must be inside its visible area.
	await expect
		.poll(async () => {
			const listBox = (await list.boundingBox())!;
			const dialogBox = (await dialog.boundingBox())!;
			return listBox.y + listBox.height <= dialogBox.y + dialogBox.height;
		})
		.toBe(true);
});
