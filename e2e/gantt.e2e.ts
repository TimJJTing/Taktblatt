import { MILESTONE_SYMBOLS } from '#lib/domain/schema.ts';
import { expect, test, type Page } from '@playwright/test';
import {
	expectNoArrowheads,
	expectOpaqueMark,
	expectLineStatus,
	expectStationStatus,
	expectMilestoneRing,
	expectMilestoneDatePosition,
	expectTokenPaint,
	formatted,
	writeStoredPlan,
	dependencyContrast,
	defaultPanelHeight,
	expectPanelHeight,
	expectStickyBelowHeader,
	openExample,
	row,
	storedPlan,
	setTaskStatus,
	ganttRow,
	openLinePlan,
	dependencyGeometry,
	expectCoveredCrossing,
	expectLocalTap,
	expectJunctionBehindMark,
	startDependencyMonitor,
	changePlanInOtherTab,
	waitForFrames,
	waitForAnimations
} from './helpers.ts';

const gantt = (page: Page) => page.getByTestId('gantt');

test('screen lines, stations and sibling connectors use physical sizes', async ({ page }) => {
	await openLinePlan(page);
	await ganttRow(page, 'Crossing').getByTestId('gantt-toggle').click();
	for (const [title, lineHeight, dotSize] of [
		['Source', 8, 8],
		['Child A', 6, 6]
	] as const) {
		const mark = ganttRow(page, title).getByTestId('gantt-bar');
		await expect(mark.locator('[data-gantt-line]')).toHaveCSS('height', `${lineHeight}px`);
		await expect(mark.locator('.station-dot')).toHaveCount(2);
		await expect(mark.locator('.station-dot').first()).toHaveCSS('width', `${dotSize}px`);
	}
	const lines = gantt(page).getByTestId('gantt-dependency');
	await expect(lines.and(page.locator('[data-from="source"]')).first()).toHaveCSS(
		'stroke-width',
		'2px'
	);
	await expect(lines.and(page.locator('[data-from="child-a"][data-to="child-b"]'))).toHaveCSS(
		'stroke-width',
		'1.5px'
	);
	await expectNoArrowheads(lines.first());
});

test('tiny, point and clipped marks use exact ports and flat cuts', async ({ page }) => {
	await openLinePlan(page);
	const tiny = ganttRow(page, 'Tiny').getByTestId('gantt-bar');
	await expect(tiny.locator('.station-dot')).toHaveCount(1);
	const tinySize = await tiny.evaluate((mark) => {
		const rect = mark.getBoundingClientRect(),
			dot = mark.querySelector('.station-dot')!.getBoundingClientRect();
		return {
			width: rect.width,
			dateWidth: mark.parentElement!.clientWidth / 100,
			left: dot.left - rect.left,
			right: rect.right - dot.right
		};
	});
	expect(tinySize.width).toBeCloseTo(tinySize.dateWidth, 1);
	expect(tinySize.left).toBeCloseTo(tinySize.right, 2);
	expect(tinySize.left).toBeGreaterThanOrEqual(-0.1);
	const point = ganttRow(page, 'Point').getByTestId('gantt-point');
	await expect(point).toHaveAccessibleName(/^Point:/);
	await expect(point.locator('.station-dot')).toHaveCSS('width', '10px');
	await point.focus();
	await expect(point).toBeFocused();
	const clipped = ganttRow(page, 'Tap source').getByTestId('gantt-bar');
	await expect(clipped.locator('.station-dot')).toHaveCount(1);
	await expect(clipped.locator('[data-gantt-line]')).toHaveCSS('clip-path', 'none');
	await expect(clipped.locator('[data-gantt-line]')).toHaveCSS('border-top-right-radius', '0px');
	for (const to of ['point', 'tiny', 'tap-target']) {
		const line = gantt(page)
			.getByTestId('gantt-dependency')
			.and(page.locator(`[data-to="${to}"]`));
		await expect
			.poll(async () => {
				const g = await dependencyGeometry(line);
				return g.out && g.in
					? Math.max(
							Math.abs(g.first.x - g.out.x),
							Math.abs(g.first.y - g.out.y),
							Math.abs(g.last.x - g.in.x),
							Math.abs(g.last.y - g.in.y)
						)
					: Infinity;
			})
			.toBeLessThan(0.6);
	}
});

