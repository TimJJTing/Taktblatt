import { MILESTONE_SYMBOLS } from '#lib/domain/schema.ts';
import { expect, test, type Page } from '@playwright/test';
import { inflateSync } from 'node:zlib';
import {
	appFontLoaded,
	expectMilestoneRing,
	expectMilestoneDatePosition,
	expectStageRule,
	expectTodayLine,
	expectTokenPaint,
	todayTagGeometry,
	choosePrint,
	expectOpaqueMark,
	expectLineStatus,
	expectStationStatus,
	dependencyContrast,
	formatted,
	openApp,
	openExample,
	chooseLanguage,
	openMenuWithKeyboard,
	openPreview,
	row,
	storedPlan,
	writeStoredPlan,
	setTaskStatus,
	openLinePlan,
	openContinuationPlan,
	expectCoveredCrossing,
	expectLocalTap,
	expectJunctionBehindMark,
	expectCyclePaint,
	dependencyGeometry,
	samplePaint
} from './helpers.ts';

declare global {
	interface Window {
		__printed: number;
		__printedSheets: number[];
	}
}

const sheets = (page: Page) => page.getByTestId('sheet');
const menuButton = (page: Page) => page.getByTestId('app-menu');

test('paper marks use physical sizes, opaque status paint and source-local taps on A4 and Letter', async ({
	page
}) => {
	await openLinePlan(page);
	await row(page, 'Crossing').getByTestId('task-toggle').click();
	await page.emulateMedia({ colorScheme: 'dark' });
	await openPreview(page);
	for (const paper of ['a4', 'letter']) {
		await page.getByTestId(`paper-${paper}`).click();
		const first = sheets(page).first();
		for (const [id, height, dotSize] of [
			['source', 5, 6],
			['child-a', 3.5, 4]
		] as const) {
			const task = first.locator(`[data-testid="sheet-gantt-row"][data-task-id="${id}"]`);
			await expect(task).toHaveCSS('height', '18px');
			await expect(task.locator('[data-gantt-line]')).toHaveCSS('height', `${height}px`);
			const dot = task.locator('.station-dot').first();
			await expect(dot).toHaveCSS('width', `${dotSize}px`);
			const bounds = await task.evaluate((row) => {
				const mark = row.querySelector('[data-testid="sheet-gantt-bar"]')!.getBoundingClientRect(),
					dot = row.querySelector('.station-dot')!.getBoundingClientRect();
				return { top: dot.top - mark.top, bottom: mark.bottom - dot.bottom };
			});
			expect(bounds.top).toBeGreaterThanOrEqual(-0.1);
			expect(bounds.bottom).toBeGreaterThanOrEqual(-0.1);
		}
		const point = first.getByTestId('sheet-gantt-point');
		await expect(point).toHaveAccessibleName(/^Point:/);
		await expect(point.locator('.station-dot')).toHaveCSS('width', '4px');
		await expect(point).not.toHaveAttribute('tabindex');
		const lines = first.getByTestId('sheet-gantt-dependency');
		await expect(lines.and(page.locator('[data-from="source"]')).first()).toHaveCSS(
			'stroke-width',
			'1px'
		);
		await expect(lines.and(page.locator('[data-from="child-a"][data-to="child-b"]'))).toHaveCSS(
			'stroke-width',
			'0.75px'
		);
		const tapMark = first.locator('[data-task-id="tap-source"]').getByTestId('sheet-gantt-bar');
		const tap = tapMark.getByTestId('sheet-gantt-tap');
		await expect(tap).toHaveAttribute('data-source', 'tap-source');
		await expect(tap).toHaveAttribute('aria-hidden', 'true');
		await expectLocalTap(tapMark, 'tap-source', true);
		await expect(tap).toHaveCSS('width', '4px');
		expect(await first.getByTestId('sheet-gantt-junction').count()).toBeGreaterThan(0);
		await expect(first.getByTestId('sheet-gantt-junction').first()).toHaveCSS('width', '4px');
		const crossed = first.locator('[data-task-id="crossing"]').getByTestId('sheet-gantt-bar');
		await expectOpaqueMark(crossed);
		await expectStationStatus(crossed, 'done', true);
		await expectLineStatus(crossed, 'done', true);
		await expectCoveredCrossing(crossed, lines);
		const child = first.locator('[data-task-id="child-a"]').getByTestId('sheet-gantt-bar');
		await expectStationStatus(child, 'done', true);
		await expectLineStatus(child, 'done', true);
		await expectCoveredCrossing(child, lines);
		await expectJunctionBehindMark(first.getByTestId('sheet-gantt-junction').first(), crossed);
		for (const line of await lines.all()) {
			await expect(line).toHaveAttribute('data-from', /.+/);
			await expect(line).toHaveAttribute('data-to', /.+/);
		}
		await page.emulateMedia({ media: 'print' });
		await expectOpaqueMark(crossed);
		await expectStationStatus(crossed, 'done', true);
		await page.emulateMedia({ media: 'screen' });
	}
});

test('paper keeps complete local routes below repeated headers and adds crossing paths separately', async ({
	page
}) => {
	await openLinePlan(page);
	await addManyTasks(page, 100);
	await writeStoredPlan(page, (plan) => {
		// A chain puts complete edges on every fragment and crossing edges at each break.
		for (let i = 0; i < 100; i++)
			plan.tasks.find((t: { id: string }) => t.id === `bulk${i}`)!.dependsOn = i
				? [`bulk${i - 1}`]
				: [];
	});
	await openPreview(page);
	const fragments = page
		.getByTestId('sheets')
		.locator('[data-fragment]')
		.filter({ has: page.getByTestId('sheet-month-header') });
	expect(await fragments.count()).toBeGreaterThan(1);
	const plan = await storedPlan(page);
	let total = 0;
	for (const fragment of await fragments.all()) {
		const ids = await fragment
			.getByTestId('sheet-gantt-row')
			.evaluateAll((rows) => rows.map((r) => r.getAttribute('data-task-id')));
		const expected = plan.tasks.flatMap((task: { id: string; dependsOn: string[] }) =>
			ids.includes(task.id)
				? task.dependsOn
						.filter((id: string) => ids.includes(id))
						.map((id: string) => `${id}->${task.id}`)
				: []
		);
		const lines = fragment
			.getByTestId('sheet-gantt-dependency')
			.and(page.locator(':not([data-continuation])'));
		const keys = await lines.evaluateAll((paths) =>
			paths.map((p) => `${(p as SVGElement).dataset.from}->${(p as SVGElement).dataset.to}`)
		);
		expect(keys.sort()).toEqual(expected.sort());
		total += keys.length;
		for (const line of await lines.all()) {
			const g = await dependencyGeometry(line, true);
			expect(g.out).not.toBeNull();
			expect(g.in).not.toBeNull();
			expect(g.first.x).toBeCloseTo(g.out!.x, 0);
			expect(g.first.y).toBeCloseTo(g.out!.y, 0);
			expect(g.last.x).toBeCloseTo(g.in!.x, 0);
			expect(g.last.y).toBeCloseTo(g.in!.y, 0);
			const bounds = await line.evaluate((node) => {
				const path = node as SVGPathElement,
					box = path.getBBox(),
					matrix = path.getScreenCTM()!;
				const top = new DOMPoint(box.x, box.y).matrixTransform(matrix).y;
				const bottom = new DOMPoint(box.x, box.y + box.height).matrixTransform(matrix).y;
				const fragment = path.closest('[data-fragment]')!;
				return {
					top,
					bottom,
					headerBottom: fragment
						.querySelector('[data-testid="sheet-month-header"]')!
						.getBoundingClientRect().bottom,
					lastRowBottom: [...fragment.querySelectorAll('[data-testid="sheet-gantt-row"]')]
						.at(-1)!
						.getBoundingClientRect().bottom
				};
			});
			expect(bounds.top).toBeGreaterThanOrEqual(bounds.headerBottom);
			expect(bounds.bottom).toBeLessThanOrEqual(bounds.lastRowBottom);
		}
		for (const continuation of await fragment
			.locator('[data-testid="sheet-gantt-dependency"][data-continuation]')
			.all()) {
			await expect(continuation).toHaveAttribute('data-from', /.+/);
			await expect(continuation).toHaveAttribute('data-to', /.+/);
		}
	}
	expect(total).toBeGreaterThan(90);
});

