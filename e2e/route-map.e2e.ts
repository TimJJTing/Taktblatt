import { expect, test, type Page } from '@playwright/test';
import {
	chooseView,
	diagramStage,
	expectView,
	openPlans,
	openPreview,
	openRoutePlan,
	storedPlan,
	storedViewer,
	waitForAnimations,
	workspaceContent,
	writeStoredPlan
} from './helpers.ts';

declare global {
	interface Window {
		__printedDiagrams: { orientation: string; fragments: string[] }[][];
	}
}

const station = (page: Page, id: string) =>
	diagramStage(page).locator(`button[data-route-target="${id}"][data-route-focus="keyboard"]`);
const paper = (page: Page) => page.locator('[data-fragment="route-map-scene"]');

test('shows every top-level station, including undated, done and canceled work', async ({
	page
}) => {
	await openRoutePlan(page);
	await writeStoredPlan(page, (plan) => {
		const other = plan.tasks.find((t: { id: string }) => t.id === 'other')!;
		other.start = null;
		other.end = null;
		other.status = 'canceled';
	});
	const plan = await storedPlan(page);
	await chooseView(page, 'route-map');
	for (const task of plan.tasks.filter((t: { parentId: string | null }) => t.parentId === null)) {
		await expect(station(page, task.id)).toBeVisible();
	}
	await expect(station(page, 'child-a')).toHaveCount(0);
	await expect(station(page, 'other')).toHaveAccessibleName(/Route unrelated.*Canceled/i);
	await expect(diagramStage(page).locator('[title]')).toHaveCount(0);
	await expect(diagramStage(page).getByTestId('gantt-today')).toHaveCount(0);
});

test('station activation opens details and Escape returns focus without a Work plan jump', async ({
	page
}) => {
	await page.setViewportSize({ width: 800, height: 900 });
	await openRoutePlan(page);
	await chooseView(page, 'route-map');
	await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'tabs');
	const overview = page.locator('#workspace-tab-plan');
	await overview.click();
	const mark = station(page, 'parent');
	const workScroll = await page.locator('#work-pane').evaluate((e) => e.scrollTop);
	for (const activation of ['click', 'Enter', 'Space']) {
		if (activation === 'click') await mark.click();
		else await mark.press(activation);
		await expect(page.getByRole('dialog', { name: 'Task details', exact: true })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(mark).toBeFocused();
		await expect(overview).toHaveAttribute('aria-selected', 'true');
		expect(await page.locator('#work-pane').evaluate((e) => e.scrollTop)).toBe(workScroll);
	}
});

test('the separate chevron expands children without opening details or editing the plan', async ({
	page
}) => {
	await openRoutePlan(page);
	await chooseView(page, 'route-map');
	const before = await storedPlan(page);
	const expand = diagramStage(page).getByRole('button', {
		name: 'Show subtasks of Route parent',
		exact: true
	});
	await expect(expand).toHaveAttribute('aria-expanded', 'false');
	await expect(expand).toHaveAttribute('aria-controls', /.+/);
	await expand.click();
	await expect(station(page, 'child-a')).toBeVisible();
	await expect(station(page, 'child-b')).toBeVisible();
	await expect(station(page, 'parent')).toBeVisible();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(
		diagramStage(page).getByRole('button', { name: 'Hide subtasks of Route parent', exact: true })
	).toHaveAttribute('aria-expanded', 'true');
	expect(await storedPlan(page)).toEqual(before);
});

test('keeps the screen view across reload and plan switch, after Gantt in the real switch', async ({
	page
}) => {
	await openRoutePlan(page);
	const choices = await page
		.getByTestId('diagram-view-switch')
		.getByRole('radio')
		.evaluateAll((items) => items.map((e) => e.getAttribute('data-testid')));
	expect(choices).toEqual(expect.arrayContaining(['diagram-view-gantt', 'diagram-view-route-map']));
	expect(choices.indexOf('diagram-view-route-map')).toBeGreaterThan(
		choices.indexOf('diagram-view-gantt')
	);
	await chooseView(page, 'route-map');
	expect((await storedViewer(page)).diagramView).toBe('route-map');
	await page.reload();
	await expectView(page, 'route-map');
	const plans = await openPlans(page);
	await plans.getByRole('menuitem', { name: 'New plan', exact: true }).click();
	await expect(page.getByTestId('plan-heading')).toHaveText('Untitled plan');
	await expectView(page, 'route-map');
});

test('keeps screen and print diagram choices independent', async ({ page }) => {
	await openRoutePlan(page);
	await chooseView(page, 'route-map');
	const preview = await openPreview(page);
	await expect(preview.getByTestId('print-diagram-gantt')).toHaveAttribute('aria-checked', 'true');
	await expect(preview.getByTestId('print-diagram-route-map')).toHaveAttribute(
		'aria-checked',
		'false'
	);
	await preview.getByTestId('print-diagram-route-map').click();
	await preview.getByTestId('print-diagram-gantt').click();
	await expect.poll(async () => (await storedViewer(page)).printDiagrams).toEqual(['route-map']);
	await page.keyboard.press('Escape');
	await chooseView(page, 'gantt');
	const again = await openPreview(page);
	await expect(again.getByTestId('print-diagram-route-map')).toHaveAttribute(
		'aria-checked',
		'true'
	);
	await expect(again.getByTestId('print-diagram-gantt')).toHaveAttribute('aria-checked', 'false');
	expect((await storedViewer(page)).diagramView).toBe('gantt');
});

