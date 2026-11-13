/**
 * Diagram views (ADR 20, docs/spec.md 5.13 and 7).
 * Untagged tests check the normal production build. It has Gantt and the other real views, but no
 * fixture views. The tests do not assert the exact set, count or full order of the real views.
 * Tests tagged @diagram-fixtures need the build with TAKTBLATT_DIAGRAM_FIXTURES=1. That build adds
 * the test-only views `test-list` (portrait) and `test-board` (landscape).
 */
import { expect, test, type Page } from '@playwright/test';
import {
	chooseView,
	diagramStage as stage,
	expectPanelHeight,
	expectView,
	importJson,
	openApp,
	openExample,
	openPlans,
	openPreview,
	readDownload,
	settledPanelHeight,
	storedViewer,
	waitForAnimations
} from './helpers.ts';

declare global {
	interface Window {
		__printedDiagrams: { orientation: string; fragments: string[] }[][];
	}
}

const DIAGRAM_FRAGMENTS = ['gantt', 'test-list-scene', 'test-board-scene'];
/** Gantt and the fixture views. The fixture tests ignore the other real views. */
const KNOWN_VIEWS = ['gantt', 'test-list', 'test-board'];
const FIXTURE_VIEWS = ['test-list', 'test-board'];
const known = (ids: readonly string[]) => ids.filter((id) => KNOWN_VIEWS.includes(id));

/** The view ids of the view switch choices, in display order. */
const viewChoices = (page: Page) =>
	page
		.getByTestId('diagram-view-switch')
		.getByRole('radio')
		.evaluateAll((items) =>
			items.map((item) => item.getAttribute('data-testid')!.replace('diagram-view-', ''))
		);

/** The fragments of each sheet in the page, in sheet order. */
const sheetLayout = (page: Page) =>
	page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('[data-testid="sheet"]')].map((sheet) => ({
			orientation: sheet.dataset.orientation!,
			fragments: [...sheet.querySelectorAll<HTMLElement>('[data-fragment]')].map(
				(fragment) => fragment.dataset.fragment!
			)
		}))
	);

const diagramOrder = (layout: { fragments: string[] }[]) => [
	...new Set(
		layout.flatMap((sheet) => sheet.fragments).filter((id) => DIAGRAM_FRAGMENTS.includes(id))
	)
];

test.describe('production build', () => {
	test('ignores stored fixture views and prints Gantt in portrait', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await openApp(page);
		await page.evaluate(() =>
			localStorage.setItem(
				'taktblatt:ui',
				JSON.stringify({
					diagramView: 'test-list',
					printDiagrams: ['test-board'],
					ganttHeight: 0.45,
					ganttPinned: true
				})
			)
		);
		await openExample(page);
		await expect(stage(page)).toHaveAttribute('data-view', 'gantt');
		await expect(page.getByTestId('gantt')).toBeVisible();
		await expect(page.getByTestId('fixture-task')).toHaveCount(0);
		for (const id of FIXTURE_VIEWS) {
			await expect(page.getByTestId(`diagram-view-${id}`)).toHaveCount(0);
		}
		// The invalid view fields do not reset the other viewer fields.
		await expect(page.getByTestId('gantt-pin')).toHaveAttribute('aria-pressed', 'true');
		await expectPanelHeight(page, 0.45 * 900);
		expect(await storedViewer(page)).toMatchObject({ ganttHeight: 0.45, ganttPinned: true });

		const preview = await openPreview(page);
		for (const id of FIXTURE_VIEWS) {
			await expect(preview.getByTestId(`print-diagram-${id}`)).toHaveCount(0);
		}
		const layout = await sheetLayout(page);
		expect(diagramOrder(layout)).toEqual(['gantt']);
		const gantt = layout.filter((sheet) => sheet.fragments.includes('gantt'));
		expect(gantt.length).toBeGreaterThan(0);
		expect(gantt.every((sheet) => sheet.orientation === 'portrait')).toBe(true);
	});

	test('export and backup files do not contain the diagram preferences', async ({ page }) => {
		await openApp(page);
		await page.evaluate(() =>
			localStorage.setItem(
				'taktblatt:ui',
				JSON.stringify({ diagramView: 'gantt', printDiagrams: ['gantt'] })
			)
		);
		await openExample(page);
		for (const item of ['Export this plan', 'Back up all plans']) {
			const text = JSON.stringify((await readDownload(page, item)).file);
			expect(text).not.toContain('diagramView');
			expect(text).not.toContain('printDiagrams');
		}
	});

	// The served code, not the build directory: a reused server can serve an older build.
	test('the served app code contains no fixture code', async ({ page }) => {
		const bodies: Promise<{ url: string; text: string }>[] = [];
		page.on('response', (response) => {
			const type = response.request().resourceType();
			if (['script', 'stylesheet', 'document'].includes(type) && response.ok()) {
				bodies.push(response.text().then((text) => ({ url: response.url(), text })));
			}
		});
		await openExample(page);
		await openPreview(page);
		const files = await Promise.all(bodies);
		expect(files.some((file) => file.url.endsWith('.js'))).toBe(true);
		for (const { url, text } of files) {
			for (const marker of ['Test board', 'Test list', 'fixture-task']) {
				expect(text.includes(marker), `${url} contains ${marker}`).toBe(false);
			}
		}
	});
});