test('Preview and printed tables show four status icons and mute done and canceled rows', async ({
	page
}) => {
	await openExample(page);
	await writeStoredPlan(page, (plan) => {
		plan.tasks = plan.tasks.filter((task) => task.parentId === null).slice(0, 4);
		for (const [index, task] of plan.tasks.entries()) {
			task.stageId = plan.stages[0].id;
			task.title = ['Status done', 'Status working', 'Status todo', 'Status canceled'][index];
			task.start = plan.range.start;
			task.end = null;
			task.status = ['done', 'in_progress', 'todo', 'canceled'][index];
			task.dependsOn = [];
		}
	});
	for (const title of ['Status done', 'Status working', 'Status todo', 'Status canceled']) {
		const point = page
			.getByTestId('gantt-point')
			.and(page.getByRole('img', { name: new RegExp(`^${title}:`) }));
		await expectOpaqueMark(point);
		await expectStationStatus(
			point,
			title === 'Status done'
				? 'done'
				: title === 'Status canceled'
					? 'canceled'
					: title === 'Status working'
						? 'in_progress'
						: 'todo'
		);
	}
	await openPreview(page);
	const rows = sheets(page).getByTestId('sheet-task-row');
	await expect(rows).toHaveCount(4);
	const checkRows = async () => {
		const icons: string[] = [];
		for (const title of ['Status done', 'Status working', 'Status todo', 'Status canceled']) {
			const task = rows.filter({ hasText: title });
			const point = sheets(page)
				.getByTestId('sheet-gantt-point')
				.and(page.getByRole('img', { name: new RegExp(`^${title}:`) }));
			await expectOpaqueMark(point);
			await expectStationStatus(
				point,
				title === 'Status done'
					? 'done'
					: title === 'Status canceled'
						? 'canceled'
						: title === 'Status working'
							? 'in_progress'
							: 'todo',
				true
			);
			const statusCell = task.locator('td').first();
			if (title === 'Status canceled') {
				await expect(statusCell.locator('.sr-only')).toHaveText(/^canceled$/i);
				await expect(point).toHaveAccessibleName(/, canceled$/);
			}
			const icon = statusCell.locator('svg');
			await expect(icon).toHaveCount(1);
			icons.push(await icon.innerHTML());
			if (title === 'Status done' || title === 'Status canceled') {
				await expect(task).toHaveClass(/text-paper-ink-3/);
				await expect(task.locator('td').nth(1).locator('.line-through')).toHaveCount(1);
			} else {
				await expect(task).not.toHaveClass(/text-paper-ink-3/);
				await expect(task.locator('.line-through')).toHaveCount(0);
			}
		}
		expect(new Set(icons).size).toBe(4);
	};
	await checkRows();
	await page.emulateMedia({ media: 'print' });
	await checkRows();
});

test('Preview and print mute dependency lines from done and canceled sources', async ({ page }) => {
	await openExample(page);
	await writeStoredPlan(page, (plan) => {
		const source = plan.tasks.find((task) => task.title === 'Site survey')!;
		const target = plan.tasks.find((task) => task.title === 'Sowing')!;
		plan.tasks = [source, target];
		source.status = 'todo';
		source.dependsOn = [];
		target.status = 'todo';
		target.dependsOn = [source.id];
	});
	await openPreview(page);
	const line = sheets(page).first().getByTestId('sheet-gantt-dependency');
	await expect(line).toHaveCount(1);
	const normal = await dependencyContrast(line, true);
	const sheetCount = await sheets(page).count();
	await page.keyboard.press('Escape');
	await setTaskStatus(page, row(page, 'Sowing'), 'done');
	await openPreview(page);
	await expect.poll(() => dependencyContrast(line, true)).toBe(normal);
	await page.keyboard.press('Escape');
	await setTaskStatus(page, row(page, 'Site survey'), 'in_progress');
	await openPreview(page);
	await expect.poll(() => dependencyContrast(line, true)).toBe(normal);
	const workingBar = sheets(page)
		.first()
		.getByTestId('sheet-gantt-bar')
		.and(page.getByRole('img', { name: /^Site survey: .+, in progress$/ }));
	await expect(workingBar).toHaveCount(1);
	await expect(workingBar).toHaveCSS('opacity', '1');
	await page.emulateMedia({ media: 'print' });
	await expect.poll(() => dependencyContrast(line, true)).toBe(normal);
	await expect(workingBar).toHaveCSS('opacity', '1');
	await page.emulateMedia({ media: 'screen' });
	await page.keyboard.press('Escape');
	await setTaskStatus(page, row(page, 'Site survey'), 'done');
	await openPreview(page);
	await expect.poll(() => dependencyContrast(line, true)).toBeLessThan(normal);
	await expect(line).toHaveCSS('opacity', '1');
	await expect(sheets(page)).toHaveCount(sheetCount);
	const previewContrast = await dependencyContrast(line, true);
	await page.emulateMedia({ media: 'print' });
	await expect.poll(() => dependencyContrast(line, true)).toBe(previewContrast);
	await expect(sheets(page)).toHaveCount(sheetCount);
	await page.emulateMedia({ media: 'screen' });
	await page.keyboard.press('Escape');
	await setTaskStatus(page, row(page, 'Site survey'), 'canceled');
	await openPreview(page);
	const canceledBar = sheets(page)
		.getByTestId('sheet-gantt-bar')
		.and(page.getByRole('img', { name: /^Site survey: .+, canceled$/ }));
	await expectOpaqueMark(canceledBar);
	await expectStationStatus(canceledBar, 'canceled', true);
	await expectLineStatus(canceledBar, 'canceled', true);
	await expect.poll(() => dependencyContrast(line, true)).toBe(previewContrast);
	await expect(line).toHaveCSS('opacity', '1');
	await page.emulateMedia({ media: 'print' });
	await expectOpaqueMark(canceledBar);
	await expectStationStatus(canceledBar, 'canceled', true);
	await expectLineStatus(canceledBar, 'canceled', true);
	await expect.poll(() => dependencyContrast(line, true)).toBe(previewContrast);
});

const addDays = (date: string, days: number) =>
	new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Adds many tasks to the first stage. The Gantt and the table then need more than one sheet. */
async function addManyTasks(page: Page, count: number) {
	await writeStoredPlan(page, (plan) => {
		const stageId = plan.stages[0].id;
		for (let i = 0; i < count; i++) {
			plan.tasks.push({
				id: `bulk${i}`,
				stageId,
				parentId: null,
				title: `Bulk task ${i + 1}`,
				// An empty deliverable keeps the stage card small. A card is one block and does not split.
				deliverable: '',
				start: addDays(plan.range.start, i % 40),
				end: addDays(plan.range.start, (i % 40) + 5),
				owners: ['Noor'],
				status: 'todo',
				note: '',
				dependsOn: [],
				createdAt: new Date(Date.UTC(2030, 0, 1, 0, 0, i)).toISOString()
			});
		}
	});
}

test('the preview opens as a dialog, Esc closes it, and the focus returns to the menu button', async ({
	page
}) => {
	await openExample(page);
	await openPreview(page);
	// The workspace behind the dialog is inert.
	await expect(page.locator('[data-workspace]')).toHaveAttribute('inert', '');
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('preview')).toHaveCount(0);
	await expect(menuButton(page)).toBeFocused();
	await expect(page.locator('[data-workspace]')).not.toHaveAttribute('inert', '');
});