test('finished marks cover crossing connectors in both themes', async ({ page }) => {
	await openLinePlan(page);
	await ganttRow(page, 'Crossing').getByTestId('gantt-toggle').click();
	// Sample status paint with route focus inactive after the chevron hover.
	await page.mouse.move(0, 0);
	await expect(page.locator('[data-testid="gantt-row"][data-route]')).toHaveCount(0);
	for (const colorScheme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
		const mark = ganttRow(page, 'Crossing').getByTestId('gantt-bar');
		await expectOpaqueMark(mark);
		await expectStationStatus(mark, 'done');
		await expectLineStatus(mark, 'done');
		const child = ganttRow(page, 'Child A').getByTestId('gantt-bar');
		await expectStationStatus(child, 'done');
		await expectLineStatus(child, 'done');
		await expectCoveredCrossing(child, gantt(page).getByTestId('gantt-dependency'));
		await expectCoveredCrossing(mark, gantt(page).getByTestId('gantt-dependency'));
		await expect(ganttRow(page, 'Crossing').getByTestId('gantt-label')).toHaveClass(/line-through/);
	}
});

test('status sorting preserves base DOM identity, parent and geometry', async ({ page }) => {
	await openLinePlan(page);
	const line = gantt(page)
		.getByTestId('gantt-dependency')
		.and(page.locator('[data-from="tap-source"]'));
	const original = await line.evaluateHandle((element) => ({
		element,
		parent: element.parentNode,
		d: element.getAttribute('d')
	}));
	await setTaskStatus(page, row(page, 'Tap source'), 'done');
	await expect
		.poll(() =>
			original.evaluate(({ element, parent, d }) => {
				const paths = [...document.querySelectorAll('[data-testid="gantt-dependency"]')];
				return (
					paths[0] === element &&
					element.parentNode === parent &&
					element.getAttribute('d') === d &&
					paths.every((p) => p.parentNode === parent)
				);
			})
		)
		.toBe(true);
	await original.dispose();
	await expect(line).toHaveCSS('opacity', '1');
});

test('ordinary rings stay below bars and taps stay in their source marks', async ({ page }) => {
	await openLinePlan(page);
	const rings = gantt(page).getByTestId('gantt-junction');
	expect(await rings.count()).toBeGreaterThan(0);
	await expect(rings.first()).toHaveCSS('width', '6px');
	const source = ganttRow(page, 'Tap source').getByTestId('gantt-bar');
	const tap = source.getByTestId('gantt-tap');
	await expect(tap).toHaveAttribute('data-source', 'tap-source');
	await expect(tap).toHaveAttribute('aria-hidden', 'true');
	await expectLocalTap(source, 'tap-source');
	await expectJunctionBehindMark(
		rings.first(),
		ganttRow(page, 'Crossing').getByTestId('gantt-bar')
	);
	await expect(
		gantt(page).locator('svg:has([data-testid="gantt-dependency"])').getByTestId('gantt-tap')
	).toHaveCount(0);
});

