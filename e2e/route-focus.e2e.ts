import { expect, test } from '@playwright/test';
import {
	addWorkspaceOverflow,
	changePlanInOtherTab,
	dragSteps,
	expectJumpTarget,
	focusPreviousControl,
	ganttRow,
	isCoarse,
	openRoutePlan,
	routeMembership,
	row,
	storedPlan,
	touchDrag,
	touchScroll,
	waitForAnimations,
	waitForFrames,
	workPane
} from './helpers.ts';

test('hover targets share delayed route input and preserve saved plan and history', async ({
	page
}) => {
	await openRoutePlan(page);
	const undo = page.getByRole('button', { name: 'Undo', exact: true });
	const before = { plan: await storedPlan(page), undo: await undo.isEnabled() };
	const targets = [
		ganttRow(page, 'Route parent').getByTestId('gantt-bar'),
		ganttRow(page, 'Route point').getByTestId('gantt-point'),
		ganttRow(page, 'Route parent').getByTestId('gantt-label'),
		row(page, 'Route parent')
	];
	for (const target of targets) {
		await target.hover();
		await expect(ganttRow(page, 'Route upstream')).toHaveAttribute('data-route', 'lit');
		await expect(ganttRow(page, 'Route unrelated')).toHaveAttribute('data-route', 'off');
		await page.mouse.move(0, 0);
		await expect(page.locator('[data-testid="gantt-row"][data-route]')).toHaveCount(0);
	}
	expect({ plan: await storedPlan(page), undo: await undo.isEnabled() }).toEqual(before);
});

test('keyboard route outranks hover and the task dialog outranks keyboard focus', async ({
	page
}) => {
	await openRoutePlan(page);
	const point = ganttRow(page, 'Route point').getByTestId('gantt-point');
	await focusPreviousControl(point);
	await page.keyboard.press('Tab');
	await expect(point).toBeFocused();
	await expect(ganttRow(page, 'Route branch')).toHaveAttribute('data-route', 'off');
	await ganttRow(page, 'Route branch').getByTestId('gantt-bar').hover();
	await waitForFrames(page, 12);
	await expect(ganttRow(page, 'Route branch')).toHaveAttribute('data-route', 'off');
	await row(page, 'Route branch').getByTestId('task-details').click();
	const dialog = page.getByTestId('task-dialog');
	await expect(dialog).toBeVisible();
	await expect(ganttRow(page, 'Route branch')).toHaveAttribute('data-route', 'lit');
	await expect(ganttRow(page, 'Route downstream')).toHaveAttribute('data-route', 'off');
	await dialog.getByTestId('dialog-ok').click();
	await expect(dialog).not.toBeVisible();
	await expect(ganttRow(page, 'Route branch')).toHaveAttribute('data-route', 'lit');
});

test('hover temporarily overrides pointer edit focus and Esc preserves the row focus route', async ({
	page
}) => {
	await openRoutePlan(page);
	await row(page, 'Route point').getByTestId('task-title').click();
	await expect(ganttRow(page, 'Route branch')).toHaveAttribute('data-route', 'off');
	await ganttRow(page, 'Route branch').getByTestId('gantt-bar').hover();
	await expect(ganttRow(page, 'Route branch')).toHaveAttribute('data-route', 'lit');
	await page.mouse.move(0, 0);
	await expect(ganttRow(page, 'Route branch')).toHaveAttribute('data-route', 'off');
	await page.keyboard.press('Escape');
	await expect(ganttRow(page, 'Route point')).toHaveAttribute('data-route', 'lit');
	await ganttRow(page, 'Route branch').getByTestId('gantt-bar').hover();
	await expect(ganttRow(page, 'Route branch')).toHaveAttribute('data-route', 'lit');
	await page.mouse.move(0, 0);
	await expect(ganttRow(page, 'Route point')).toHaveAttribute('data-route', 'lit');
});