test('page 1 is the overview and the work plan starts on a new sheet', async ({ page }) => {
	await openExample(page);
	await openPreview(page);
	const count = await sheets(page).count();
	expect(count).toBeGreaterThan(1);
	const first = sheets(page).first();
	await expect(first.getByRole('heading', { level: 1 })).toContainText('Community Garden');
	await expect(first).toContainText('Objective:');
	await expect(first.getByTestId('sheet-month-header')).toHaveCount(1);
	await expect(first.getByTestId('sheet-gantt-row')).toHaveCount(7);
	await expect(first.getByTestId('sheet-gantt-today')).toBeVisible();
	await expect(first.getByTestId('sheet-gantt-bar')).toHaveCount(7);
	await expect(first.getByTestId('sheet-gantt-dependency')).toHaveCount(4);
	await expect(first.getByTestId('sheet-gantt-band')).toHaveCount(1);
	await expect(first.getByTestId('sheet-stage-card')).toHaveCount(3);
	await expect(first.getByText('Stages', { exact: true })).toBeVisible();
	await expect(first.getByText('Milestones', { exact: true }).first()).toBeVisible();
	await expect(first.getByText('Bands', { exact: true })).toBeVisible();
	await expect(first.getByTestId('sheet-table')).toHaveCount(0);

	const second = sheets(page).nth(1);
	await expect(second.locator('[data-fragment]').first()).toHaveAttribute(
		'data-fragment',
		/^stage-/
	);
	await expect(second.getByRole('heading', { name: 'Work plan' })).toBeVisible();
	await expect(second.getByTestId('sheet-table')).toHaveCount(3);
	// Remarks come after all stages.
	await expect(sheets(page).last().getByTestId('sheet-remark')).toHaveCount(2);

	// Every sheet shows "n / N".
	for (let i = 0; i < count; i++) {
		await expect(sheets(page).nth(i).getByTestId('page-number')).toHaveText(`${i + 1} / ${count}`);
	}
	// The footer of the plan shows on every sheet. The empty parts do not show.
	await expect(sheets(page).nth(1).getByTestId('sheet-footer-left')).toContainText('Example · v1');
	await expect(sheets(page).nth(1).getByTestId('sheet-footer-right')).toHaveText(
		'Garden volunteers'
	);
});

test('the sheet count is stable and the sheets have no controls', async ({ page }) => {
	await openExample(page);
	await openPreview(page);
	const count = await sheets(page).count();
	await page.keyboard.press('Escape');
	await openPreview(page);
	await expect(sheets(page)).toHaveCount(count);
	await expect(page.getByTestId('sheets').getByRole('button')).toHaveCount(0);
	await expect(page.getByTestId('sheets').getByRole('textbox')).toHaveCount(0);
	// The sheets use the plan fonts.
	expect(await appFontLoaded(page)).toBe(true);
});

test('the paper size changes the sheet size, is one undo step, and persists', async ({ page }) => {
	await openExample(page);
	// Reload to start with an empty undo history.
	await page.reload();
	await expect(page.getByTestId('plan-heading')).toContainText('Community Garden');
	const undo = page.getByRole('button', { name: 'Undo', exact: true });
	const redo = page.getByRole('button', { name: 'Redo', exact: true });
	await expect(undo).toBeDisabled();
	await expect(redo).toBeDisabled();
	const size = async () => {
		const box = await sheets(page).first().boundingBox();
		return { width: Math.round(box!.width), height: Math.round(box!.height) };
	};
	const assertPaper = async (paper: 'a4' | 'letter') => {
		await expect(page.getByTestId('paper-a4')).toHaveAttribute(
			'aria-checked',
			String(paper === 'a4')
		);
		await expect(page.getByTestId('paper-letter')).toHaveAttribute(
			'aria-checked',
			String(paper === 'letter')
		);
		await expect
			.poll(size)
			.toEqual(paper === 'a4' ? { width: 794, height: 1123 } : { width: 816, height: 1056 });
		await expect(page.getByTestId('sheets')).toHaveAttribute('data-paper', paper);
		await expect.poll(async () => (await storedPlan(page)).paper).toBe(paper);
	};
	await openPreview(page);
	await assertPaper('a4');

	await page.getByTestId('paper-letter').click();
	await assertPaper('letter');
	// The page number still matches the sheet count at the new size.
	const count = await sheets(page).count();
	await expect(sheets(page).last().getByTestId('page-number')).toHaveText(`${count} / ${count}`);

	await page.keyboard.press('ControlOrMeta+z');
	await assertPaper('a4');
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('preview')).toHaveCount(0);
	await expect(undo).toBeDisabled();
	await expect(redo).toBeEnabled();
	await redo.click();
	await expect(undo).toBeEnabled();
	await expect(redo).toBeDisabled();
	await openPreview(page);
	await assertPaper('letter');

	await page.reload();
	await openPreview(page);
	await assertPaper('letter');
});

test('expanding a parent adds rows to the preview', async ({ page }) => {
	await openExample(page);
	await openPreview(page);
	const rows = page.getByTestId('sheets').getByTestId('sheet-task-row');
	const ganttRows = page.getByTestId('sheets').getByTestId('sheet-gantt-row');
	await expect(rows).toHaveCount(7);
	await expect(ganttRows).toHaveCount(7);
	await page.keyboard.press('Escape');

	await row(page, 'Soil preparation').getByTestId('task-toggle').click();
	await openPreview(page);
	await expect(rows).toHaveCount(9);
	await expect(ganttRows).toHaveCount(9);
	await expect(page.getByTestId('sheets').getByText('Soil test')).toHaveCount(2);
});

test('the Gantt continues on the next sheet with the month header, and the table header repeats', async ({
	page
}) => {
	await openExample(page);
	await addManyTasks(page, 100);
	await openPreview(page);
	const count = await sheets(page).count();
	expect(count).toBeGreaterThan(4);

	// The Gantt has 107 rows. It continues on sheet 2. Each Gantt sheet has the month header.
	let ganttSheets = 0;
	let ganttRows = 0;
	for (let i = 0; i < count; i++) {
		const sheet = sheets(page).nth(i);
		const n = await sheet.getByTestId('sheet-gantt-row').count();
		if (n === 0) continue;
		ganttSheets += 1;
		ganttRows += n;
		await expect(sheet.getByTestId('sheet-month-header')).toHaveCount(1);
	}
	const fragments = sheets(page).filter({ has: page.getByTestId('sheet-month-header') });
	await expect(fragments.getByTestId('sheet-gantt-today')).toHaveCount(ganttSheets);
	await expect(fragments.first().getByTestId('sheet-gantt-today-label')).toHaveCount(1);
	for (const fragment of (await fragments.all()).slice(1)) {
		await expect(fragment.getByTestId('sheet-gantt-today-label')).toHaveCount(0);
		await expectTodayLine(fragment.getByTestId('sheet-gantt-today'), true);
	}
	expect(ganttSheets).toBeGreaterThanOrEqual(2);
	expect(ganttRows).toBe(107);
	await expect(sheets(page).nth(1).getByTestId('sheet-gantt-row').first()).toBeVisible();
	// The title of the timeline shows once.
	await expect(page.getByTestId('sheets').getByRole('heading', { name: 'Timeline' })).toHaveCount(
		1
	);

	// The first stage has 103 rows in the table. Its table continues, and the header repeats.
	let tableSheets = 0;
	let taskRows = 0;
	for (let i = 0; i < count; i++) {
		const sheet = sheets(page).nth(i);
		const n = await sheet.getByTestId('sheet-task-row').count();
		taskRows += n;
		if (n === 0) continue;
		const heads = sheet.getByTestId('sheet-table-head');
		await expect(heads).toHaveCount(await sheet.getByTestId('sheet-table').count());
		await expect(heads.first()).toContainText('Deliverable');
		tableSheets += 1;
	}
	expect(tableSheets).toBeGreaterThanOrEqual(3);
	expect(taskRows).toBe(107);
	// The stage header shows once. The work plan title shows once.
	await expect(
		page.getByTestId('sheets').getByRole('heading', { name: /S1.*Prepare/ })
	).toHaveCount(1);
	await expect(page.getByTestId('sheets').getByRole('heading', { name: 'Work plan' })).toHaveCount(
		1
	);
	// No sheet starts with an orphan stage header: a header always has rows below it on its sheet.
	for (let i = 0; i < count; i++) {
		const sheet = sheets(page).nth(i);
		const tables = await sheet.getByTestId('sheet-table').count();
		const rowCount = await sheet.getByTestId('sheet-task-row').count();
		if (tables > 0) expect(rowCount).toBeGreaterThanOrEqual(tables);
	}
	// Every sheet stays inside its own box: no content below the footer.
	// Read the geometry of all sheets in one snapshot.
	const bounds = await sheets(page).evaluateAll((elements) =>
		elements.map((sheet) => {
			const box = sheet.getBoundingClientRect();
			const footer = sheet.querySelector('[data-testid="sheet-footer"]')!.getBoundingClientRect();
			const content = sheet.querySelector('.sheet-content')!.getBoundingClientRect();
			const last = [...sheet.querySelectorAll('[data-fragment]')].at(-1)!.getBoundingClientRect();
			return {
				footerInside: footer.bottom <= box.bottom,
				contentInside: last.bottom <= content.bottom + 1
			};
		})
	);
	expect(bounds).toEqual(
		Array.from({ length: count }, () => ({ footerInside: true, contentInside: true }))
	);
});

