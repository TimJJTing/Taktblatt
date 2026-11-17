/**
 * Diagram views (ADR 20, docs/spec/diagram-views.md#513-diagram-views and docs/spec/print.md#7-preview-and-print).
 * Untagged tests check the normal production build. It has Gantt and the other real views, but no
 * fixture views. The tests do not assert the exact set, count or full order of the real views.
 * Tests tagged @diagram-fixtures need the build with TAKTBLATT_DIAGRAM_FIXTURES=1. That build adds
 * the test-only views `test-list` (portrait) and `test-board` (landscape).
 */
import { expect, test, type Page } from '@playwright/test';
import { SCHEMA_VERSION } from '#lib/domain/schema.ts';
import { done300 } from '#lib/scene/kanban-fixtures.test-helper.ts';
import {
	chooseView,
	diagramStage,
	expectPanelHeight,
	expectView,
	importJson,
	holdViewChange,
	MIN_CHART_HEIGHT,
	openApp,
	openExample,
	openPlans,
	openPreview,
	readDownload,
	settledPanelHeight,
	storedPlan,
	storedViewer,
	waitForAnimations,
	VIEW_MOTION_MS,
	workspaceContent,
	writeStoredPlan
} from './helpers.ts';

declare global {
	interface Window {
		__printedDiagrams: { orientation: string; fragments: string[] }[][];
		testAnnouncements: string[];
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
		await expect(diagramStage(page)).toHaveAttribute('data-view', 'gantt');
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
		// The default print selection is Gantt alone, so all sheets are portrait.
		expect(layout.every((sheet) => sheet.orientation === 'portrait')).toBe(true);
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

	test('focuses the Kanban switch choice when switching from a canceled top-level Gantt task', async ({
		page
	}) => {
		await openExample(page);
		await writeStoredPlan(page, (plan) => {
			const task = plan.tasks.find((item) => item.title === 'Site survey')!;
			task.status = 'canceled';
		});
		const canceledId = (await storedPlan(page)).tasks.find(
			(item) => item.title === 'Site survey'
		)!.id;
		const bar = page.locator(`[data-diagram-view="gantt"] [data-diagram-task="${canceledId}"]`);
		await bar.focus();
		await expect(bar).toBeFocused();
		// A programmatic click switches the view while focus stays on the Gantt task.
		await page
			.getByTestId('diagram-view-kanban')
			.evaluate((choice) => (choice as HTMLElement).click());
		await expectView(page, 'kanban');
		await expect(page.getByTestId('diagram-view-kanban')).toBeFocused();
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
		// Other real views are not selected by default, so the stored selection is exact.
		expect((await storedViewer(page)).printDiagrams).toEqual(KNOWN_VIEWS);

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

	test('with tabs, the view switch keeps the 24 pixel heading row @diagram-fixtures', async ({
		page
	}) => {
		// The width keeps all choices on one line. On a narrower screen the choices can wrap.
		await page.setViewportSize({ width: 800, height: 664 });
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await openExample(page);
		await expect(workspaceContent(page)).toHaveAttribute('data-layout', 'tabs');
		await expect(page.getByTestId('diagram-view-switch')).toBeVisible();
		await waitForAnimations(page.getByTestId('timeline-panel'));
		const layout = () =>
			page.getByTestId('timeline-panel').evaluate((panel, minimum) => {
				const header = document.querySelector('[data-app-header]')!.getBoundingClientRect();
				const heading = panel.querySelector('#timeline-title')!.parentElement!;
				const toggle = panel.querySelector('[data-testid="timeline-keep-open"]')!;
				const choices = panel.querySelector('[data-testid="diagram-view-switch"]')!;
				const chart = panel.querySelector('[data-testid="gantt-scroller"]')!;
				return {
					heading: Math.round(heading.getBoundingClientRect().height),
					switchFits: choices.getBoundingClientRect().height <= 24.5,
					gap: Math.round(toggle.getBoundingClientRect().top - header.bottom),
					chartMinimum: chart.getBoundingClientRect().height >= minimum - 1
				};
			}, MIN_CHART_HEIGHT);
		await expect
			.poll(layout)
			.toEqual({ heading: 24, switchFits: true, gap: 16, chartMinimum: true });
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

/** Read copy and real-cue boxes at the same paused frame. */
async function flightSnapshot(page: Page) {
	return diagramStage(page).evaluate((stage) => {
		const center = (element: Element) => {
			const r = element.getBoundingClientRect();
			return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
		};
		const layers = [...stage.querySelectorAll<HTMLElement>('[data-diagram-layer]')];
		const flight = stage.querySelector<HTMLElement>('[data-diagram-flight]');
		return {
			flight: !!flight,
			layers: layers.map((layer) => ({
				view: layer.dataset.diagramView,
				opacity: Number(getComputedStyle(layer).opacity)
			})),
			connectors: flight?.querySelectorAll('[data-testid="gantt-dependency"]').length ?? -1,
			copies: [...(flight?.querySelectorAll<HTMLElement>('[data-flight-copy]') ?? [])].map(
				(copy) => {
					const id = copy.dataset.flightCopy!;
					const cues = layers.map((layer) =>
						layer.querySelector<HTMLElement>(`[data-diagram-station="${CSS.escape(id)}"]`)
					);
					return {
						id,
						copy: center(copy),
						cues: cues.map(
							(cue) => cue && { center: center(cue), visibility: getComputedStyle(cue).visibility }
						)
					};
				}
			)
		};
	});
}

function expectCenters(a: { x: number; y: number }, b: { x: number; y: number }, tolerance = 1) {
	expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(tolerance);
	expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(tolerance);
}

async function prepareMotionPlan(page: Page) {
	await openExample(page);
	await writeStoredPlan(page, (plan) => {
		const template = plan.tasks.find((task) => task.parentId === null)!;
		plan.range = { start: '2027-01-01', end: '2027-02-01' };
		plan.tasks = Array.from({ length: 48 }, (_, index) => ({
			...template,
			id: `motion-${index}`,
			title: `Motion task ${index}`,
			stageId: plan.stages[Math.floor(index / 16)].id,
			parentId: null,
			status: 'todo' as const,
			start: '2027-01-02',
			end: '2027-01-04',
			dependsOn: [],
			createdAt: new Date(Date.UTC(2027, 0, 1, 0, 0, index)).toISOString()
		}));
	});
}

test('real views carry station cues across view changes and clean up', async ({ page }) => {
	await page.setViewportSize({ width: 900, height: 700 });
	await prepareMotionPlan(page);
	const taskId = 'motion-47';
	for (const [from, to] of [
		['gantt', 'route-map'],
		['route-map', 'kanban'],
		['kanban', 'gantt'],
		['gantt', 'kanban'],
		['kanban', 'route-map'],
		['route-map', 'gantt']
	] as const) {
		await expectView(page, from);
		const outgoingLabel = diagramStage(page).locator(
			`[data-diagram-view="${from}"] [data-diagram-label="${taskId}"]`
		);
		await outgoingLabel.focus();
		await expect(outgoingLabel).toBeFocused();
		const outgoingScrolled = await diagramStage(page)
			.locator(`[data-diagram-view="${from}"] [data-diagram-scroller]`)
			.evaluateAll((scrollers) => {
				for (const node of scrollers) {
					if (node.scrollTop === 0) node.scrollTop = 50;
					if (node.scrollLeft === 0) node.scrollLeft = 50;
				}
				return scrollers.some((node) => node.scrollTop > 0 || node.scrollLeft > 0);
			});
		expect(outgoingScrolled).toBe(true);
		const held = await holdViewChange(page, to, 0);
		let endCenters: { id: string; copy: { x: number; y: number } }[];
		try {
			await held.seek(0);
			let snapshot = await flightSnapshot(page);
			expect(snapshot.flight).toBe(true);
			expect(snapshot.copies.length).toBeGreaterThan(0);
			const outgoing = snapshot.layers.findIndex((layer) => layer.view === from);
			const incoming = snapshot.layers.findIndex((layer) => layer.view === to);
			const incomingScrolled = await diagramStage(page)
				.locator(`[data-diagram-view="${to}"] [data-diagram-scroller]`)
				.evaluateAll((scrollers) =>
					scrollers.some((node) => node.scrollTop > 0 || node.scrollLeft > 0)
				);
			expect(incomingScrolled).toBe(true);
			const outgoingCopies = snapshot.copies.filter((item) => item.cues[outgoing]);
			expect(outgoingCopies.length).toBeGreaterThan(0);
			for (const item of outgoingCopies) expectCenters(item.copy, item.cues[outgoing]!.center);
			await held.seek(1);
			snapshot = await flightSnapshot(page);
			const incomingCopies = snapshot.copies.filter((item) => item.cues[incoming]);
			expect(incomingCopies.length).toBeGreaterThan(0);
			expect(incomingCopies.length).toBe(snapshot.copies.length);
			for (const item of incomingCopies) expectCenters(item.copy, item.cues[incoming]!.center);
			endCenters = incomingCopies.map(({ id, copy }) => ({ id, copy }));
			await held.seek(0.5);
			snapshot = await flightSnapshot(page);
			expect(snapshot.layers.every((layer) => layer.opacity === 0)).toBe(true);
			expect(snapshot.connectors).toBe(0);
			for (const item of snapshot.copies)
				for (const cue of item.cues) if (cue) expect(cue.visibility).toBe('hidden');
		} finally {
			await held.release();
		}
		await expect(diagramStage(page).locator('[data-flight-copy]')).toHaveCount(0);
		await waitForAnimations(diagramStage(page));
		const settledCues = await diagramStage(page).evaluate(
			(stage, { to, ids }) => {
				const layer = stage.querySelector(`[data-diagram-view="${to}"]`)!;
				return ids.map((id) => {
					const station = layer.querySelector(`[data-diagram-station="${CSS.escape(id)}"]`);
					if (!station) return null;
					const rect = station.getBoundingClientRect();
					return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
				});
			},
			{ to, ids: endCenters.map(({ id }) => id) }
		);
		for (const [index, { copy }] of endCenters.entries()) {
			expect(
				settledCues[index],
				`${from} → ${to}: ${endCenters[index].id} has a station`
			).not.toBeNull();
			expectCenters(copy, settledCues[index]!);
		}
		expect(
			await diagramStage(page)
				.locator('[data-diagram-station], [data-diagram-label]')
				.evaluateAll((nodes) =>
					nodes.some((node) => getComputedStyle(node).visibility === 'hidden')
				)
		).toBe(false);
	}
});

test('Kanban flight endpoints match the settled stations while board frames run', async ({
	page
}) => {
	await page.setViewportSize({ width: 900, height: 700 });
	await prepareMotionPlan(page);
	for (const from of ['route-map', 'gantt']) {
		await chooseView(page, from);
		await waitForAnimations(diagramStage(page));
		const label = diagramStage(page).locator(
			`[data-diagram-view="${from}"] [data-diagram-label="motion-47"]`
		);
		await label.focus();
		await expect(label).toBeFocused();
		const held = await holdViewChange(page, 'kanban', 1, { holdFrames: false });
		let ends: { id: string; x: number; y: number; animations: number }[];
		try {
			ends = await page.evaluate((duration) => {
				for (const animation of document.getAnimations()) {
					animation.pause();
					animation.currentTime = duration;
				}
				return [
					...document.querySelectorAll<HTMLElement>('[data-diagram-flight] [data-flight-copy]')
				].map((copy) => {
					const rect = copy.getBoundingClientRect();
					return {
						id: copy.dataset.flightCopy!,
						x: rect.left + rect.width / 2,
						y: rect.top + rect.height / 2,
						animations: copy.getAnimations().length
					};
				});
			}, VIEW_MOTION_MS);
		} finally {
			await held.release();
		}
		expect(ends.length, `${from} → kanban has flight copies`).toBeGreaterThan(0);
		expect(
			ends.some((copy) => copy.id === 'motion-47'),
			`${from} → kanban carries the focused task`
		).toBe(true);
		expect(ends.every((copy) => copy.animations > 0)).toBe(true);
		await expect(diagramStage(page).locator('[data-diagram-layer]')).toHaveCount(1);
		await expect(diagramStage(page).locator('[data-diagram-flight] > *')).toHaveCount(0);
		await waitForAnimations(diagramStage(page));
		const stations = await diagramStage(page).evaluate(
			(stage, ids) =>
				ids.map((id) => {
					const station = stage.querySelector(
						`[data-diagram-view="kanban"] [data-diagram-station="${CSS.escape(id)}"]`
					);
					if (!station) return null;
					const rect = station.getBoundingClientRect();
					return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
				}),
			ends.map(({ id }) => id)
		);
		for (const [index, copy] of ends.entries()) {
			expect(stations[index], `${from} → kanban: ${copy.id} has a station`).not.toBeNull();
			expectCenters(copy, stations[index]!);
		}
	}
});

test('interrupted flight continues from its copies and announces the final view', async ({
	page
}) => {
	await openExample(page);
	await page.evaluate(() => {
		const region = document.querySelector('[data-testid="diagram-view-announcement"]')!;
		window.testAnnouncements = [];
		new MutationObserver(() => {
			const text = region.textContent?.trim();
			if (text) window.testAnnouncements.push(text);
		}).observe(region, { childList: true, characterData: true, subtree: true });
	});
	const held = await holdViewChange(page, 'route-map', 0.5);
	try {
		const before = await held.switchTo('kanban', 0, 0.5);
		expect(before.length).toBeGreaterThan(0);
		await held.seek(0);
		const after = await flightSnapshot(page);
		for (const item of after.copies) {
			const previous = before.find((copy) => copy.id === item.id);
			if (previous) expectCenters(item.copy, previous, 2);
		}
		expect(after.copies.length).toBeGreaterThan(0);
	} finally {
		await held.release();
	}
	await expect(page.getByTestId('diagram-view-announcement')).toHaveText('Kanban view');
	expect(await page.evaluate(() => window.testAnnouncements)).toEqual(['Kanban view']);
	await expect(diagramStage(page).locator('[data-flight-copy]')).toHaveCount(0);
});

test('reduced motion switches without a flight copy', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await openExample(page);
	const result = await page.getByTestId('diagram-view-route-map').evaluate(async (choice) => {
		(choice as HTMLElement).click();
		await new Promise(requestAnimationFrame);
		const stage = document.querySelector('[data-testid="diagram-stage"]')!;
		return {
			flight: stage.querySelectorAll('[data-diagram-flight]').length,
			copies: stage.querySelectorAll('[data-flight-copy]').length,
			layers: stage.querySelectorAll('[data-diagram-layer]').length,
			animations: stage
				.getAnimations({ subtree: true })
				.filter((animation) => Number(animation.effect?.getComputedTiming().duration) > 1).length
		};
	});
	expect(result).toEqual({ flight: 1, copies: 0, layers: 1, animations: 0 });
});

test('a label-only Gantt task retains focus while its label is the cue', async ({ page }) => {
	await openExample(page);
	await writeStoredPlan(page, (plan) => {
		const task = plan.tasks.find((item) => item.title === 'Site survey')!;
		task.start = null;
		task.end = null;
	});
	const id = (await storedPlan(page)).tasks.find((item) => item.title === 'Site survey')!.id;
	await chooseView(page, 'route-map');
	await diagramStage(page)
		.locator(`[data-diagram-view="route-map"] [data-diagram-task="${id}"]`)
		.focus();
	const held = await holdViewChange(page, 'gantt', 0);
	try {
		const copy = diagramStage(page).locator(`[data-flight-copy="${id}"]`);
		await expect(copy).toHaveCount(1);
		const source = diagramStage(page).locator(
			`[data-diagram-view="route-map"] [data-diagram-station="${id}"]`
		);
		await held.seek(0);
		const sourceBox = await source.boundingBox();
		await held.seek(0);
		const initialBox = await copy.boundingBox();
		expect(sourceBox).not.toBeNull();
		expect(initialBox).not.toBeNull();
		expectCenters(initialBox!, {
			x: sourceBox!.x + sourceBox!.width / 2,
			y: sourceBox!.y + sourceBox!.height / 2
		});
		await held.seek(0.5);
		const label = diagramStage(page).locator(
			`[data-diagram-view="gantt"] [data-diagram-label="${id}"]`
		);
		await expect(label).toBeFocused();
		await held.seek(1);
		const copyBox = await copy.boundingBox();
		await held.seek(1);
		const labelBox = await label.boundingBox();
		expect(copyBox).not.toBeNull();
		expect(labelBox).not.toBeNull();
		expectCenters(copyBox!, labelBox!);
	} finally {
		await held.release();
	}
	await expect(
		diagramStage(page).locator(`[data-diagram-view="gantt"] [data-diagram-label="${id}"]`)
	).toBeFocused();
});

test('connectors fade for compatible and incompatible fixture routers @diagram-fixtures', async ({
	page
}) => {
	await openExample(page);
	let previous = 'gantt';
	for (const view of ['test-list', 'gantt', 'test-board', 'gantt']) {
		const held = await holdViewChange(page, view, 0.5);
		try {
			const snapshot = await diagramStage(page).evaluate((stage) => {
				const effective = (element: Element) => {
					let opacity = 1;
					for (
						let node: Element | null = element;
						node && node !== stage;
						node = node.parentElement
					)
						opacity *= Number(getComputedStyle(node).opacity);
					return opacity;
				};
				const flight = stage.querySelector('[data-diagram-flight]');
				return {
					flight: !!flight,
					copies: flight?.querySelectorAll('[data-flight-copy]').length ?? 0,
					connectors: flight?.querySelectorAll('[data-testid="gantt-dependency"]').length ?? -1,
					opacity: [...stage.querySelectorAll('[data-testid="gantt-dependency"]')].map(effective)
				};
			});
			expect(snapshot.flight).toBe(true);
			expect(snapshot.copies).toBeGreaterThan(0);
			expect(snapshot.connectors).toBe(0);
			expect(
				snapshot.opacity.every((value) => value === 0),
				`${previous} → ${view}: connector opacities ${JSON.stringify(snapshot.opacity)}`
			).toBe(true);
		} finally {
			await held.release();
		}
		previous = view;
	}
});

test('culls offstage cues on the 300-card Done board', async ({ page }) => {
	await page.setViewportSize({ width: 1000, height: 700 });
	const plan = done300();
	for (const task of plan.tasks) {
		task.start = '2027-01-02';
		task.end = '2027-01-04';
	}
	await openApp(page);
	await importJson(page, { schemaVersion: SCHEMA_VERSION, kind: 'plan', plan });
	await chooseView(page, 'kanban');
	await expect(
		diagramStage(page).locator('[data-diagram-view="kanban"] [data-diagram-task]')
	).toHaveCount(300);
	const held = await holdViewChange(page, 'gantt', 0.5);
	try {
		const flight = diagramStage(page).locator('[data-diagram-flight]');
		await expect(flight).toHaveCount(1);
		const count = await flight.locator('[data-flight-copy]').count();
		expect(count).toBeGreaterThan(0);
		expect(count).toBeLessThan(300);
	} finally {
		await held.release();
	}
});