test('tab sync updates route projection while the edit field retains focus', async ({ page }) => {
	await openRoutePlan(page);
	// The title text becomes an input value while editing, so keep the row by its task id.
	const parentRow = page.locator('tr[data-task-id="parent"]');
	await parentRow.getByTestId('task-title').click();
	const editor = parentRow.getByRole('textbox');
	await expect(editor).toBeFocused();
	await expect(ganttRow(page, 'Route upstream')).toHaveAttribute('data-route', 'lit');
	await changePlanInOtherTab(page, (plan) => {
		plan.tasks.find((task) => task.id === 'parent')!.dependsOn = ['other'];
	});
	await expect(ganttRow(page, 'Route unrelated')).toHaveAttribute('data-route', 'lit');
	await expect(ganttRow(page, 'Route upstream')).toHaveAttribute('data-route', 'off');
	await expect(editor).toBeFocused();
});

test('collapsed union lights merged lines without lighting the upstream shortcut', async ({
	page
}) => {
	await openRoutePlan(page);
	const parent = ganttRow(page, 'Route parent');
	const toggle = parent.getByTestId('gantt-toggle');
	if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click();
	await parent.getByTestId('gantt-bar').hover();
	await expect
		.poll(() => routeMembership(page))
		.toEqual({
			rows: ['branch', 'down', 'parent', 'point', 'up'],
			lines: ['down->point', 'parent->branch', 'parent->down', 'up->parent']
		});
	await toggle.click();
	await waitForAnimations(parent);
	await parent.getByTestId('gantt-bar').hover();
	await expect(ganttRow(page, 'Route branch')).toHaveAttribute('data-route', 'off');
	await expect(
		page.locator('[data-testid="gantt-dependency"][data-from="up"][data-to="down"]')
	).toHaveAttribute('data-route', 'off');
	await expect(
		page.locator('[data-testid="gantt-dependency"][data-from="child-b"][data-to="branch"]')
	).toHaveAttribute('data-route', 'off');
});

test.describe('touch route input', () => {
	test.use({ hasTouch: true, viewport: { width: 1280, height: 900 } });
	test('toggles marks, switches marks, clears outside, and preserves one-tap label jump', async ({
		page
	}) => {
		await openRoutePlan(page);
		expect(await isCoarse(page)).toBe(true);
		const parent = ganttRow(page, 'Route parent').getByTestId('gantt-bar');
		await parent.tap();
		await expect(ganttRow(page, 'Route branch')).toHaveAttribute('data-route', 'lit');
		await parent.tap();
		await expect(page.locator('[data-testid="gantt-row"][data-route]')).toHaveCount(0);
		await parent.tap();
		await ganttRow(page, 'Route point').getByTestId('gantt-point').tap();
		await expect(ganttRow(page, 'Route branch')).toHaveAttribute('data-route', 'off');
		await page.getByTestId('plan-heading').tap();
		await expect(page.locator('[data-testid="gantt-row"][data-route]')).toHaveCount(0);
		await parent.tap();
		await ganttRow(page, 'Route downstream').getByTestId('gantt-label').tap();
		await expectJumpTarget(page, 'Route downstream');
		await expect(ganttRow(page, 'Route branch')).toHaveAttribute('data-route', 'off');
		await expect(row(page, 'Route downstream')).toHaveClass(/row-flash/);
	});

	test('does not toggle after a touch pan or scroll cancels the click', async ({ page }) => {
		await openRoutePlan(page);
		await addWorkspaceOverflow(page);
		const mark = ganttRow(page, 'Route parent').getByTestId('gantt-bar');
		await mark.tap();
		await expect(ganttRow(page, 'Route branch')).toHaveAttribute('data-route', 'lit');
		const before = await routeMembership(page);
		const box = (await mark.boundingBox())!;
		const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
		await touchDrag(page, start, dragSteps(start, -120), () => waitForFrames(page, 1));
		await expect.poll(() => routeMembership(page)).toEqual(before);
		await touchScroll(page, workPane(page), 150);
		await expect.poll(() => routeMembership(page)).toEqual(before);
	});
});