test('an empty plan has an overview sheet and a work plan sheet', async ({ page }) => {
	await openApp(page);
	await openPreview(page);
	await expect(sheets(page)).toHaveCount(2);
	await expect(sheets(page).first().getByRole('heading', { level: 1 })).toHaveText('Untitled plan');
	await expect(sheets(page).first().getByTestId('page-number')).toHaveText('1 / 2');
	// The empty stage shows the empty notice.
	await expect(sheets(page).nth(1)).toContainText('No tasks yet.');
	// An empty objective and an empty subheading do not show.
	await expect(sheets(page).first()).not.toContainText('Objective:');
});

test('print renders the sheets on beforeprint, hides the workspace and removes the sheets after', async ({
	page
}) => {
	await openExample(page);
	await expect(page.getByTestId('sheets')).toHaveCount(0);
	// The sheets exist in the same task as the event. The browser lays out the page right after it.
	const count = await page.evaluate(() => {
		window.dispatchEvent(new Event('beforeprint'));
		return document.querySelectorAll('[data-testid="sheet"]').length;
	});
	expect(count).toBeGreaterThan(1);
	// On screen, the print-only sheets do not show.
	await expect(sheets(page).first()).toBeHidden();
	await page.emulateMedia({ media: 'print' });
	await expect(page.locator('[data-workspace]')).toBeHidden();
	await expect(page.getByTestId('plan-heading')).toBeHidden();
	await expect(sheets(page).first()).toBeVisible();
	await expect(sheets(page)).toHaveCount(count);
	// Print sets the page size and has no page margin.
	const rule = await page.evaluate(() =>
		Array.from(document.querySelectorAll('style'))
			.map((style) => style.textContent ?? '')
			.find((text) => text.includes('@page'))
	);
	expect(rule).toContain('size: A4');
	expect(rule).toContain('margin: 0');

	await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
	await expect(page.getByTestId('sheets')).toHaveCount(0);
	await page.emulateMedia({ media: 'screen' });
	await expect(page.locator('[data-workspace]')).toBeVisible();
});

test('the printed PDF has one page for each sheet', async ({ page }) => {
	await openExample(page);
	await page.getByTestId('paper-letter').count();
	await openPreview(page);
	await page.getByTestId('paper-letter').click();
	await expect(page.getByTestId('sheets')).toHaveAttribute('data-paper', 'letter');
	const count = await sheets(page).count();
	await page.emulateMedia({ media: 'print' });
	// Only the sheets show in print, even when the preview is open.
	await expect(page.getByTestId('plan-heading')).toBeHidden();
	const pdf = await page.pdf({ preferCSSPageSize: true });
	const text = pdf.toString('latin1');
	const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
	expect(pages).toBe(count);
	// US Letter is 612 x 792 points.
	expect(text).toMatch(/\/MediaBox\s*\[\s*0\s+0\s+612\s+792\s*\]/);
});

/** Reads the page drawing commands from a Chromium PDF. It excludes dates and document ids. */
function pdfPageContent(pdf: Buffer): string[] {
	const text = pdf.toString('latin1');
	return Array.from(text.matchAll(/\/Contents (\d+) 0 R/g), ([, id]) => {
		const object = text.match(new RegExp(`(?:^|\\n)${id} 0 obj\\n([\\s\\S]*?)\\nendobj`));
		expect(object, `PDF content object ${id}`).not.toBeNull();
		const stream = object![1].match(/stream\r?\n/);
		expect(stream, `PDF drawing stream ${id}`).not.toBeNull();
		const length = Number(object![1].match(/\/Length (\d+)/)![1]);
		const start = stream!.index! + stream![0].length;
		const data = object![1].slice(start, start + length);
		const commands = inflateSync(Buffer.from(data, 'latin1')).toString('latin1');
		// The browser can omit the white page canvas outside the sheet. Compare the sheet paint.
		const sheet = commands.match(/(?:^|\n)(0 0 [\d.]+ [\d.]+ re\nW\* n\n[\s\S]*)/);
		expect(sheet, `PDF sheet drawing commands ${id}`).not.toBeNull();
		return sheet![1];
	});
}

for (const source of ['preview', 'direct'] as const) {
	test(`${source} PDFs retain station, tap and cycle casing paint with backgrounds off`, async ({
		page
	}, testInfo) => {
		await openLinePlan(page);
		await writeStoredPlan(page, (plan) => {
			plan.tasks.find((t: { id: string }) => t.id === 'source')!.dependsOn = ['target'];
		});
		if (source === 'preview') await openPreview(page);
		else await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
		await page.emulateMedia({ media: 'print' });
		const first = sheets(page).first();
		const cycles = first
			.getByTestId('sheet-gantt-dependency')
			.and(page.locator('[data-cycle="true"]'));
		await expect(cycles).toHaveCount(2);
		for (const line of await cycles.all()) await expectCyclePaint(line, true);
		await expect(first.getByTestId('sheet-gantt-tap')).toHaveCount(1);
		await expect(first.getByTestId('sheet-gantt-point').locator('.station-dot')).toBeVisible();
		const count = await sheets(page).count();
		const withBackgrounds = await page.pdf({ preferCSSPageSize: true, printBackground: true });
		if (source === 'direct') {
			await page.emulateMedia({ media: 'screen' });
			await page.reload();
			await expect(page.getByTestId('plan-heading')).toBeVisible();
			await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
			await page.emulateMedia({ media: 'print' });
		}
		const withoutBackgrounds = await page.pdf({ preferCSSPageSize: true, printBackground: false });
		await testInfo.attach(`3c-${source}-backgrounds-off.pdf`, {
			body: withoutBackgrounds,
			contentType: 'application/pdf'
		});
		const paint = pdfPageContent(withBackgrounds);
		expect(paint).toHaveLength(count);
		expect(pdfPageContent(withoutBackgrounds)).toEqual(paint);
		// Chromium emits the warning red as vector paint. The dotted base and casing must print.
		expect(paint.join('\n')).toMatch(
			/(?:0)?\.784[\d]* (?:0)?\.207[\d]* (?:0)?\.176[\d]* (?:rg|RG)/
		);
	});
}