test('a width-only resize has no intermediate connector route', async ({ page }) => {
	await page.setViewportSize({ width: 1900, height: 1000 });
	await openLinePlan(page);
	const line = gantt(page)
		.getByTestId('gantt-dependency')
		.and(page.locator('[data-from="tap-source"]'));
	const monitor = await startDependencyMonitor(line);
	await page.setViewportSize({ width: 1550, height: 1000 });
	const frames = await monitor.finish();
	const width = frames.at(-1)!.width;
	const resized = frames.filter((f) => f.width === width);
	expect(resized.length).toBeGreaterThan(1);
	expect(new Set(resized.map((f) => f.d)).size).toBe(1);
	const geometry = await dependencyGeometry(line);
	expect(geometry.first.x).toBeCloseTo(geometry.out!.x, 0);
	expect(geometry.last.x).toBeCloseTo(geometry.in!.x, 0);
	// The new route must be expressed as six-point scene geometry, not a resized elbow.
	expect(geometry.d).not.toMatch(/[HV]/);
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
	test(`range and row motion stays attached with ${reducedMotion} during repeated changes`, async ({
		page
	}) => {
		await page.emulateMedia({ reducedMotion });
		await openLinePlan(page);
		const line = gantt(page)
			.getByTestId('gantt-dependency')
			.and(page.locator('[data-from="source"][data-to="target"]'));
		const before = await line.getAttribute('d');
		const monitor = await startDependencyMonitor(line);
		await changePlanInOtherTab(page, (plan) => {
			plan.range.end = '2027-05-10';
		});
		await waitForFrames(page, 2);
		await changePlanInOtherTab(page, (plan) => {
			plan.range.end = '2027-06-10';
		});
		await ganttRow(page, 'Crossing').getByTestId('gantt-toggle').click();
		const frames = await monitor.finish();
		const end = frames.at(-1)!.d;
		expect(end).not.toBe(before);
		const intermediate = frames.filter((f) => f.d !== before && f.d !== end);
		if (reducedMotion === 'no-preference') expect(intermediate.length).toBeGreaterThan(0);
		// All rendered path frames must use scene segments, including the first frame.
		expect(frames.every((f) => !/[HV]/.test(f.d ?? ''))).toBe(true);
		await expect
			.poll(async () => {
				const g = await dependencyGeometry(line);
				return Math.abs(g.first.x - g.out!.x) + Math.abs(g.last.y - g.in!.y);
			})
			.toBeLessThan(0.7);
	});
}

test('linked highlight keeps label paint and ready dots without a timeline wash', async ({
	page
}) => {
	await openLinePlan(page);
	const source = ganttRow(page, 'Source');
	await source.getByTestId('gantt-bar').focus();
	await expect(row(page, 'Source')).toHaveClass(/bg-accent/);
	await expect(source).toHaveAttribute('data-highlighted', 'true');
	const dateArea = source.getByTestId('gantt-bar').locator('..');
	await expect(dateArea).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
	await expect(source.getByTestId('gantt-label').locator('..')).not.toHaveCSS(
		'background-color',
		'rgba(0, 0, 0, 0)'
	);
	await expect(ganttRow(page, 'Child A')).toHaveCount(0);
	await setTaskStatus(page, row(page, 'Source'), 'done');
	await expect(ganttRow(page, 'Target').getByTestId('ready-dot')).toHaveCount(1);
});

test('the Gantt shows bars, lines and the today line of the example plan', async ({ page }) => {
	await openExample(page);
	await expect(gantt(page).getByTestId('gantt-row')).toHaveCount(7);
	await expect(gantt(page).getByTestId('gantt-bar')).toHaveCount(7);
	await expect(gantt(page).getByTestId('gantt-today')).toBeVisible();
	await expect(gantt(page).getByTestId('gantt-dependency')).toHaveCount(4);
	await expect(gantt(page).getByTestId('gantt-milestone')).toHaveCount(2);
	await expect(gantt(page).getByTestId('gantt-band')).toHaveCount(1);
	const survey = ganttRow(page, 'Site survey').getByTestId('gantt-bar');
	await expect(survey).toHaveAccessibleName(/^Site survey: .+, done$/);
	await expect(ganttRow(page, 'Site survey').getByTestId('gantt-label')).toHaveClass(
		/line-through/
	);
});

test('outgoing dependency lines mute done and canceled sources', async ({ page }) => {
	await openExample(page);
	await page.reload();
	await expect(page.getByTestId('plan-heading')).toContainText('Community Garden');
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();
	const plan = await storedPlan(page);
	const sowing = plan.tasks.find((task) => task.title === 'Sowing')!;
	const harvest = plan.tasks.find((task) => task.title === 'First harvest')!;
	const line = gantt(page).locator(
		`[data-testid="gantt-dependency"][data-from="${sowing.id}"][data-to="${harvest.id}"]`
	);
	await expect(line).toHaveCount(1);
	const normal = await dependencyContrast(line);
	await setTaskStatus(page, row(page, 'First harvest'), 'done');
	await expect.poll(() => dependencyContrast(line)).toBe(normal);
	await setTaskStatus(page, row(page, 'Sowing'), 'in_progress');
	await expect.poll(() => dependencyContrast(line)).toBe(normal);
	await expect(ganttRow(page, 'Sowing').getByTestId('gantt-bar')).toHaveAccessibleName(
		/, in progress$/
	);
	await expectOpaqueMark(ganttRow(page, 'Sowing').getByTestId('gantt-bar'));
	await expectStationStatus(ganttRow(page, 'Sowing').getByTestId('gantt-bar'), 'in_progress');
	await expect(ganttRow(page, 'Sowing').getByTestId('gantt-label')).not.toHaveClass(/line-through/);
	await setTaskStatus(page, row(page, 'Sowing'), 'done');
	await expect.poll(() => dependencyContrast(line)).toBeLessThan(normal);
	await expect(line).toHaveCSS('opacity', '1');
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect.poll(() => dependencyContrast(line)).toBe(normal);
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect.poll(() => dependencyContrast(line)).toBeLessThan(normal);
	await waitForAnimations(line);
	const doneContrast = await dependencyContrast(line);
	await setTaskStatus(page, row(page, 'Sowing'), 'canceled');
	await expect.poll(() => dependencyContrast(line)).toBe(doneContrast);
	await expect(line).toHaveCSS('opacity', '1');
	const canceled = ganttRow(page, 'Sowing');
	await expect(canceled.getByTestId('gantt-bar')).toHaveAccessibleName(/, canceled$/);
	await expectOpaqueMark(canceled.getByTestId('gantt-bar'));
	await expectStationStatus(canceled.getByTestId('gantt-bar'), 'canceled');
	await expectLineStatus(canceled.getByTestId('gantt-bar'), 'canceled');
	await expect(canceled.getByTestId('gantt-label')).toHaveClass(/line-through/);
});

test('expand and collapse are shared between the Gantt and the table', async ({ page }) => {
	await openExample(page);
	const ganttToggle = ganttRow(page, 'Soil preparation').getByTestId('gantt-toggle');
	await expect(ganttToggle).toHaveAttribute('aria-expanded', 'false');
	await ganttToggle.click();
	await expect(ganttToggle).toHaveAttribute('aria-expanded', 'true');
	await expect(row(page, 'Soil test')).toBeVisible();
	await expect(gantt(page).getByTestId('gantt-row')).toHaveCount(9);
	await expect(gantt(page).getByTestId('gantt-dependency')).toHaveCount(5);

	const tableToggle = row(page, 'Soil preparation').getByTestId('task-toggle');
	await expect(tableToggle).toHaveAttribute('aria-expanded', 'true');
	await tableToggle.click();
	await expect(ganttToggle).toHaveAttribute('aria-expanded', 'false');
	await expect(gantt(page).getByTestId('gantt-row')).toHaveCount(7);
	await expect(ganttRow(page, 'Soil test')).toHaveCount(0);
	await expect(gantt(page).getByTestId('gantt-dependency')).toHaveCount(4);
});

const HIGHLIGHTED =
	'[data-testid="task-row"][class~="bg-accent/60"], [data-testid="gantt"] [data-highlighted]';

/**
 * Records the highlighted rows in the first frame after the next click.
 * The page can scroll after a collapse. A row that then moves under the resting pointer gets a
 * real hover highlight. The first frame comes before this hover, so it shows the click result.
 */
const recordHighlightAfterClick = (page: Page) =>
	page.evaluate((selector) => {
		const target = window as unknown as { afterClick?: (string | null)[] };
		delete target.afterClick;
		addEventListener(
			'click',
			() =>
				requestAnimationFrame(() => {
					target.afterClick = [...document.querySelectorAll(selector)].map((element) =>
						element.getAttribute('data-task-id')
					);
				}),
			{ once: true }
		);
	}, HIGHLIGHTED);

const highlightAfterClick = (page: Page) =>
	page.evaluate(() => (window as unknown as { afterClick?: (string | null)[] }).afterClick);

/** Returns the ids of highlighted rows that the pointer is not over. */
const highlightsNotFromHover = (page: Page, pointer: { x: number; y: number }) =>
	page.evaluate(
		({ x, y, selector }) => {
			const hovered = document.elementFromPoint(x, y)?.closest('[data-task-id]');
			const under = hovered?.getAttribute('data-task-id') ?? null;
			return [...document.querySelectorAll(selector)]
				.map((element) => element.getAttribute('data-task-id'))
				.filter((id) => id !== under);
		},
		{ ...pointer, selector: HIGHLIGHTED }
	);

for (const surface of ['table', 'Gantt'] as const) {
	for (const action of ['expand', 'collapse'] as const) {
		test(`a pointer click on the ${surface} chevron to ${action} clears focus and highlight`, async ({
			page
		}) => {
			await openExample(page);
			const parent = row(page, 'Soil preparation');
			const tableToggle = parent.getByTestId('task-toggle');
			const ganttToggle = ganttRow(page, 'Soil preparation').getByTestId('gantt-toggle');
			const expanding = action === 'expand';
			if (!expanding) await tableToggle.click();

			const edited = expanding ? parent : row(page, 'Soil test');
			const taskId = await edited.getAttribute('data-task-id');
			await edited.getByTestId('task-deliverable').click();
			const input = edited.getByTestId('task-deliverable-input');
			const draft = `Saved on ${surface} ${action}`;
			await input.fill(draft);
			await expect(input).toBeFocused();
			await expect(page.locator('table:focus-within')).toHaveCount(1);

			const toggle = surface === 'table' ? tableToggle : ganttToggle;
			await toggle.scrollIntoViewIfNeeded();
			const box = (await toggle.boundingBox())!;
			const pointer = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
			await recordHighlightAfterClick(page);
			await page.mouse.click(pointer.x, pointer.y);
			await expect(tableToggle).toHaveAttribute('aria-expanded', String(expanding));
			await expect(ganttToggle).toHaveAttribute('aria-expanded', String(expanding));
			await expect(row(page, 'Soil test')).toHaveCount(expanding ? 1 : 0);
			await expect(ganttRow(page, 'Soil test')).toHaveCount(expanding ? 1 : 0);
			await expect
				.poll(
					async () => (await storedPlan(page)).tasks.find((task) => task.id === taskId)?.deliverable
				)
				.toBe(draft);
			await expect.soft(toggle).not.toBeFocused();
			await expect.soft(page.locator('table:focus-within')).toHaveCount(0);
			await expect.poll(() => highlightAfterClick(page)).toEqual([]);
			// Later, only a hover highlight of the row under the pointer can stay.
			await expect
				.soft(() => expect(highlightsNotFromHover(page, pointer)).resolves.toEqual([]))
				.toPass();

			await row(page, 'Site survey').hover();
			await expect(ganttRow(page, 'Site survey')).toHaveAttribute('data-highlighted', 'true');
		});
	}

	test(`keyboard activation of the ${surface} chevron retains focus`, async ({ page }) => {
		await openExample(page);
		const tableToggle = row(page, 'Soil preparation').getByTestId('task-toggle');
		const ganttToggle = ganttRow(page, 'Soil preparation').getByTestId('gantt-toggle');
		const toggle = surface === 'table' ? tableToggle : ganttToggle;
		await toggle.focus();
		for (const key of ['Enter', 'Space']) {
			for (const expanded of [true, false]) {
				await toggle.press(key);
				await expect(toggle).toBeFocused();
				await expect(tableToggle).toHaveAttribute('aria-expanded', String(expanded));
				await expect(ganttToggle).toHaveAttribute('aria-expanded', String(expanded));
			}
		}
	});
}

test('a label click scrolls to the table row and flashes it', async ({ page }) => {
	await openExample(page);
	const target = row(page, 'Neighbourhood stall');
	await expect(target).not.toBeInViewport();
	await ganttRow(page, 'Neighbourhood stall').getByTestId('gantt-label').click();
	await expect(target).toBeInViewport();
	await expect(target).toHaveClass(/row-flash/);
	await expect(target).not.toHaveClass(/row-flash/, { timeout: 3000 });
});

test('the linked highlight works in both directions', async ({ page }) => {
	await openExample(page);
	const sowing = row(page, 'Sowing');
	await sowing.hover();
	await expect(ganttRow(page, 'Sowing')).toHaveAttribute('data-highlighted', 'true');

	const bar = ganttRow(page, 'Watering rota').getByTestId('gantt-bar');
	await bar.hover();
	await expect(row(page, 'Watering rota')).toHaveClass(/bg-accent/);
	await expect(ganttRow(page, 'Sowing')).not.toHaveAttribute('data-highlighted');

	await ganttRow(page, 'First harvest').getByTestId('gantt-bar').focus();
	await expect(row(page, 'First harvest')).toHaveClass(/bg-accent/);
});

test('the pinned Timeline section resizes with the keyboard within its limits', async ({
	page
}) => {
	await openExample(page);
	const pin = page.getByTestId('gantt-pin');
	await expect(pin).toHaveAttribute('aria-pressed', 'false');
	await expect(page.getByTestId('gantt-resize')).toHaveCount(0);
	await pin.click();
	await expect(pin).toHaveAttribute('aria-pressed', 'true');
	const handle = page.getByRole('separator', { name: 'Timeline height' });
	await expect(handle).toHaveAttribute('aria-valuenow', '35');
	const viewport = page.viewportSize()!.height;
	const panel = page.getByTestId('timeline-panel');
	await expectPanelHeight(page, defaultPanelHeight(page));

	await handle.focus();
	await handle.press('ArrowDown');
	await expect(handle).toHaveAttribute('aria-valuenow', '37');
	await expectPanelHeight(page, viewport * 0.37);
	await handle.press('PageUp');
	await expectPanelHeight(page, viewport * 0.27);
	await handle.press('PageDown');
	await expectPanelHeight(page, viewport * 0.37);
	// Clamp PageDown from 47 percent, then PageUp near the minimum.
	await handle.press('PageDown');
	await expectPanelHeight(page, viewport * 0.47);
	await handle.press('PageDown');
	await expectPanelHeight(page, viewport * 0.5);

	await handle.press('End');
	await expect(handle).toHaveAttribute('aria-valuenow', '50');
	await handle.press('ArrowDown');
	await expect(handle).toHaveAttribute('aria-valuenow', '50');
	await expectPanelHeight(page, viewport * 0.5);

	await handle.press('Home');
	await expect(handle).toHaveAttribute('aria-valuenow', String(Math.round((120 / viewport) * 100)));
	await handle.press('ArrowUp');
	await expectPanelHeight(page, 120);

	await handle.press('ArrowDown');
	await expectPanelHeight(page, 120 + viewport * 0.02);
	await handle.press('PageUp');
	await expectPanelHeight(page, 120);
	await handle.press('PageUp');
	await expectPanelHeight(page, 120);
	await expectStickyBelowHeader(panel);
	await page.reload();
	await expect(page.getByTestId('gantt-pin')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByTestId('gantt-resize')).toHaveAttribute(
		'aria-valuenow',
		String(Math.round((120 / viewport) * 100))
	);
	await expectPanelHeight(page, 120);
});

test('a band click opens the band dialog', async ({ page }) => {
	await openExample(page);
	await gantt(page)
		.getByTestId('gantt-band')
		.click({ position: { x: 4, y: 4 } });
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Frost risk');
});

test('a milestone click opens the milestone dialog', async ({ page }) => {
	await openExample(page);
	await gantt(page)
		.getByRole('button', { name: /^Milestone M2: Open day/ })
		.click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Open day');
});

test('the Default ring and ten ink alternatives keep milestone names, dates and editing', async ({
	page
}) => {
	await openExample(page);
	await writeStoredPlan(page, (plan) => {
		plan.milestones = MILESTONE_SYMBOLS.map((symbol, i) => ({
			id: `sign-${symbol}`,
			title: `Review ${symbol}`,
			description: 'Original description',
			date: new Date(Date.parse(`${plan.range.start}T00:00:00Z`) + (i + 2) * 86400000)
				.toISOString()
				.slice(0, 10),
			symbol
		}));
	});
	const plan = await storedPlan(page);
	for (const theme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: theme });
		await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
		for (const [index, milestone] of plan.milestones.entries()) {
			const mark = gantt(page).getByTestId('gantt-milestone').nth(index);
			await expect(mark).toHaveAccessibleName(
				`Milestone M${index + 1}: ${milestone.title} (${formatted(milestone.date)})`
			);
			await expectTokenPaint(mark.locator('svg'), 'color', '--foreground');
			await expectMilestoneDatePosition(mark, milestone.date, plan.range);
			if (index === 0) await expectMilestoneRing(mark);
			else {
				const icon = milestone.symbol === 'pin' ? 'map-pin' : milestone.symbol;
				await expect(mark.locator(`svg.lucide-${icon}`)).toBeVisible();
			}
		}
	}
	const mark = gantt(page).getByTestId('gantt-milestone').first();
	await mark.focus();
	await mark.press('Enter');
	const dialog = page.getByTestId('milestone-dialog');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByTestId('milestone-symbol')).toHaveText('Default');
	await expectMilestoneRing(dialog.getByTestId('milestone-symbol'), false);
	await expect(dialog.getByLabel('Description', { exact: true })).toHaveValue(
		'Original description'
	);
	await dialog.getByLabel('Title', { exact: true }).fill('Edited ring');
	await dialog.getByRole('button', { name: 'OK', exact: true }).click();
	await expect(dialog).toHaveCount(0);
	await expect(mark).toBeFocused();
	await expect
		.poll(async () => (await storedPlan(page)).milestones[0])
		.toEqual({ ...plan.milestones[0], title: 'Edited ring' });
	await page.reload();
	await expectMilestoneRing(mark);
	await expect(mark).toHaveAccessibleName(/Edited ring/);
});