test('Preview measures Route map items and repeated headers on landscape A4 and Letter', async ({
	page
}) => {
	await openRoutePlan(page);
	const preview = await openPreview(page);
	await preview.getByTestId('print-diagram-route-map').click();
	await preview.getByTestId('print-diagram-gantt').click();
	for (const size of ['a4', 'letter']) {
		await page.getByTestId(`paper-${size}`).click();
		await expect(page.getByTestId('sheets')).toHaveAttribute('data-paper', size);
		await expect(paper(page).first()).toBeVisible();
		await expect(paper(page).locator('[data-item]').first()).toBeVisible();
		await expect(paper(page).locator('[data-part="repeat"]').first()).toBeAttached();
		await expect
			.poll(() =>
				paper(page).evaluateAll((parts) =>
					parts.every(
						(part) =>
							part.closest('[data-testid="sheet"]')?.getAttribute('data-orientation') ===
							'landscape'
					)
				)
			)
			.toBe(true);
		await expect(paper(page).first()).toContainText('Route parent');
	}
});

test('mixed Gantt and Route map print in registry order with correct orientations and one total', async ({
	page
}) => {
	await openRoutePlan(page);
	const preview = await openPreview(page);
	await preview.getByTestId('print-diagram-route-map').click();
	await expect(paper(page).first()).toBeVisible();
	await waitForAnimations(preview);
	const layout = await preview.getByTestId('sheet').evaluateAll((sheets) =>
		sheets.map((sheet) => ({
			orientation: sheet.getAttribute('data-orientation'),
			fragments: [...sheet.querySelectorAll('[data-fragment]')].map((f) =>
				f.getAttribute('data-fragment')
			)
		}))
	);
	const order = [
		...new Set(
			layout.flatMap((s) => s.fragments).filter((id) => ['gantt', 'route-map-scene'].includes(id!))
		)
	];
	expect(order).toEqual(['gantt', 'route-map-scene']);
	for (const sheet of layout) {
		if (sheet.fragments.includes('route-map-scene')) expect(sheet.orientation).toBe('landscape');
		if (sheet.fragments.includes('gantt')) expect(sheet.orientation).toBe('portrait');
	}
	await expect(preview.getByTestId('sheet').getByTestId('page-number')).toHaveText(
		layout.map((_, i) => `${i + 1} / ${layout.length}`)
	);
	await page.emulateMedia({ media: 'print' });
	try {
		const pdf = (await page.pdf({ preferCSSPageSize: true })).toString('latin1');
		const orientations = [
			...pdf.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)
		].map(([, w, h]) => (Number(w) > Number(h) ? 'landscape' : 'portrait'));
		expect(orientations).toEqual(layout.map((s) => s.orientation));
	} finally {
		await page.emulateMedia({ media: 'screen' });
	}
});

test('reduced motion settles switches and expansion immediately with usable forced-color controls', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
	await openRoutePlan(page);
	await chooseView(page, 'route-map');
	await diagramStage(page)
		.getByRole('button', { name: 'Show subtasks of Route parent', exact: true })
		.click();
	await expect(station(page, 'child-a')).toBeVisible();
	await expect
		.poll(() =>
			diagramStage(page).evaluate(
				(stage) =>
					stage.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length
			)
		)
		.toBe(0);
	await chooseView(page, 'gantt');
	await chooseView(page, 'route-map');
	await expect(station(page, 'child-a')).toBeVisible();
	await station(page, 'child-a').press('Enter');
	await expect(page.getByRole('dialog', { name: 'Subtask details', exact: true })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(station(page, 'child-a')).toBeFocused();
});

test('Cmd/Ctrl+P and the beforeprint fallback use the saved Route map paper adapter', async ({
	page
}) => {
	await openRoutePlan(page);
	const preview = await openPreview(page);
	await preview.getByTestId('print-diagram-route-map').click();
	await preview.getByTestId('print-diagram-gantt').click();
	await page.keyboard.press('Escape');
	await page.reload();
	await expect(page.getByTestId('plan-heading')).toBeVisible();
	await page.evaluate(() => {
		window.__printedDiagrams = [];
		window.print = () =>
			window.__printedDiagrams.push(
				[...document.querySelectorAll<HTMLElement>('[data-testid="sheet"]')].map((sheet) => ({
					orientation: sheet.dataset.orientation!,
					fragments: [...sheet.querySelectorAll<HTMLElement>('[data-fragment]')].map(
						(f) => f.dataset.fragment!
					)
				}))
			);
	});
	await page.keyboard.press('ControlOrMeta+p');
	const printed = await page.evaluate(() => window.__printedDiagrams);
	expect(printed).toHaveLength(1);
	expect(
		printed[0].some((s) => s.fragments.includes('route-map-scene') && s.orientation === 'landscape')
	).toBe(true);
	await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
	await page.emulateMedia({ media: 'print' });
	try {
		await expect(paper(page).first()).toBeVisible();
		await expect(paper(page).locator('[data-item]').first()).toBeVisible();
	} finally {
		await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
		await page.emulateMedia({ media: 'screen' });
	}
});
