import { createExamplePlan } from '#lib/domain/example.ts';
import { expect, test, type Page } from '@playwright/test';
import {
	focusPreviousControl,
	chooseView,
	chooseTheme,
	diagramStage,
	expectView,
	holdAnimationFrames,
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

const incoming = (page: Page, view = 'route-map') =>
	diagramStage(page).locator(`[data-diagram-view="${view}"]:not([inert])`);
const station = (page: Page, id: string) =>
	incoming(page).locator(`button[data-route-target="${id}"][data-route-focus="keyboard"]`);
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

test('workflow dates set order without proportional spacing', async ({ page }) => {
	await openRoutePlan(page);
	await writeStoredPlan(page, (plan) => {
		const base = plan.tasks[0];
		plan.tasks = [
			{
				...base,
				id: 'a',
				title: 'First',
				status: 'todo',
				dependsOn: [],
				start: '2027-01-01',
				end: null
			},
			{
				...base,
				id: 'b',
				title: 'Middle',
				status: 'todo',
				dependsOn: [],
				start: '2027-01-02',
				end: null
			},
			{
				...base,
				id: 'c',
				title: 'Last',
				status: 'todo',
				dependsOn: [],
				start: '2027-01-03',
				end: null
			}
		];
	});
	await chooseView(page, 'route-map');
	await page.evaluate(() => document.fonts.ready);
	await waitForAnimations(incoming(page));
	const geometry = () =>
		incoming(page).evaluate((root) =>
			[...root.querySelectorAll<HTMLElement>('[data-diagram-task]')]
				.map((e) => ({ id: e.dataset.diagramTask, left: e.style.left, top: e.style.top }))
				.sort((a, b) => a.id!.localeCompare(b.id!))
		);
	const before = await geometry();
	await expect(incoming(page).locator('[data-testid="route-map-guide"]')).toHaveCount(2);
	await expect(incoming(page).locator('[data-testid="route-map-dependency"]')).toHaveCount(0);
	await writeStoredPlan(page, (plan) => {
		plan.tasks.find((task: { id: string }) => task.id === 'b')!.start = '2030-01-01';
		plan.tasks.find((task: { id: string }) => task.id === 'c')!.start = '2039-12-31';
	});
	await expectView(page, 'route-map');
	await page.evaluate(() => document.fonts.ready);
	await waitForAnimations(incoming(page));
	expect(await geometry()).toEqual(before);
	await writeStoredPlan(page, (plan) => {
		plan.tasks.find((task: { id: string }) => task.id === 'c')!.start = '2026-01-01';
	});
	await expectView(page, 'route-map');
	await waitForAnimations(incoming(page));
	const reordered = await geometry();
	expect(parseFloat(reordered.find((item) => item.id === 'c')!.left)).toBeLessThan(
		parseFloat(reordered.find((item) => item.id === 'a')!.left)
	);
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
	await page.evaluate(() => document.fonts.ready);
	const controls = await incoming(page).evaluate((root) => {
		const title = root.querySelector('[data-diagram-label="parent"]')!.getBoundingClientRect();
		const chevron = root
			.querySelector('[aria-controls][aria-expanded="false"]')!
			.getBoundingClientRect();
		return { titleWidth: title.width, titleBottom: title.bottom, controlTop: chevron.top };
	});
	expect(controls.titleWidth).toBe(96);
	expect(controls.controlTop).toBeGreaterThanOrEqual(controls.titleBottom);
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
		await expect(paper(page).first()).toContainText('Route parent', { useInnerText: true });
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

test('workflow example preserves fork ranks and keeps one complete paper item on A4 and Letter', async ({
	page
}) => {
	await openRoutePlan(page);
	const fixture = createExamplePlan('2026-11-14');
	const stageIds = new Map(fixture.stages.map((stage, i) => [stage.id, `stage-${i}`]));
	const taskIds = new Map(fixture.tasks.map((task, i) => [task.id, `task-${i}`]));
	fixture.stages = fixture.stages.map((stage) => ({ ...stage, id: stageIds.get(stage.id)! }));
	fixture.tasks = fixture.tasks.map((task, i) => ({
		...task,
		id: taskIds.get(task.id)!,
		stageId: stageIds.get(task.stageId)!,
		parentId: task.parentId ? taskIds.get(task.parentId)! : null,
		dependsOn: task.dependsOn.map((id) => taskIds.get(id)!),
		note: task.note.replace(/@\[task:([^\]]+)\]/g, (_, id) => `@[task:${taskIds.get(id)!}]`),
		createdAt: new Date(Date.parse('2026-11-14T00:00:00.000Z') + i).toISOString()
	}));
	await writeStoredPlan(page, (plan) => Object.assign(plan, fixture, { id: plan.id }));
	await chooseView(page, 'route-map');
	await page.evaluate(() => document.fonts.ready);
	await waitForAnimations(incoming(page));
	const geometry = await incoming(page).evaluate((root) => {
		const marks = [...root.querySelectorAll<HTMLElement>('[data-diagram-task]')];
		const canvas = root
			.querySelector('[data-testid="route-map-scroller"] > div')!
			.getBoundingClientRect();
		const right = Math.max(
			...[
				...root.querySelectorAll<HTMLElement>(
					'[data-testid="route-map-terminus"],[data-testid="route-map-interchange"],[data-testid="route-map-stage-label"],[data-diagram-task],[data-diagram-label],[data-route-map-controls],svg path'
				)
			].map(
				(e) =>
					e.getBoundingClientRect().right -
					canvas.left +
					(e.matches('[data-diagram-task],[data-diagram-label],[data-route-map-controls]')
						? 4
						: e instanceof SVGPathElement
							? Math.max(4, parseFloat(getComputedStyle(e).strokeWidth) / 2)
							: 0)
			)
		);
		const maxColumn = Math.max(...marks.map((e) => Number(e.dataset.column)));
		return {
			columns: Object.fromEntries(
				marks.map((mark) => [mark.dataset.diagramTask, Number(mark.dataset.column)])
			),
			centers: Object.fromEntries(
				marks.map((mark) => [
					mark.dataset.diagramTask,
					{
						x: mark.getBoundingClientRect().left + mark.getBoundingClientRect().width / 2,
						y: mark.getBoundingClientRect().top + mark.getBoundingClientRect().height / 2
					}
				])
			),
			links: [
				['task-4', 'task-5'],
				['task-5', 'task-7']
			].map(([from, to]) => {
				const route = root.querySelector(
					`[data-testid="route-map-dependency"][data-from="${from}"][data-to="${to}"]`
				)!;
				const path = route.querySelector(
					'path[data-testid="gantt-dependency"],path[data-carrier-path]'
				)!;
				const bounds = path.getBoundingClientRect();
				return { from, to, top: bounds.top, bottom: bounds.bottom };
			}),

			carriers: [...root.querySelectorAll('[data-testid="route-map-dependency"]')]
				.map((e) => [
					e.getAttribute('data-from'),
					e.getAttribute('data-to'),
					e.getAttribute('data-carrier')
				])
				.sort(),
			width: canvas.width,
			columnsRight: (maxColumn + 1) * 112,
			right,
			labels: marks.map((mark) => {
				const label = root.querySelector(
					`[data-diagram-label="${mark.getAttribute('data-diagram-task')}"]`
				)!;
				return {
					bottom: mark.getBoundingClientRect().bottom,
					labelTop: label.getBoundingClientRect().top
				};
			})
		};
	});
	expect(geometry.columns).toEqual({
		'task-0': 0,
		'task-1': 1,
		'task-4': 1,
		'task-5': 2,
		'task-6': 3,
		'task-7': 3,
		'task-8': 4
	});
	expect(geometry.carriers).toEqual([
		['task-0', 'task-4', 'line'],
		['task-1', 'task-5', 'walkway'],
		['task-4', 'task-5', 'walkway'],
		['task-5', 'task-7', 'walkway']
	]);
	for (const link of geometry.links) {
		expect(link.top).toBeGreaterThanOrEqual(
			Math.min(geometry.centers[link.from].y, geometry.centers[link.to].y) - 1
		);
		expect(link.bottom).toBeLessThanOrEqual(
			Math.max(geometry.centers[link.from].y, geometry.centers[link.to].y) + 1
		);
	}

	expect(geometry.centers['task-6'].x).toBeGreaterThan(geometry.centers['task-5'].x);
	await expect(
		incoming(page).locator('[data-testid="route-map-interchange"][data-station="task-7"]')
	).toHaveCount(1);
	await expect(incoming(page).locator('[data-testid="route-map-stage-label"]')).toHaveCount(7);
	await expect(
		incoming(page).locator(
			'[data-stage-progress],[data-route-map-joint-break],[data-carrier="lead-in"]'
		)
	).toHaveCount(0);
	await focusPreviousControl(station(page, 'task-5'));
	await page.keyboard.press('Tab');
	await expect(station(page, 'task-5')).toBeFocused();
	await expect(station(page, 'task-6')).toHaveAttribute('data-route', 'off');
	await expect(incoming(page).locator('[data-overlay-for="task-5->task-6"]')).toHaveCount(0);
	expect(geometry.labels).toHaveLength(7);
	for (const item of geometry.labels) expect(item.labelTop).toBeGreaterThanOrEqual(item.bottom);
	const measuredAllowance = Math.max(0, geometry.right - geometry.columnsRight);
	// Pin the numerical allowance after the loaded-font renderer can be measured.
	expect(Number.isFinite(measuredAllowance)).toBe(true);
	expect(geometry.width).toBeLessThanOrEqual(geometry.columnsRight + measuredAllowance + 1);
	expect(geometry.width + 1).toBeGreaterThanOrEqual(geometry.right);
	const preview = await openPreview(page);
	await preview.getByTestId('print-diagram-route-map').click();
	await preview.getByTestId('print-diagram-gantt').click();
	for (const size of ['a4', 'letter']) {
		await page.getByTestId(`paper-${size}`).click();
		await expect(page.getByTestId('sheets')).toHaveAttribute('data-paper', size);
		await waitForAnimations(preview);
		await expect
			.poll(() =>
				paper(page)
					.locator('[data-panel-id]')
					.evaluateAll((items) => new Set(items.map((e) => e.getAttribute('data-panel-id'))).size)
			)
			.toBe(1);
		await expect(paper(page).locator('[data-item]')).toHaveCount(1);
		await expect(paper(page).locator('[data-paper-station]')).toHaveCount(7);
		await expect(paper(page).locator('[data-continuation-station]')).toHaveCount(0);
		await expect(paper(page).locator('[data-continuation-stub]')).toHaveCount(0);
		for (const [from, to] of [
			['task-4', 'task-5'],
			['task-5', 'task-7']
		]) {
			await expect(
				paper(page).locator(
					`[data-carrier="walkway"][data-from="${from}"][data-to="${to}"] [data-carrier-path]`
				)
			).toHaveCount(1);
		}
		const survey = paper(page).locator('[data-paper-station="task-0"]');
		const reference = await survey.getAttribute('data-reference');
		const surveyLabel = survey.locator('xpath=following-sibling::*[1]');
		await expect(surveyLabel.locator('small')).toHaveText(reference!);
		await expect(surveyLabel.locator('small')).toHaveCSS('margin-right', '3px');
		expect(
			await surveyLabel.evaluate((label) =>
				[...label.childNodes]
					.filter((node) => node.nodeType === Node.TEXT_NODE)
					.map((node) => node.textContent?.trim())
					.filter(Boolean)
					.join(' ')
			)
		).toBe('Site survey');
		const soil = paper(page).locator('[data-paper-station="task-1"] + .paper-label');
		expect(
			await soil.evaluate((label) =>
				[...label.childNodes]
					.filter((node) => node.nodeType === Node.TEXT_NODE || node.nodeName === 'BR')
					.map((node) => (node.nodeName === 'BR' ? '\n' : node.textContent))
					.join('')
					.trim()
					.split('\n')
			)
		).toEqual(['Soil', 'preparation']);
	}
	await expect(paper(page).locator('[data-testid="route-map-terminus"]').first()).toHaveAttribute(
		'width',
		'12'
	);
	await page.emulateMedia({ media: 'print' });
	try {
		await expect(paper(page).locator('[data-paper-station]')).toHaveCount(7);
		expect(
			await paper(page).evaluateAll((parts) =>
				parts.every((part) => part.scrollWidth <= part.clientWidth + 1)
			)
		).toBe(true);
	} finally {
		await page.emulateMedia({ media: 'screen' });
	}
});

test('D53 incoming connectors stay scoped during Gantt ↔ Route map layer coexistence', async ({
	page
}) => {
	await openRoutePlan(page);
	const identities = (view: string) =>
		incoming(page, view)
			.locator('[data-testid="gantt-dependency"]')
			.evaluateAll((paths) =>
				paths.map((p) => `${p.getAttribute('data-from')}->${p.getAttribute('data-to')}`).sort()
			);
	const gantt = await identities('gantt');
	await chooseView(page, 'route-map');
	const route = await identities('route-map');
	expect(route).toEqual(expect.arrayContaining(['cycle-a->cycle-b', 'cycle-b->cycle-a']));
	for (const [next, expected] of [
		['gantt', gantt],
		['route-map', route]
	] as const) {
		const frames = await holdAnimationFrames(page);
		try {
			await page
				.getByTestId(`diagram-view-${next}`)
				.evaluate((element) => (element as HTMLElement).click());
			const snapshot = await diagramStage(page).evaluate((stage, next) => {
				for (const animation of stage.getAnimations({ subtree: true })) animation.pause();
				const layers = [...stage.querySelectorAll('[data-diagram-layer]')];
				const active = stage.querySelector(`[data-diagram-view="${next}"]:not([inert])`)!;
				return {
					layers: layers.length,
					inert: layers.filter((l) => l.hasAttribute('inert')).length,
					ids: [...active.querySelectorAll('[data-testid="gantt-dependency"]')]
						.map((p) => `${p.getAttribute('data-from')}->${p.getAttribute('data-to')}`)
						.sort()
				};
			}, next);
			expect(snapshot.layers).toBe(2);
			expect(snapshot.inert).toBe(1);
			expect(snapshot.ids).toEqual(expected);
			expect(new Set(snapshot.ids).size).toBe(snapshot.ids.length);
		} finally {
			await diagramStage(page).evaluate((stage) => {
				for (const animation of stage.getAnimations({ subtree: true })) animation.play();
			});
			await frames.release();
		}
		await expectView(page, next);
	}
});

test('D53 paper continuations name all targets once per station and remain with endpoint fragments', async ({
	page
}) => {
	await openRoutePlan(page);
	await writeStoredPlan(page, (plan) => {
		const base = plan.tasks[0];
		const second = { ...plan.stages[0], id: 'second', title: 'Targets' };
		plan.stages.push(second);
		const fillers = Array.from({ length: 14 }, (_, i) => ({
			...base,
			id: `filler-${i}`,
			title: `Routing column ${i}`,
			dependsOn: [i ? `filler-${i - 1}` : 'source'],
			createdAt: new Date(Date.UTC(2027, 0, 1, 0, 0, i + 1)).toISOString()
		}));
		plan.tasks = [
			{ ...base, id: 'source', title: 'Source', dependsOn: [] },
			...fillers,
			...Array.from({ length: 12 }, (_, i) => ({
				...base,
				id: `target-${i}`,
				stageId: second.id,
				title: `Target ${i} with a long continuation title`,
				dependsOn: ['source', 'filler-13'],
				createdAt: new Date(Date.UTC(2027, 0, 1, 0, 1, i + 1)).toISOString()
			}))
		];
	});
	const preview = await openPreview(page);
	await preview.getByTestId('print-diagram-route-map').click();
	await preview.getByTestId('print-diagram-gantt').click();
	await waitForAnimations(preview);
	const markers = paper(page).locator(
		'[data-continuation-station="source"][data-direction="exit"]'
	);
	await expect(markers).toHaveCount(1);
	const text = await markers.innerText();
	for (let i = 0; i < 12; i++) expect(text).toContain(`Target ${i} with a long continuation title`);
	expect(text).toContain('→');
	const markerItem = markers.locator('xpath=ancestor::*[@data-item][1]');
	await expect(markerItem.locator('[data-continuation-stub]')).not.toHaveCount(0);
	const pairs = await paper(page)
		.locator('[data-continuation-pair]')
		.evaluateAll((stubs) =>
			stubs.map((e) => ({
				id: e.getAttribute('data-continuation-pair'),
				kind: e.getAttribute('data-direction')
			}))
		);
	for (const id of new Set(pairs.map((p) => p.id)))
		expect(
			pairs
				.filter((p) => p.id === id)
				.map((p) => p.kind)
				.sort()
		).toEqual(['entry', 'exit']);
});

test('D53 Fable signs and imported status paint survive dark and forced-color rendering', async ({
	page
}) => {
	await openRoutePlan(page);
	await writeStoredPlan(page, (plan) => {
		const base = plan.tasks[0];
		plan.stages = ['Prepare', 'Grow', 'Share'].map((title, i) => ({
			...plan.stages[0],
			id: `s${i + 1}`,
			title,
			color: ['green', 'amber', 'blue'][i]
		}));
		const station = (
			id: string,
			title: string,
			stageId: string,
			dependsOn: string[] = [],
			parentId: string | null = null,
			status = 'todo'
		) => ({ ...base, id, title, stageId, parentId, dependsOn, status, start: null, end: null });
		plan.tasks = [
			station('survey', 'Site survey', 's1', [], null, 'done'),
			station('soil', 'Soil preparation', 's1', ['survey']),
			station('test', 'Soil test', 's1', [], 'soil', 'done'),
			station('compost', 'Add compost', 's1', ['test'], 'soil', 'in_progress'),
			station('seeds', 'Order seeds', 's1', ['survey']),
			station('water', 'Watering rota', 's2', ['soil', 'seeds']),
			station('stall', 'Neighbourhood stall', 's3', ['water'])
		].map((task, i) => ({
			...task,
			createdAt: new Date(Date.UTC(2026, 10, 14, 0, 0, i)).toISOString(),
			start: `2026-11-${String(i + 1).padStart(2, '0')}`
		}));
	});
	await chooseView(page, 'route-map');
	await incoming(page)
		.getByRole('button', { name: 'Show subtasks of Soil preparation', exact: true })
		.click();
	await waitForAnimations(incoming(page));
	await expect(
		incoming(page).locator('[data-carrier="lead-in"][data-testid="route-map-dependency"]')
	).toHaveCount(0);
	await expect(
		incoming(page).locator('[data-carrier="walkway"][data-testid="route-map-dependency"]')
	).toHaveCount(3);
	await expect(
		incoming(page).locator('[data-testid="route-map-terminus"][data-station="survey"]')
	).toHaveCount(1);
	await expect(incoming(page).getByTestId('route-map-interchange')).toHaveCount(4);
	for (const sign of await incoming(page).getByTestId('route-map-terminus').all()) {
		await expect(sign).toHaveAttribute('width', '20');
		await expect(sign.locator('[data-sign-outline]')).toHaveCSS('stroke-width', '3px');
	}
	for (const sign of await incoming(page).getByTestId('route-map-interchange').all()) {
		const k = Number(await sign.getAttribute('data-slots'));
		await expect(sign).toHaveAttribute('width', '16');
		await expect(sign).toHaveAttribute('height', String(12 * k + 20));
		await expect(sign.locator('[data-sign-outline]')).toHaveCSS('stroke-width', '3px');
	}
	for (const theme of ['Light', 'Dark'] as const) {
		await chooseTheme(page, theme);
		await expect(
			incoming(page).locator('[data-diagram-label="survey"] [data-route-map-status] svg')
		).toHaveClass(/circle-check/);
		await expect(
			incoming(page).locator('[data-diagram-label="soil"] [data-route-map-status] svg')
		).toHaveClass(/contrast/);
		await expect(
			incoming(page).locator('[data-diagram-label="seeds"] [data-route-map-status] svg')
		).toHaveClass(/circle/);
	}
	await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
	await expect(
		incoming(page).locator('[data-diagram-label="soil"] [data-route-map-status] svg')
	).toHaveClass(/contrast/);
	await expect(
		incoming(page).locator('[data-testid="route-map-interchange"] [data-sign-outline]').first()
	).toHaveCSS('forced-color-adjust', 'none');
	await station(page, 'compost').press('Tab');
	const outlines = await incoming(page)
		.locator('[data-testid="route-map-interchange"] [data-sign-outline]')
		.evaluateAll((elements) => elements.map((e) => getComputedStyle(e).opacity));
	expect(outlines).toHaveLength(4);
	expect(outlines.every((opacity) => opacity === '1')).toBe(true);
});

test('Route map keeps offline stations, expansion and Preview after a production-worker reload', async ({
	page,
	context
}) => {
	await openRoutePlan(page);
	await chooseView(page, 'route-map');
	await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
	await expect
		.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
		.toBe(true);
	try {
		await context.setOffline(true);
		await page.reload();
		await expectView(page, 'route-map');
		await incoming(page)
			.getByRole('button', { name: 'Show subtasks of Route parent', exact: true })
			.click();
		await expect(station(page, 'child-a')).toBeVisible();
		await page.reload();
		await expectView(page, 'route-map');
		await expect(station(page, 'child-a')).toBeVisible();
		const preview = await openPreview(page);
		await preview.getByTestId('print-diagram-route-map').click();
		await preview.getByTestId('print-diagram-gantt').click();
		await expect(paper(page).first()).toContainText('Route child A', { useInnerText: true });
	} finally {
		await context.setOffline(false);
	}
});
