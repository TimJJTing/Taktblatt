import { expect, test, type Page } from '@playwright/test';
import { openExample, row, setTaskStatus, waitForAnimations, writeStoredPlan } from './helpers.ts';

async function openReadyPlan(page: Page) {
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
		plan.tasks = [
			{ ...base, id: 'dependency', title: 'Approve brief' },
			{ ...base, id: 'parent', title: 'Prepare report', dependsOn: ['dependency'] },
			{ ...base, id: 'subtask', title: 'Write report', parentId: 'parent' }
		];
	});
}

test('a todo task without dependencies has a ready light named Ready', async ({ page }) => {
	await openReadyPlan(page);
	const light = row(page, 'Approve brief').getByTestId('ready-dot');
	await expect(light).toBeVisible();
	await expect(light).toHaveAccessibleName('Ready');
});

test('a subtask becomes ready when its parent dependency is done', async ({ page }) => {
	await openReadyPlan(page);
	await row(page, 'Prepare report').getByTestId('task-toggle').click();
	const subtask = row(page, 'Write report');
	await expect(subtask).toBeVisible();
	await expect(subtask.getByTestId('ready-dot')).toHaveCount(0);
	await expect(row(page, 'Prepare report').getByTestId('ready-dot')).toHaveCount(0);
	await setTaskStatus(page, row(page, 'Approve brief'), 'done');
	await expect(subtask.getByTestId('ready-dot')).toHaveAccessibleName(
		'Ready. Dependencies done: 1'
	);
	await expect(row(page, 'Prepare report').getByTestId('ready-dot')).toHaveAccessibleName(
		'Ready. Subtasks ready: 1'
	);
});

test('a subtask dependency list exposes a read-only inherited row with a From parent hint', async ({
	page
}) => {
	await openReadyPlan(page);
	await row(page, 'Prepare report').getByTestId('task-toggle').click();
	await row(page, 'Write report').getByTestId('task-details').click();
	const dialog = page.getByTestId('task-dialog');
	await expect(dialog).toBeVisible();
	await waitForAnimations(dialog);
	const inherited = dialog.getByTestId('dependency-list').getByRole('listitem');
	await expect(inherited).toMatchAriaSnapshot(`
		- listitem: Approve brief (From parent Prepare report.)
	`);
	await expect(inherited.getByRole('button')).toHaveCount(0);
	await inherited.hover();
	const hint = page.locator('[data-slot="tooltip-content"]');
	await expect(hint).toBeVisible();
	await waitForAnimations(hint);
	await expect(hint).toHaveText('From parent Prepare report.');
});

test('the example stall shows one ready subtask and no light for blocked signs', async ({
	page
}) => {
	await openExample(page);
	const stall = row(page, 'Neighbourhood stall');
	await expect(stall.getByTestId('ready-dot')).toHaveAccessibleName('Ready. Subtasks ready: 1');
	await stall.getByTestId('task-toggle').click();
	await expect(row(page, 'Book a table').getByTestId('ready-dot')).toHaveAccessibleName('Ready');
	await expect(row(page, 'Make signs').getByTestId('ready-dot')).toHaveCount(0);
});