for (const source of ['preview', 'direct'] as const) {
	test(`print from ${source} keeps Gantt fills when background graphics are off`, async ({
		page
	}, testInfo) => {
		await openExample(page);
		await writeStoredPlan(page, (plan) => {
			plan.milestones[0].symbol = 'diamond';
			plan.milestones[1].symbol = 'hexagon';
			// Cover a point and a completed bar that starts before the visible range.
			plan.tasks.find((task: { title: string }) => task.title === 'First harvest')!.end = null;
			plan.tasks.find((task: { title: string }) => task.title === 'Site survey')!.start = addDays(
				plan.range.start,
				-3
			);
		});
		await row(page, 'Soil preparation').getByTestId('task-toggle').click();
		if (source === 'preview') await openPreview(page);
		else await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
		await page.emulateMedia({ media: 'print' });
		const first = sheets(page).first();
		await expect(first.getByTestId('sheet-gantt-row')).toHaveCount(9);
		await expect(first.getByTestId('sheet-gantt-bar')).toHaveCount(8);
		await expect(first.getByTestId('sheet-gantt-point')).toHaveCount(1);
		await expect(first.getByTestId('sheet-gantt-band')).toHaveCount(1);
		await expect(first.getByTestId('sheet-gantt-dependency')).toHaveCount(5);
		await expectMilestoneRing(first.getByRole('img', { name: /^Milestone M1:/ }));
		await expect(
			first.getByRole('img', { name: /^Milestone M2:/ }).locator('svg.lucide-hexagon')
		).toBeVisible();
		await expectStageRule(sheets(page).getByTestId('sheet-table').first(), true);

		const count = await sheets(page).count();
		const withBackgrounds = await page.pdf({ preferCSSPageSize: true, printBackground: true });
		// A direct print removes its sheets on afterprint. Render them for the second print.
		if (source === 'direct') {
			await page.emulateMedia({ media: 'screen' });
			await page.reload();
			await expect(page.getByTestId('plan-heading')).toBeVisible();
			await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
			await expect(sheets(page).first()).toBeAttached();
			await page.emulateMedia({ media: 'print' });
		}
		const withoutBackgrounds = await page.pdf({
			preferCSSPageSize: true,
			printBackground: false
		});
		await testInfo.attach('background-graphics-off.pdf', {
			body: withoutBackgrounds,
			contentType: 'application/pdf'
		});
		const expected = pdfPageContent(withBackgrounds);
		expect(expected).toHaveLength(count);
		// Compare actual paint, including bars, points, bands, swatches and dependency paths.
		expect(pdfPageContent(withoutBackgrounds)).toEqual(expected);
	});
}

test('Print in the menu opens the preview, and only the preview Print button calls window.print', async ({
	page
}) => {
	await openExample(page);
	await page.evaluate(() => {
		window.__printed = 0;
		// The stub sends no `afterprint`. The sheets stay until the next input of the user.
		window.print = () => {
			window.__printed += 1;
		};
	});
	const preview = await openPreview(page);
	await expect(preview).toBeFocused();
	expect(await page.evaluate(() => window.__printed)).toBe(0);
	await page.getByTestId('preview-print').click();
	expect(await page.evaluate(() => window.__printed)).toBe(1);
	await page.keyboard.press('Escape');
	await page.keyboard.press('ControlOrMeta+p');
	expect(await page.evaluate(() => window.__printed)).toBe(2);
});

test('keyboard Print in the menu opens the preview', async ({ page }) => {
	await openExample(page);
	await openMenuWithKeyboard(page);
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog', { name: 'Print preview' })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(menuButton(page)).toBeFocused();
});

test('the print today line uses the footer date', async ({ page }) => {
	await openExample(page);
	// The footer date of the example is today. Move it outside the range: the line disappears.
	await writeStoredPlan(page, (plan) => {
		plan.footer.date = addDays(plan.range.end, 30);
	});
	await openPreview(page);
	await expect(sheets(page).first().getByTestId('sheet-gantt-today')).toHaveCount(0);
	await page.keyboard.press('Escape');
	await writeStoredPlan(page, (plan) => {
		plan.footer.date = addDays(plan.range.start, 10);
	});
	await openPreview(page);
	await expect(sheets(page).first().getByTestId('sheet-gantt-today')).toHaveCount(1);
});

test('the sheets use the UI language, whatever an old file says', async ({ page }) => {
	await openExample(page);
	// An old plan can still have a language key. It must change nothing. The UI stays English.
	await writeStoredPlan(page, (plan) => {
		plan.locale = 'ja';
	});
	await openPreview(page);
	const first = sheets(page).first();
	await expect(first).toContainText('Objective:');
	await expect(first).toContainText('Timeline');
	await expect(first).toContainText('Today');
	await expect(first).not.toContainText('目標');
	await expect(first.locator('.sheet-footer')).toContainText(
		formatted((await storedPlan(page)).footer.date)
	);
});

test('the sheets of an English plan show German labels and dates in the German UI', async ({
	page
}) => {
	await openExample(page);
	const plan = await storedPlan(page);
	await chooseLanguage(page, 'Deutsch');
	// The plan has history, so the app asks before it reloads.
	await page.getByTestId('language-reload-confirm').click();
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	await choosePrint(page);
	await expect(sheets(page).first()).toBeVisible();
	const first = sheets(page).first();
	await expect(first).toContainText('Ziel:');
	await expect(first).toContainText('Zeitachse');
	await expect(first).toContainText('Heute');
	await expect(first).not.toContainText('Objective:');
	const german = new Intl.DateTimeFormat('de', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(`${plan.footer.date}T00:00:00Z`));
	await expect(first.locator('.sheet-footer')).toContainText(german);
});

test('open dialogs do not print, and the sheets do', async ({ page }) => {
	await openExample(page);
	await row(page, 'Sowing').getByTestId('task-details').click();
	await expect(page.getByTestId('task-dialog')).toBeVisible();
	await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
	await page.emulateMedia({ media: 'print' });
	await expect(page.getByTestId('task-dialog')).toBeHidden();
	await expect(page.getByTestId('sheet').first()).toBeVisible();
	await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
	await page.emulateMedia({ media: 'screen' });
});

test('print commits a field that is still in edit mode', async ({ page }) => {
	await openExample(page);
	await page.getByTestId('plan-heading').click();
	await page.getByTestId('plan-heading-input').fill('Typed but not saved');
	await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
	await expect(sheets(page).first()).toContainText('Typed but not saved');
	await expect(page.getByTestId('plan-heading')).toContainText('Typed but not saved');
});

test('printing from the preview keeps no screen shadow on the sheets', async ({ page }) => {
	await openExample(page);
	await openPreview(page);
	await expect(sheets(page).first()).not.toHaveCSS('box-shadow', 'none');
	await page.emulateMedia({ media: 'print' });
	await expect(sheets(page).first()).toHaveCSS('box-shadow', 'none');
});

test('the paper size control follows the radio keyboard pattern', async ({ page }) => {
	await openExample(page);
	await openPreview(page);
	const a4 = page.getByTestId('paper-a4');
	const letter = page.getByTestId('paper-letter');
	await expect(a4).toHaveAttribute('tabindex', '0');
	await expect(letter).toHaveAttribute('tabindex', '-1');
	await a4.focus();
	await page.keyboard.press('ArrowRight');
	await expect(letter).toBeFocused();
	await expect(letter).toHaveAttribute('aria-checked', 'true');
	await expect(letter).toHaveAttribute('tabindex', '0');
	await expect(page.getByTestId('sheets')).toHaveAttribute('data-paper', 'letter');
	await page.keyboard.press('Home');
	await expect(a4).toBeFocused();
	await expect(page.getByTestId('sheets')).toHaveAttribute('data-paper', 'a4');
	await page.keyboard.press('End');
	await expect(letter).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(a4).toBeFocused();
});

test('the target column of the sheets follows the workspace rule', async ({ page }) => {
	await openExample(page);
	// Keep the start dates and remove the end dates. Parents then have only a start, too.
	await writeStoredPlan(page, (plan) => {
		for (const task of plan.tasks) {
			if (task.start) task.end = null;
		}
	});
	const workspace = new Map<string, string>();
	for (const item of await page.getByTestId('task-row').all()) {
		const title = await item.getByTestId('task-title').innerText();
		workspace.set(title, (await item.getByTestId('task-target').innerText()).trim());
	}
	await openPreview(page);
	let checked = 0;
	for (const item of await page.getByTestId('sheet-task-row').all()) {
		const cells = item.locator('td');
		const title = (await cells.nth(1).innerText()).trim();
		const target = (await cells.nth(3).innerText()).trim();
		const shown = workspace.get(title);
		// A task without a date has a placeholder text in the workspace and an en dash on paper.
		if (shown === undefined || !/–$/.test(shown)) continue;
		expect(target).toBe(shown);
		checked++;
	}
	expect(checked).toBeGreaterThan(0);
});