test.describe('fixture views', () => {
	test('the selected view persists across reload, plan switch and import @diagram-fixtures', async ({
		page
	}) => {
		await openExample(page);
		const file = (await readDownload(page, 'Export this plan')).file;
		await expect.poll(async () => known(await viewChoices(page))).toEqual(KNOWN_VIEWS);
		for (const [id, name] of [
			['gantt', 'Gantt'],
			['test-list', 'Test list'],
			['test-board', 'Test board']
		]) {
			await expect(page.getByTestId(`diagram-view-${id}`)).toHaveText(name);
		}
		await expectView(page, 'gantt');

		await chooseView(page, 'test-list');
		await expect(page.getByTestId('fixture-list')).toBeVisible();
		expect((await storedViewer(page)).diagramView).toBe('test-list');

		await page.reload();
		await expectView(page, 'test-list');

		const plans = await openPlans(page);
		await plans.getByRole('menuitem', { name: 'New plan' }).click();
		await expect(page.getByTestId('plan-heading')).toHaveText('Untitled plan');
		await expectView(page, 'test-list');

		file.plan.id = 'imported-plan';
		file.plan.heading = 'Imported plan';
		await importJson(page, file);
		await expect(page.getByTestId('plan-heading')).toHaveText('Imported plan');
		await expectView(page, 'test-list');
		await expect(page.getByTestId('fixture-task').first()).toBeVisible();
		expect((await storedViewer(page)).diagramView).toBe('test-list');
	});

	test('pin, height and legends stay the same across views @diagram-fixtures', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await openExample(page);
		await page.getByTestId('gantt-pin').click();
		await expect(page.getByTestId('gantt-pin')).toHaveAttribute('aria-pressed', 'true');
		await page.getByTestId('gantt-resize').press('PageUp');
		const saved = await storedViewer(page);
		const height = await settledPanelHeight(page);
		const legends = page.getByTestId('timeline-legends');
		await expect(legends).toBeVisible();
		const legendText = await legends.textContent();

		for (const id of ['test-board', 'test-list', 'gantt']) {
			await chooseView(page, id);
			await waitForAnimations(page.getByTestId('timeline-panel'));
			await expect(page.getByTestId('gantt-pin')).toHaveAttribute('aria-pressed', 'true');
			expect(await settledPanelHeight(page)).toBeCloseTo(height, 0);
			await expect(legends).toBeVisible();
			expect(await legends.textContent()).toBe(legendText);
			expect(await storedViewer(page)).toMatchObject({
				ganttHeight: saved.ganttHeight,
				ganttPinned: true,
				diagramView: id
			});
		}
	});

	test('Preview prints the selected diagrams in registry order with one page total @diagram-fixtures', async ({
		page
	}) => {
		await openExample(page);
		const preview = await openPreview(page);
		const group = preview.getByRole('group', { name: 'Diagrams to print' });
		await expect(group).toBeVisible();
		await expect(group.getByTestId('print-diagram-gantt')).toBeDisabled();
		await group.getByTestId('print-diagram-test-board').click();
		await group.getByTestId('print-diagram-test-list').click();
		await expect
			.poll(async () => diagramOrder(await sheetLayout(page)))
			.toEqual(['gantt', 'test-list-scene', 'test-board-scene']);
		expect(known((await storedViewer(page)).printDiagrams)).toEqual(KNOWN_VIEWS);

		const layout = await sheetLayout(page);
		for (const sheet of layout) {
			const board = sheet.fragments.includes('test-board-scene');
			expect(sheet.orientation).toBe(board ? 'landscape' : 'portrait');
		}
		const sheets = preview.getByTestId('sheet');
		const count = await sheets.count();
		await expect(sheets.getByTestId('page-number')).toHaveText(
			Array.from({ length: count }, (_, i) => `${i + 1} / ${count}`)
		);
		await expect(sheets.first()).toHaveAccessibleName(`Sheet 1 of ${count}`);

		// The PDF has one page for each sheet. The board pages are landscape A4.
		await page.emulateMedia({ media: 'print' });
		const pdf = (await page.pdf({ preferCSSPageSize: true })).toString('latin1');
		await page.emulateMedia({ media: 'screen' });
		const boxes = [...pdf.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(
			([, w, h]) => (Number(w) > Number(h) ? 'landscape' : 'portrait')
		);
		expect(boxes).toEqual(layout.map((sheet) => sheet.orientation));
	});

	test('Cmd/Ctrl+P prints the stored diagram selection @diagram-fixtures', async ({ page }) => {
		await openExample(page);
		const preview = await openPreview(page);
		await preview.getByTestId('print-diagram-test-board').click();
		await expect(preview.getByTestId('print-diagram-gantt')).toBeEnabled();
		await page.reload();
		await expect(page.getByTestId('plan-heading')).toBeVisible();
		await page.evaluate(() => {
			window.__printedDiagrams = [];
			window.print = () => {
				window.__printedDiagrams.push(
					[...document.querySelectorAll<HTMLElement>('[data-testid="sheet"]')].map((sheet) => ({
						orientation: sheet.dataset.orientation!,
						fragments: [...sheet.querySelectorAll<HTMLElement>('[data-fragment]')].map(
							(fragment) => fragment.dataset.fragment!
						)
					}))
				);
			};
		});
		await page.keyboard.press('ControlOrMeta+p');
		const printed = await page.evaluate(() => window.__printedDiagrams);
		expect(printed).toHaveLength(1);
		expect(diagramOrder(printed[0])).toEqual(['gantt', 'test-board-scene']);
		expect(printed[0].some((sheet) => sheet.orientation === 'landscape')).toBe(true);
	});

	test('focus moves to the same task id in the next view @diagram-fixtures', async ({ page }) => {
		await openExample(page);
		const bar = page.getByTestId('gantt-bar').first();
		const id = (await bar.getAttribute('data-route-target'))!;
		await bar.focus();
		// The switch keeps focus when a user clicks it. A programmatic click keeps focus on the task,
		// so the stage transfers it.
		const activate = (view: string) =>
			page
				.getByTestId(`diagram-view-${view}`)
				.evaluate((choice) => (choice as HTMLElement).click());
		const focusedTask = () =>
			page.evaluate(() => {
				const active = document.activeElement;
				return [
					active?.closest<HTMLElement>('[data-diagram-view]')?.dataset.diagramView,
					active?.getAttribute('data-diagram-task')
				];
			});
		const names: Record<string, string> = {
			'test-list': 'Test list view',
			'test-board': 'Test board view',
			gantt: 'Gantt view'
		};
		for (const view of ['test-list', 'test-board', 'gantt']) {
			await activate(view);
			await expect.poll(focusedTask).toEqual([view, id]);
			// Each settled change announces its view. Rapid changes back to the announced view do not.
			await expect(page.getByTestId('diagram-view-announcement')).toHaveText(names[view]);
		}
	});
});
