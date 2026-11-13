import { HOVER_COLD_MS } from '#lib/state/route-focus.svelte.ts';
import { expect, test } from '@playwright/test';
import {
	addWorkspaceOverflow,
	changePlanInOtherTab,
	dragSteps,
	expectJumpTarget,
	focusPreviousControl,
	ganttRow,
	isCoarse,
	openExample,
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

const HOVER_SCHEDULING_MARGIN_MS = 50;

test('keeps the chart dimmed through a continuous sweep across example row bands', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 1000 });
	await openExample(page);
	const last = ganttRow(page, 'Neighbourhood stall');
	const toggle = last.getByTestId('gantt-toggle');
	if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click();
	await waitForAnimations(page.getByTestId('gantt'));
	const first = ganttRow(page, 'Site survey');
	const mark = first.getByTestId('gantt-bar');
	await mark.hover();
	await page.waitForTimeout(350);
	await expect(first).toHaveAttribute('data-route', 'lit');
	await expect(last).toHaveAttribute('data-route', 'off');
	const geometry = await page.getByTestId('gantt').evaluate((chart) => {
		const rows = [...chart.querySelectorAll('[data-testid="gantt-row"]')];
		const first = rows[0];
		const mark = first.querySelector('[data-testid="gantt-bar"]')!.getBoundingClientRect();
		const last = rows.at(-1)!;
		const bounds = last.getBoundingClientRect();
		return {
			x: mark.x + mark.width / 2,
			from: mark.y + mark.height / 2,
			to: bounds.y + bounds.height / 2,
			lastId: last.getAttribute('data-task-id')!
		};
	});
	await expect(last).toHaveAttribute('data-task-id', geometry.lastId);
	await expect(last.getByTestId('gantt-label')).toBeInViewport({ ratio: 1 });
	// The full sweep lasts longer than leave grace. Each 28 px row takes about 80 ms.
	const duration = ((geometry.to - geometry.from) / 350) * 1000;
	expect(duration).toBeGreaterThan(250);
	type MonitorWindow = Window & { routeSweep?: { frame: number; counts: number[] } };
	await page.evaluate(() => {
		const target = window as MonitorWindow;
		const state = { frame: 0, counts: [] as number[] };
		target.routeSweep = state;
		const sample = () => {
			state.counts.push(document.querySelectorAll('[data-testid="gantt-row"][data-route]').length);
			state.frame = requestAnimationFrame(sample);
		};
		sample();
	});
	let counts: number[];
	try {
		const startedAt = performance.now();
		const steps = Math.ceil((geometry.to - geometry.from) / 6);
		for (let step = 1; step <= steps; step++) {
			const due = startedAt + (duration * step) / steps;
			await page.waitForTimeout(Math.max(0, due - performance.now()));
			await page.mouse.move(
				geometry.x,
				geometry.from + ((geometry.to - geometry.from) * step) / steps
			);
		}
		await page.waitForTimeout(170);
	} finally {
		counts = await page.evaluate(() => {
			const target = window as MonitorWindow;
			const state = target.routeSweep!;
			cancelAnimationFrame(state.frame);
			delete target.routeSweep;
			return state.counts;
		});
	}
	expect(counts.length).toBeGreaterThan(10);
	expect(
		counts,
		'Every animation frame must keep an active route during the sweep and final rest'
	).not.toContain(0);
	expect((await routeMembership(page)).rows).toEqual([geometry.lastId]);
	await expect(last).toHaveAttribute('data-highlighted', 'true');
	await page.mouse.move(0, 0);
	expect((await routeMembership(page)).rows).toEqual([geometry.lastId]);
	await page.waitForTimeout(300);
	await expect(page.locator('[data-testid="gantt-row"][data-route]')).toHaveCount(0);
});

test('uses system highlight colors on the Gantt label when its Work plan row is hovered', async ({
	page
}) => {
	await page.emulateMedia({ forcedColors: 'active' });
	await openRoutePlan(page);
	const chartRow = ganttRow(page, 'Route parent');
	const cell = chartRow.getByTestId('gantt-label').locator('..');
	await row(page, 'Route parent').hover();
	await page.waitForTimeout(350);
	await expect(chartRow).toHaveAttribute('data-highlighted', 'true');
	const paint = await cell.evaluate((element) => {
		const probe = document.createElement('span');
		probe.style.backgroundColor = 'Highlight';
		probe.style.color = 'HighlightText';
		probe.style.forcedColorAdjust = 'none';
		element.append(probe);
		const style = getComputedStyle(element);
		const system = getComputedStyle(probe);
		const result = {
			background: style.backgroundColor,
			text: style.color,
			highlight: system.backgroundColor,
			highlightText: system.color
		};
		probe.remove();
		return result;
	});
	expect(paint.background).toBe(paint.highlight);
	expect(paint.text).toBe(paint.highlightText);
});

test('hover targets share delayed route input and preserve saved plan and history', async ({
	page
}) => {
	await openRoutePlan(page);
	const undo = page.getByRole('button', { name: 'Undo', exact: true });
	const redo = page.getByRole('button', { name: 'Redo', exact: true });
	await expect(undo).toBeDisabled();
	await expect(redo).toBeDisabled();
	const original = await storedPlan(page);
	const deliverable = row(page, 'Route parent').getByTestId('task-deliverable');
	await deliverable.click();
	const input = row(page, 'Route parent').getByTestId('task-deliverable-input');
	await input.fill('First saved deliverable');
	await input.press('Enter');
	const first = await storedPlan(page);
	expect(first.tasks.find((task) => task.id === 'parent')!.deliverable).toBe(
		'First saved deliverable'
	);
	await deliverable.click();
	await input.fill('Second saved deliverable');
	await input.press('Enter');
	const second = await storedPlan(page);
	expect(second.tasks.find((task) => task.id === 'parent')!.deliverable).toBe(
		'Second saved deliverable'
	);
	await undo.click();
	await expect.poll(() => storedPlan(page)).toEqual(first);
	await expect(undo).toBeEnabled();
	await expect(redo).toBeEnabled();
	const before = { plan: first, undo: true, redo: true };
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
		// Leave grace ends before the next target starts a cold rest.
		await expect(page.locator('[data-testid="gantt-row"][data-route]')).toHaveCount(0);
	}
	expect({
		plan: await storedPlan(page),
		undo: await undo.isEnabled(),
		redo: await redo.isEnabled()
	}).toEqual(before);
	await undo.click();
	await expect.poll(() => storedPlan(page)).toEqual(original);
	await expect(undo).toBeDisabled();
	await redo.click();
	await expect.poll(() => storedPlan(page)).toEqual(first);
	await redo.click();
	await expect.poll(() => storedPlan(page)).toEqual(second);
	await expect(redo).toBeDisabled();
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
	// Wait beyond cold hover intent so this checks priority after hover is accepted.
	await page.waitForTimeout(HOVER_COLD_MS + HOVER_SCHEDULING_MARGIN_MS);
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
		await expect(page.locator('[data-testid="gantt-row"][data-route]')).toHaveCount(0);
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