test('the Preview Today tag stays inside the date area at both range edges', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await openExample(page);
	for (const edge of ['start', 'end'] as const) {
		await writeStoredPlan(page, (plan) => {
			plan.range = { start: '2027-01-01', end: '2027-02-28' };
			plan.footer.date = plan.range[edge];
			plan.milestones =
				edge === 'start'
					? [
							{
								id: 'paper-edge-review',
								title: 'Review',
								description: '',
								date: '2027-01-02',
								symbol: 'diamond'
							}
						]
					: [];
		});
		const preview = await openPreview(page);
		const first = preview.getByTestId('sheet').first();
		const tag = first.getByTestId('sheet-gantt-today-label');
		await expect(tag).toBeVisible();
		await expect(tag).toHaveAttribute('data-side', edge === 'start' ? 'right' : 'left');
		await expect
			.poll(async () => {
				const geometry = await todayTagGeometry(first, true);
				return (
					geometry.inRow &&
					geometry.tagLeft >= geometry.dateAreaLeft - 0.5 &&
					geometry.tagRight <= geometry.dateAreaRight + 0.5
				);
			})
			.toBe(true);
		await page.keyboard.press('Escape');
		await expect(preview).toHaveCount(0);
	}
});

for (const side of ['right', 'left'] as const) {
	test(`the paper Today tag stays in the milestone row on the ${side}`, async ({ page }) => {
		await openExample(page);
		await writeStoredPlan(page, (plan) => {
			plan.footer.date = addDays(plan.range.start, 10);
			plan.milestones = [
				{
					id: 'tag-review',
					title: 'Review',
					description: '',
					date: addDays(plan.range.start, side === 'left' ? 11 : 40),
					symbol: 'diamond'
				}
			];
		});
		await openPreview(page);
		for (const media of ['screen', 'print'] as const) {
			await page.emulateMedia({ media });
			const first = sheets(page).first();
			await expectTodayLine(first.getByTestId('sheet-gantt-today'), true);
			const geometry = await todayTagGeometry(first, true);
			expect(geometry.inRow).toBe(true);
			if (side === 'left') {
				expect(geometry.tagRight).toBeLessThanOrEqual(geometry.line + 0.5);
				expect(geometry.tagRight).toBeLessThan(geometry.markLeft);
			} else expect(geometry.tagLeft).toBeGreaterThanOrEqual(geometry.line);
			await expectTokenPaint(
				first.getByTestId('sheet-gantt-today-label'),
				'background-color',
				'--color-paper-ink',
				1,
				true
			);
			await expectTokenPaint(
				first.getByTestId('sheet-gantt-today-label'),
				'color',
				'--color-paper',
				1,
				true
			);
		}
	});
}

test('Today tags clear a milestone on the same date in Preview and print', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await openExample(page);
	await writeStoredPlan(page, (plan) => {
		plan.footer.date = addDays(plan.range.start, 20);
		plan.milestones = [
			{
				id: 'same-day',
				title: 'Review',
				description: '',
				date: plan.footer.date,
				symbol: 'diamond'
			}
		];
	});
	await openPreview(page);
	for (const media of ['screen', 'print'] as const) {
		await page.emulateMedia({ media });
		await expect
			.poll(async () => {
				const geometry = await todayTagGeometry(sheets(page).first(), true);
				return geometry.tagRight <= geometry.markLeft;
			})
			.toBe(true);
	}
});

test('the printed Gantt names points and marks tasks outside the range', async ({ page }) => {
	await openExample(page);
	await writeStoredPlan(page, (plan) => {
		const point = plan.tasks.find((t) => t.title === 'Sowing')!;
		point.start = addDays(plan.range.start, 5);
		point.end = null;
		const outside = plan.tasks.find((t) => t.title === 'Watering rota')!;
		outside.start = addDays(plan.range.end, 20);
		outside.end = addDays(plan.range.end, 25);
	});
	await openPreview(page);
	const first = sheets(page).first();
	await expect(first.getByTestId('sheet-gantt-point')).toHaveCount(1);
	await expect(first.getByTestId('sheet-gantt-point')).toHaveAttribute('aria-label', /: /);
	await expect(first.getByTestId('sheet-gantt-outside')).toHaveCount(1);
});

test('undo in the preview removes a new task from the sheets without an error', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await openExample(page);
	await page.getByTestId('add-task').first().click();
	await page.keyboard.type('Undo me');
	await page.keyboard.press('Enter');
	const preview = await openPreview(page);
	const rows = preview.getByTestId('sheet').getByTestId('sheet-task-row');
	await expect(rows.filter({ hasText: 'Undo me' })).toHaveCount(1);
	// The first undo reverts the title. The second removes the task.
	await preview.press('ControlOrMeta+z');
	await expect(rows.filter({ hasText: 'Undo me' })).toHaveCount(0);
	const count = await rows.count();
	await preview.press('ControlOrMeta+z');
	await expect(rows).toHaveCount(count - 1);
	await expect(preview.getByTestId('sheet').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('a print dialog that is cancelled leaves the plan on screen without an error', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
	await openExample(page);
	// No stub: the real print runs. Headless Chromium returns at once, like a cancel. The test sends `afterprint`.
	await page.keyboard.press('ControlOrMeta+p');
	await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
	await expect(page.getByTestId('plan-heading')).toBeVisible();
	await expect(page.getByRole('heading', { name: '500' })).toHaveCount(0);
	await expect(sheets(page)).toHaveCount(0);
	expect(errors).toEqual([]);
});

/** Stubs window.print. It records how many sheets are in the page at the time of the call. */
async function recordSheetsAtPrint(page: Page) {
	await page.evaluate(() => {
		window.__printedSheets = [];
		window.print = () => {
			window.__printedSheets.push(document.querySelectorAll('[data-testid="sheet"]').length);
		};
	});
}

test('the sheets are in the page when Cmd/Ctrl+P opens the print dialog', async ({ page }) => {
	await openExample(page);
	await recordSheetsAtPrint(page);
	await page.keyboard.press('ControlOrMeta+p');
	expect((await page.evaluate(() => window.__printedSheets))[0]).toBeGreaterThan(0);
});

test('a field in edit mode is committed before the sheets render for print', async ({ page }) => {
	await openExample(page);
	await writeStoredPlan(page, (plan) => {
		plan.objective = '';
	});
	await recordSheetsAtPrint(page);
	await page.getByTestId('plan-objective').click();
	await page.getByTestId('plan-objective-input').fill('Grow food together.');
	// The field keeps the focus. Print commits the draft first.
	await page.keyboard.press('ControlOrMeta+p');
	const sheetsAtPrint = (await page.evaluate(() => window.__printedSheets))[0];
	expect(sheetsAtPrint).toBeGreaterThan(0);
	expect((await storedPlan(page)).objective).toBe('Grow food together.');
	await expect(sheets(page).first()).toContainText('Grow food together.');
});

test('the sheets go away at the next input when the print sends no end event', async ({ page }) => {
	await openExample(page);
	// A no-op print: no `afterprint` and no change of the print media.
	await page.evaluate(() => {
		window.print = () => {};
	});
	await page.keyboard.press('ControlOrMeta+p');
	await expect(sheets(page).first()).toBeAttached();
	await page.getByTestId('plan-heading').click();
	await expect(sheets(page)).toHaveCount(0);
	await page.keyboard.press('ControlOrMeta+p');
	await expect(sheets(page).first()).toBeAttached();
	await page.keyboard.press('Shift');
	await expect(sheets(page)).toHaveCount(0);
});

test('the beforeprint fallback commits a field in edit mode', async ({ page }) => {
	await openExample(page);
	await writeStoredPlan(page, (plan) => {
		plan.objective = '';
	});
	await page.getByTestId('plan-objective').click();
	await page.getByTestId('plan-objective-input').fill('Grow food together.');
	// A print from the browser menu sends only the events.
	await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
	expect((await storedPlan(page)).objective).toBe('Grow food together.');
	await expect(sheets(page).first()).toContainText('Grow food together.');
	await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
	await expect(sheets(page)).toHaveCount(0);
});

test('paper signs keep their ink, badges and first-row placement on A4 and Letter', async ({
	page
}) => {
	await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
	await openExample(page);
	await writeStoredPlan(page, (plan) => {
		plan.milestones = MILESTONE_SYMBOLS.map((symbol, index) => ({
			id: `paper-${symbol}`,
			title: `Paper ${symbol}`,
			description: '',
			date: addDays(plan.range.start, index * 3 + 1),
			symbol
		}));
	});
	const plan = await storedPlan(page);
	await openPreview(page);
	for (const paper of ['a4', 'letter']) {
		await page.getByTestId(`paper-${paper}`).click();
		await expect(page.getByTestId('sheets')).toHaveAttribute('data-paper', paper);
		for (const media of ['screen', 'print'] as const) {
			await page.emulateMedia({ media });
			const first = sheets(page).first();
			for (const milestone of await first.getByRole('img', { name: /^Milestone M/ }).all()) {
				await expectTokenPaint(milestone.locator('svg'), 'color', '--color-paper-ink', 1, true);
			}
			await expectMilestoneRing(first.getByRole('img', { name: /^Milestone M1:/ }));
			for (const [index, milestone] of plan.milestones.entries()) {
				await expectMilestoneDatePosition(
					first.getByRole('img', { name: new RegExp(`^Milestone M${index + 1}:`) }),
					milestone.date,
					plan.range
				);
			}
			for (const symbol of [
				'flag',
				'star',
				'circle',
				'triangle',
				'square',
				'hexagon',
				'pentagon',
				'map-pin',
				'bookmark',
				'heart'
			]) {
				await expect(first.locator(`svg.lucide-${symbol}`)).toHaveCount(1);
			}
			await expect(
				first.getByRole('list', { name: 'Stages', exact: true }).locator('.stage-badge')
			).toHaveText(['S1', 'S2', 'S3']);
			for (const table of await sheets(page).getByTestId('sheet-table').all()) {
				await expectStageRule(table, true);
				const heading = table.locator('xpath=preceding-sibling::*[1]').locator('h3');
				await expect(heading.locator('.stage-badge')).toHaveCount(1);
			}
			await expect
				.poll(() =>
					sheets(page).evaluateAll((elements) =>
						elements.every((sheet) => {
							const content = sheet.querySelector('.sheet-content')!.getBoundingClientRect();
							const fragments = [...sheet.querySelectorAll('[data-fragment]')];
							return fragments.every(
								(fragment) => fragment.getBoundingClientRect().bottom <= content.bottom + 1
							);
						})
					)
				)
				.toBe(true);
		}
		await page.emulateMedia({ media: 'screen' });
	}
});

test('flipping the paper Today tag preserves fragment rows and pagination', async ({ page }) => {
	await openExample(page);
	await addManyTasks(page, 100);
	await writeStoredPlan(page, (plan) => {
		plan.footer.date = addDays(plan.range.start, 10);
		plan.milestones = [
			{
				id: 'flip-review',
				title: 'Review',
				description: '',
				date: addDays(plan.range.start, 40),
				symbol: 'diamond'
			}
		];
	});
	for (const paper of ['a4', 'letter']) {
		await openPreview(page);
		await page.getByTestId(`paper-${paper}`).click();
		const assignments = () =>
			sheets(page).evaluateAll((elements) =>
				elements.map((sheet) => ({
					rows: [
						...sheet.querySelectorAll(
							'[data-testid="sheet-gantt-row"], [data-testid="sheet-task-row"]'
						)
					].map((row) => row.textContent),
					milestoneHeight:
						sheet.querySelector('[data-part="extra"]')?.getBoundingClientRect().height ?? 0
				}))
			);
		const before = await assignments();
		await page.keyboard.press('Escape');
		await writeStoredPlan(page, (plan) => {
			plan.milestones[0].date = addDays(plan.range.start, 11);
		});
		await openPreview(page);
		await expect.poll(assignments).toEqual(before);
		const geometry = await todayTagGeometry(sheets(page).first(), true);
		expect(geometry.inRow).toBe(true);
		expect(geometry.tagRight).toBeLessThanOrEqual(geometry.line + 0.5);
		await page.keyboard.press('Escape');
		await writeStoredPlan(page, (plan) => {
			plan.milestones[0].date = addDays(plan.range.start, 40);
		});
	}
});

test('paired stubs, pass-throughs and metadata cover each represented dependency on A4 and Letter', async ({
	page
}) => {
	await openContinuationPlan(page);
	const screenPaths = await page
		.getByTestId('gantt-dependency')
		.first()
		.evaluateHandle((paths) => ({ first: paths, parent: paths.parentNode }));
	await page.emulateMedia({ colorScheme: 'dark' });
	await openPreview(page);
	const plan = await storedPlan(page);
	const edges = plan.tasks.flatMap((task: { id: string; dependsOn: string[] }) =>
		task.dependsOn.map((from: string) => ({ key: `${from}->${task.id}`, from, to: task.id }))
	);
	for (const paper of ['a4', 'letter']) {
		await page.getByTestId(`paper-${paper}`).click();
		const fragments = page
			.getByTestId('sheets')
			.locator('[data-fragment]')
			.filter({ has: page.getByTestId('sheet-month-header') });
		expect(await fragments.count()).toBeGreaterThanOrEqual(3);
		const groups = await fragments.evaluateAll((fragments) =>
			fragments.map((fragment) =>
				[...fragment.querySelectorAll('[data-testid="sheet-gantt-row"]')].map((row) =>
					row.getAttribute('data-task-id')!
				)
			)
		);
		const order = groups.flat();
		const risers = new Map<string, number>();
		for (const [index, fragment] of (await fragments.all()).entries()) {
			const lo = order.indexOf(groups[index][0]),
				hi = order.indexOf(groups[index].at(-1)!);
			const represented = edges.filter(
				(edge: { from: string; to: string }) =>
					Math.min(order.indexOf(edge.from), order.indexOf(edge.to)) <= hi &&
					Math.max(order.indexOf(edge.from), order.indexOf(edge.to)) >= lo
			);
			const base = fragment.getByTestId('sheet-gantt-dependency');
			const keys = await base.evaluateAll((paths) =>
				paths.map(
					(path) => `${(path as SVGElement).dataset.from}->${(path as SVGElement).dataset.to}`
				)
			);
			expect(keys.sort()).toEqual(represented.map((edge: { key: string }) => edge.key).sort());
			for (const edge of represented) {
				const path = base.and(page.locator(`[data-from="${edge.from}"][data-to="${edge.to}"]`));
				const kind = groups[index].includes(edge.from)
					? 'exit'
					: groups[index].includes(edge.to)
						? 'entry'
						: 'pass-through';
				await expect(path).toHaveAttribute('data-continuation', kind);
				const x = await path.evaluate((node, kind) => {
					const path = node as SVGPathElement;
					return path.getPointAtLength(kind === 'exit' ? path.getTotalLength() : 0).x;
				}, kind);
				expect(Number.isFinite(x)).toBe(true);
				if (risers.has(edge.key)) expect(x).toBe(risers.get(edge.key));
				else risers.set(edge.key, x);
				const stubs = fragment
					.getByTestId('sheet-gantt-continuation-stub')
					.and(page.locator(`[data-overlay-for="${edge.key}"]`));
				const ticks = fragment
					.getByTestId('sheet-gantt-continuation-tick')
					.and(page.locator(`[data-overlay-for="${edge.key}"]`));
				await expect(stubs).toHaveCount(kind === 'pass-through' ? 2 : 1);
				await expect(ticks).toHaveCount(kind === 'pass-through' ? 2 : 1);
				for (const [overlay, length] of [
					[stubs, 4],
					[ticks, 2]
				] as const) {
					for (const sign of await overlay.all()) {
						await expect(sign).toHaveAttribute('aria-hidden', 'true');
						await expect(sign).toHaveCSS('stroke-dasharray', 'none');
						expect(
							await sign.evaluate((node) => (node as SVGPathElement).getTotalLength())
						).toBeCloseTo(length, 4);
					}
				}
				const bounds = await path.evaluate((node) => {
					const path = node as SVGPathElement,
						box = path.getBBox(),
						matrix = path.getScreenCTM()!;
					const fragment = path.closest('[data-fragment]')!;
					return {
						top: new DOMPoint(box.x, box.y).matrixTransform(matrix).y,
						bottom: new DOMPoint(box.x, box.y + box.height).matrixTransform(matrix).y,
						header: fragment
							.querySelector('[data-testid="sheet-month-header"]')!
							.getBoundingClientRect().bottom,
						body: [...fragment.querySelectorAll('[data-testid="sheet-gantt-row"]')]
							.at(-1)!
							.getBoundingClientRect().bottom
					};
				});
				expect(bounds.top).toBeGreaterThanOrEqual(bounds.header);
				expect(bounds.bottom).toBeLessThanOrEqual(bounds.body);
				if (edge.from === 'up-source' || edge.from === 'up-target')
					await expectCyclePaint(path, true);
			}
		}
		const first = fragments.first(),
			last = fragments.last();
		await expect(first.getByTestId('sheet-gantt-today-label')).toHaveCount(1);
		await expect(last.getByTestId('sheet-gantt-today-label')).toHaveCount(0);
		const tap = last.locator('[data-task-id="up-source"] [data-testid="sheet-gantt-bar"]');
		await expectLocalTap(tap, 'up-source', true);
		const clamped = last.locator('[data-testid="sheet-gantt-dependency"][data-from="up-source"]');
		const clamp = await clamped.evaluate((node) => ({
			x: (node as SVGPathElement).getPointAtLength((node as SVGPathElement).getTotalLength()).x,
			width: (node as SVGPathElement).ownerSVGElement!.getBoundingClientRect().width
		}));
		expect(clamp.x).toBeLessThan(clamp.width);
		const satisfied = fragments
			.nth(1)
			.locator('[data-testid="sheet-gantt-dependency"][data-from="a"]');
		const paint = await samplePaint(
			satisfied,
			'stroke',
			'color-mix(in oklab, currentColor 40%, #fff)'
		);
		expect(paint.actual).toEqual(paint.expected);
		await expect(sheets(page).first()).toHaveCSS('color-scheme', 'light');
	}
	expect(
		await screenPaths.evaluate(
			({ first, parent }) => first.isConnected && first.parentNode === parent
		)
	).toBe(true);
	await screenPaths.dispose();
});

/** Ignore repeated opaque white page canvases. Preview can add one behind each sheet. */
function pdfSheetPaint(pdf: Buffer): string[] {
	const source = pdf.toString('latin1');
	const resources = new Map<string, Set<string>>();
	for (const [, name, id] of source.matchAll(/\/(G\d+)\s+(\d+) 0 R/g)) {
		const ids = resources.get(name) ?? new Set<string>();
		ids.add(id);
		resources.set(name, ids);
	}
	const opaque = new Set<string>();
	for (const [name, ids] of resources) {
		if (ids.size !== 1) continue;
		const [id] = ids;
		const object = source.match(new RegExp(`(?:^|\\n)${id} 0 obj\\n([\\s\\S]*?)\\nendobj`));
		if (!object) continue;
		const state = object[1];
		const masks = state.match(/\/SMask\b/g) ?? [];
		const noSoftMask =
			masks.length === 0 || (masks.length === 1 && /\/SMask\s*\/None\b/.test(state));
		if (
			(state.match(/\/ca\b/g) ?? []).length === 1 &&
			/\/ca\s+1(?:\.0+)?(?=\s|\/|>>)/.test(state) &&
			(state.match(/\/BM\b/g) ?? []).length === 1 &&
			/\/BM\s*\/Normal\b/.test(state) &&
			noSoftMask
		)
			opaque.add(name);
	}
	return pdfPageContent(pdf).map((commands) =>
		commands.replace(
			/(1 1 1 RG 1 1 1 rg\n\/(G\d+) gs\n)((?:0 -?[\d.]+ [\d.]+ [\d.]+ re\nf\n)+)/g,
			(all, paint: string, state: string, rectangles: string) => {
				if (!opaque.has(state)) return all;
				const fills = rectangles.match(/0 -?[\d.]+ [\d.]+ [\d.]+ re\nf\n/g)!;
				return (
					paint +
					fills
						.filter((fill, i) => {
							const [, , width, height] = fill.match(/-?[\d.]+/g)!.map(Number);
							return i === 0 || fill !== fills[i - 1] || width < 700 || height < 1000;
						})
						.join('')
				);
			}
		)
	);
}

test('Preview and direct A4 and Letter PDFs keep solid break signs and cycle casing with backgrounds off', async ({
	page
}, testInfo) => {
	await openContinuationPlan(page);
	for (const paper of ['a4', 'letter']) {
		await openPreview(page);
		await page.getByTestId(`paper-${paper}`).click();
		const ticks = page.getByTestId('sheets').getByTestId('sheet-gantt-continuation-tick');
		await expect(ticks.first()).toBeAttached();
		const tick = await ticks.first().evaluate((node) => {
			const path = node as SVGPathElement;
			const style = getComputedStyle(path);
			return {
				width: path.getBBox().width,
				length: path.getTotalLength(),
				stroke: style.stroke,
				dash: style.strokeDasharray,
				strokeWidth: parseFloat(style.strokeWidth)
			};
		});
		expect(tick.width).toBe(2);
		expect(tick.length).toBe(2);
		expect(tick.stroke).not.toBe('none');
		expect(tick.strokeWidth).toBeGreaterThan(0);
		expect(tick.dash).toBe('none');
		await page.emulateMedia({ media: 'print' });
		const preview = await page.pdf({ preferCSSPageSize: true, printBackground: true });
		// A horizontal tick has no box height. Its PDF paint must still be present.
		const savedTicks = await ticks.evaluateAll((nodes) =>
			nodes.map((node) => {
				const path = node as SVGPathElement;
				const visibility = path.style.visibility;
				path.style.visibility = 'hidden';
				return visibility;
			})
		);
		try {
			const hiddenTicks = await page.pdf({ preferCSSPageSize: true, printBackground: true });
			expect(pdfPageContent(hiddenTicks)).not.toEqual(pdfPageContent(preview));
		} finally {
			await ticks.evaluateAll(
				(nodes, values) =>
					nodes.forEach((node, i) => {
						(node as SVGPathElement).style.visibility = values[i];
					}),
				savedTicks
			);
		}
		const without = await page.pdf({ preferCSSPageSize: true, printBackground: false });
		expect(pdfPageContent(without)).toEqual(pdfPageContent(preview));
		await testInfo.attach(`3d-${paper}-preview-backgrounds-off.pdf`, {
			body: without,
			contentType: 'application/pdf'
		});
		await page.emulateMedia({ media: 'screen' });
		await page.reload();
		await expect(page.getByTestId('plan-heading')).toBeVisible();
		await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
		await expect(page.getByTestId('sheet-gantt-continuation-tick').first()).toBeAttached();
		await page.emulateMedia({ media: 'print' });
		const direct = await page.pdf({ preferCSSPageSize: true, printBackground: false });
		expect(pdfSheetPaint(direct)).toEqual(pdfSheetPaint(preview));
		await testInfo.attach(`3d-${paper}-direct-backgrounds-off.pdf`, {
			body: direct,
			contentType: 'application/pdf'
		});
		await page.emulateMedia({ media: 'screen' });
		await page.reload();
		await expect(page.getByTestId('plan-heading')).toBeVisible();
	}
});
