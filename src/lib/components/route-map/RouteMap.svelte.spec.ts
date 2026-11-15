import { GEOMETRY_MOTION_MS } from '#lib/motion.ts';
import '../../../routes/layout.css';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import { DIAGRAM_ATTR } from '#lib/components/diagram/view-contract.ts';
import { fablePlan, pinnedExamplePlan, screenMetrics } from '#lib/scene/route-map.test-helpers.ts';
import { formatRangeDisplay, joinList } from '#lib/domain/format.ts';
import { uiIntl } from '#lib/ui-language.ts';
import { routeMapModel } from '#lib/domain/route-map.ts';
import { routeMapPaper } from '#lib/scene/route-map-paper.ts';
import PrintRouteMap from './PrintRouteMap.svelte';
import { makeTask } from '#lib/domain/test-helpers.ts';
import { removeTasks } from '#lib/state/commands.ts';
import { EditingState } from '#lib/state/editing.svelte.ts';
import { ViewerState } from '#lib/state/viewer.svelte.ts';
import { MemoryStorage } from '#lib/state/memory-storage.ts';
import { Workspace } from '#lib/state/workspace.svelte.ts';
import RouteMapTest from './RouteMap.test.svelte';

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('#lib/motion.ts', async (original) => ({
	...(await original<typeof import('#lib/motion.ts')>()),
	motionDuration: (ms: number) => (motion.reduced ? 0 : ms)
}));

const pathPoints = (root: ParentNode, from: string, to: string) => {
	const wrapper = root.querySelector(
		`[data-testid="route-map-dependency"][data-from="${from}"][data-to="${to}"]`
	)!;
	const path = wrapper.matches('path')
		? wrapper
		: wrapper.querySelector('path[data-testid="gantt-dependency"], path[data-carrier-path]')!;
	const numbers = path
		.getAttribute('d')!
		.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!
		.map(Number);
	return Array.from({ length: numbers.length / 2 }, (_, i) => ({
		x: numbers[2 * i],
		y: numbers[2 * i + 1]
	}));
};

// Svelte runs all tweens in one module-level frame loop. A loop that an earlier test
// started on the real requestAnimationFrame never calls the stub. Let it finish first.
async function mockFrames() {
	await new Promise((resolve) => setTimeout(resolve, 2 * GEOMETRY_MOTION_MS));
	let now = 0,
		next = 0;
	const pending = new Map<number, FrameRequestCallback>();
	vi.spyOn(performance, 'now').mockImplementation(() => now);
	vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
		pending.set(++next, fn);
		return next;
	});
	vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id));
	return (at: number) => {
		now = at;
		const callbacks = [...pending.values()];
		pending.clear();
		for (const callback of callbacks) callback(at);
		flushSync();
	};
}

const fullTitle =
	'A complete parent title that must remain available after the visible two-line clamp';
const mark = (root: ParentNode, id: string) =>
	root.querySelector<HTMLButtonElement>(
		`button[data-route-target="${id}"][data-route-focus="keyboard"]`
	)!;
const label = (root: ParentNode, id: string) =>
	root.querySelector<HTMLElement>(`[${DIAGRAM_ATTR.label}="${id}"]`)!.closest('button')!;

/** Send the pointer sequence used by a touch tap, including the compatibility click. */
function tap(element: HTMLElement) {
	const rect = element.getBoundingClientRect();
	for (const type of ['pointerdown', 'pointerup', 'click']) {
		element.dispatchEvent(
			new PointerEvent(type, {
				bubbles: true,
				cancelable: true,
				pointerType: 'touch',
				pointerId: 11,
				isPrimary: true,
				clientX: rect.x + rect.width / 2,
				clientY: rect.y + rect.height / 2
			})
		);
	}
	flushSync();
}

describe('Route map station interactions', () => {
	let workspace: Workspace;
	let viewer: ViewerState;
	let editing: EditingState;
	beforeEach(() => {
		motion.reduced = false;
		workspace = new Workspace(new MemoryStorage());
		viewer = new ViewerState(new MemoryStorage());
		editing = new EditingState();
		workspace.commit((plan) => {
			plan.stages = [{ id: 's1', title: 'Prepare', description: '', color: 'blue' }];
			plan.tasks = [
				makeTask({ id: 'P', title: fullTitle }),
				...['a', 'b', 'c'].map((id) => makeTask({ id, parentId: 'P' })),
				makeTask({ id: 'standalone' }),
				makeTask({ id: 'untitled', title: '', status: 'canceled' })
			];
		});
		workspace.history.clear();
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});
	const mount = () => render(RouteMapTest, { workspace, viewer, editing });

	it('opens details from a station click and returns focus to the same stable station', async () => {
		const open = vi.spyOn(editing, 'openDetails');
		const screen = await mount();
		const station = mark(screen.container, 'P');
		await userEvent.click(station);
		expect(open).toHaveBeenCalledWith('P', station);
		await expect.element(screen.getByRole('dialog')).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => document.activeElement).toBe(station);
		expect(mark(screen.container, 'P')).toBe(station);
		expect(editing.flashId).toBeNull();
	});

	it('supports Enter and Space on the station and opens title taps through the station return target', async () => {
		const open = vi.spyOn(editing, 'openDetails');
		const screen = await mount();
		const station = mark(screen.container, 'standalone');
		for (const key of ['{Enter}', ' ']) {
			station.focus();
			await userEvent.keyboard(key);
			expect(open).toHaveBeenLastCalledWith('standalone', station);
			await userEvent.keyboard('{Escape}');
			await expect.poll(() => document.activeElement).toBe(station);
		}
		tap(label(screen.container, 'standalone'));
		expect(open).toHaveBeenLastCalledWith('standalone', station);
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => document.activeElement).toBe(station);
	});

	it('expands only with its named chevron and keeps plan data, history unchanged', async () => {
		const screen = await mount();
		const before = JSON.stringify(workspace.plan);
		const chevron = screen.getByRole('button', { name: `Show subtasks of ${fullTitle}` });
		await expect.element(chevron).toHaveAttribute('aria-expanded', 'false');
		await userEvent.click(chevron);
		await expect
			.element(screen.getByRole('button', { name: `Hide subtasks of ${fullTitle}` }))
			.toHaveAttribute('aria-expanded', 'true');
		const control = screen.container.querySelector<HTMLElement>(
			'[aria-expanded="true"][aria-controls]'
		)!;
		const controlled = document.getElementById(control.getAttribute('aria-controls')!);
		expect(controlled?.contains(mark(screen.container, 'a'))).toBe(true);
		expect(mark(screen.container, 'P')).not.toBeNull();
		expect(editing.detailsTaskId).toBeNull();
		expect(JSON.stringify(workspace.plan)).toBe(before);
		expect(workspace.history.canUndo).toBe(false);
		expect(screen.container.querySelector('[data-stage-progress]')).toBeNull();
		await userEvent.click(control);
		expect(mark(screen.container, 'a')).toBeNull();
		expect(screen.container.querySelector('[data-stage-progress]')).toBeNull();
	});

	it('toggles route focus by touch mark taps without opening details', async () => {
		const screen = await mount();
		const station = mark(screen.container, 'P');
		expect(station.hasAttribute('data-route-touch')).toBe(true);
		tap(station);
		expect(editing.routeId).toBe('P');
		expect(editing.detailsTaskId).toBeNull();
		tap(station);
		expect(editing.routeId).toBeNull();
		expect(editing.detailsTaskId).toBeNull();
	});

	it('projects a collapsed family route without lighting shortcuts or adding inherited connectors', async () => {
		workspace.commit((plan) => {
			plan.tasks = [
				makeTask({ id: 'up' }),
				makeTask({ id: 'P', dependsOn: ['up'] }),
				makeTask({ id: 'a', parentId: 'P' }),
				makeTask({ id: 'b', parentId: 'P', dependsOn: ['a'] }),
				makeTask({ id: 'down', dependsOn: ['a', 'up'] }),
				makeTask({ id: 'other' })
			];
		});
		const screen = await mount();
		await userEvent.tab();
		mark(screen.container, 'P').focus();
		flushSync();
		expect(editing.routeId).toBe('P');
		const lit = [
			...screen.container.querySelectorAll('[data-testid="route-map-dependency"][data-route="lit"]')
		]
			.map((e) => `${e.getAttribute('data-from')}->${e.getAttribute('data-to')}`)
			.sort();
		expect(lit).toEqual(['P->down', 'up->P']);
		expect(screen.container.querySelectorAll('[data-testid="route-map-dependency"]')).toHaveLength(
			3
		);
		const other = screen.container.querySelector(`[${DIAGRAM_ATTR.task}="other"]`)!;
		expect(other.getAttribute('data-route')).toBe('off');
		expect(getComputedStyle(label(screen.container, 'other')).opacity).toBe('1');
		expect(
			screen.container.querySelector('[data-testid="route-map-guide"] [data-route="lit"]')
		).toBeNull();
	});

	it('shares label and mark hover intent with warm switching and leave grace', async () => {
		const screen = await mount();
		const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
		await userEvent.hover(label(screen.container, 'P'));
		expect(editing.routeId).toBeNull();
		await pause(350);
		expect(editing.routeId).toBe('P');
		await userEvent.hover(mark(screen.container, 'P'));
		await pause(170);
		expect(editing.routeId).toBe('P');
		await userEvent.hover(label(screen.container, 'standalone'));
		await pause(170);
		expect(editing.routeId).toBe('standalone');
		await userEvent.hover(screen.getByTestId('diagram-view-route-map'));
		await pause(300);
		expect(editing.routeId).toBeNull();
	});

	it('retains full accessible names, untitled fallback and all current-frame geometry marks', async () => {
		viewer.setExpanded(workspace.plan.id, 'P', true);
		const screen = await mount();
		const station = mark(screen.container, 'P');
		await expect.element(station).toHaveAccessibleName(new RegExp(fullTitle));
		await expect.element(station).toHaveAccessibleName(/Prepare/);
		await expect.element(station).toHaveAccessibleName(/Todo/i);
		await expect
			.element(mark(screen.container, 'untitled'))
			.toHaveAccessibleName(/Untitled task.*Prepare.*Canceled/i);
		for (const id of ['P', 'a', 'b', 'c', 'standalone', 'untitled']) {
			for (const attr of [DIAGRAM_ATTR.task, DIAGRAM_ATTR.station, DIAGRAM_ATTR.label]) {
				expect(screen.container.querySelectorAll(`[${attr}="${id}"]`)).toHaveLength(1);
			}
		}
		expect(
			screen.container
				.querySelector(`[${DIAGRAM_ATTR.task}="a"]`)!
				.getAttribute(DIAGRAM_ATTR.parent)
		).toBe('P');
		expect(screen.container.querySelectorAll(`[${DIAGRAM_ATTR.scroller}]`)).toHaveLength(1);
		expect(screen.container.querySelector('[title]')).toBeNull();
	});

	it('shows the no-stage empty state instead of inventing task stations', async () => {
		workspace.commit((plan) => {
			plan.stages = [];
			plan.tasks = [];
		});
		const screen = await mount();
		await expect
			.element(screen.getByText('Add a stage to show the route map', { exact: true }))
			.toBeVisible();
		expect(screen.container.querySelector(`[${DIAGRAM_ATTR.station}]`)).toBeNull();
	});

	it('returns direct child focus to the visible parent when collapsed', async () => {
		viewer.setExpanded(workspace.plan.id, 'P', true);
		const screen = await mount();
		mark(screen.container, 'a').focus();
		flushSync(() => viewer.setExpanded(workspace.plan.id, 'P', false));
		await expect.poll(() => document.activeElement).toBe(mark(screen.container, 'P'));
		expect(mark(screen.container, 'a')).toBeNull();
	});

	it('uses a surviving parent after child deletion and the selected switch after family deletion', async () => {
		viewer.setExpanded(workspace.plan.id, 'P', true);
		const screen = await mount();
		mark(screen.container, 'a').focus();
		flushSync(() => removeTasks(workspace, ['a']));
		await expect.poll(() => document.activeElement).toBe(mark(screen.container, 'P'));
		flushSync(() => removeTasks(workspace, ['P']));
		await expect.element(screen.getByTestId('diagram-view-route-map')).toHaveFocus();
		expect(screen.container.querySelector('[data-route-target="a"]')).toBeNull();
		expect(editing.routeId).not.toBe('a');
	});

	it('shows the task title without adding visible punctuation', async () => {
		motion.reduced = true;
		const screen = await mount();
		expect(label(screen.container, 'P').textContent?.trim()).toBe(fullTitle);
	});

	it('uses sibling title and chevron controls below the parent with station → title → chevron Tab order', async () => {
		const screen = await mount();
		const station = mark(screen.container, 'P');
		const title = label(screen.container, 'P');
		const chevron = screen.container.querySelector<HTMLButtonElement>(
			'[aria-controls][aria-expanded="false"]'
		)!;
		expect(title.closest('[data-route-map-task]')).toBe(chevron.closest('[data-route-map-task]'));
		expect(chevron.closest('button button')).toBeNull();
		expect(title.parentElement!.matches('button,[role="button"]')).toBe(false);
		const titleBox = title.getBoundingClientRect();
		const controlBox = chevron.getBoundingClientRect();
		expect(titleBox.width).toBe(96);
		expect(controlBox.top).toBeGreaterThanOrEqual(titleBox.bottom);
		const group = title.closest('[data-route-map-task]')!;
		const count = [...group.querySelectorAll('span')].find((e) => e.textContent?.trim() === '3')!;
		const countBox = count.getBoundingClientRect();
		expect(countBox.top).toBeGreaterThanOrEqual(titleBox.bottom);
		expect(
			Math.abs((countBox.top + countBox.bottom) / 2 - (controlBox.top + controlBox.bottom) / 2)
		).toBeLessThanOrEqual(1);
		expect(
			(Math.min(countBox.left, controlBox.left) + Math.max(countBox.right, controlBox.right)) / 2
		).toBeCloseTo(titleBox.left + titleBox.width / 2, 0);
		const row = chevron.parentElement!;
		expect(row.getBoundingClientRect().height).toBe(24);
		await expect.element(title).toHaveAccessibleName(fullTitle);
		await expect.element(chevron).toHaveAccessibleName(`Show subtasks of ${fullTitle}`);
		station.focus();
		await userEvent.tab();
		await expect.element(title).toHaveFocus();
		await userEvent.tab();
		await expect.element(chevron).toHaveFocus();
		await userEvent.keyboard('{Enter}');
		expect(editing.detailsTaskId).toBeNull();
		expect(mark(screen.container, 'P')).toBe(station);
		await expect.element(chevron).toHaveAttribute('aria-expanded', 'true');
	});

	it('uses one neutral station glyph and places the selected status icon beside each task name', async () => {
		motion.reduced = true;
		const statuses = ['todo', 'in_progress', 'done', 'canceled'] as const;
		workspace.commit((plan) => {
			plan.tasks = statuses.map((status, i) =>
				makeTask({ id: `status-${i}`, title: `Task ${i}`, status })
			);
		});
		const screen = await mount(),
			root = screen.container;
		const glyphs = statuses.map((_, i) =>
			mark(root, `status-${i}`).querySelector('[data-route-map-station-glyph]')
		);
		expect(glyphs.every(Boolean)).toBe(true);
		const shapes = glyphs.map((glyph) =>
			[...glyph!.children].map((child) => child.outerHTML).join('')
		);
		expect(new Set(shapes).size).toBe(1);
		const icons = statuses.map((_, i) =>
			label(root, `status-${i}`).querySelector('[data-route-map-status] svg')
		);
		expect(icons.every(Boolean)).toBe(true);
		for (let i = 0; i < statuses.length; i++)
			expect(
				label(root, `status-${i}`)
					.querySelector('[data-route-map-status]')!
					.getAttribute('aria-label')
			).toBe(['Todo', 'In progress', 'Done', 'Canceled'][i]);
		expect(new Set(icons.map((icon) => icon!.innerHTML)).size).toBe(4);
		for (let i = 0; i < statuses.length; i++)
			await expect
				.element(mark(root, `status-${i}`))
				.toHaveAccessibleName(new RegExp(['Todo', 'In progress', 'Done', 'Canceled'][i], 'i'));
		expect(root.querySelector('button button')).toBeNull();
		const statusMark = label(root, 'status-2').querySelector<HTMLElement>(
			'[data-route-map-status]'
		)!;
		expect(statusMark.hasAttribute('tabindex')).toBe(false);
		await userEvent.hover(statusMark);
		await expect
			.poll(() => document.querySelector('[data-slot="tooltip-content"]')?.textContent ?? '')
			.toBe('Done');

		const model = routeMapModel(workspace.plan, new Set());
		const paper = routeMapPaper(model, {
			...screenMetrics,
			sheetWidth: 1200,
			sheetHeight: 900,
			margin: 24,
			repeatedLabelWidth: 0,
			gutter: 0,
			headerHeight: 36,
			footerHeight: 54,
			lineHeight: 16
		});
		const segment = {
			...paper.segment,
			data: { stages: workspace.plan.stages, nodes: model.nodes, panels: paper.panels }
		};
		const printed = await render(PrintRouteMap, {
			segment,
			from: 0,
			to: segment.items.length,
			first: true,
			width: 1100
		});
		const paperShapes = statuses.map((_, i) =>
			[
				...printed.container.querySelector(
					`[data-paper-station="status-${i}"] [data-route-map-station-glyph]`
				)!.children
			]
				.map((child) => child.outerHTML)
				.join('')
		);
		expect(new Set(paperShapes).size).toBe(1);
		expect(
			printed.container.querySelectorAll('.paper-label [data-route-map-status] svg')
		).toHaveLength(4);
	});

	it('shows dates on station hover and keyboard focus while the title hint stays title only', async () => {
		motion.reduced = true;
		workspace.commit((plan) => {
			plan.tasks = [
				makeTask({ id: 'dated', title: fullTitle, start: '2027-01-02', end: '2027-01-19' })
			];
		});
		const screen = await mount(),
			root = screen.container,
			station = mark(root, 'dated'),
			title = label(root, 'dated');
		const dates = formatRangeDisplay('2027-01-02', '2027-01-19', uiIntl());
		expect(title.textContent).not.toContain(dates);
		await userEvent.hover(station);
		await expect
			.poll(() => document.querySelector('[data-slot="tooltip-content"]')?.textContent ?? '')
			.toContain(dates);
		await userEvent.hover(title);
		await expect
			.poll(() => document.querySelector('[data-slot="tooltip-content"]')?.textContent ?? '')
			.toBe(fullTitle);
		title.focus();
		await userEvent.tab({ shift: true });
		await expect.element(station).toHaveFocus();
		await expect
			.poll(() => document.querySelector('[data-slot="tooltip-content"]')?.textContent ?? '')
			.toContain(dates);
		expect(root.querySelector('[title]')).toBeNull();
	});

	it('renders workflow lines and a distinct family branch', async () => {
		motion.reduced = true;
		workspace.commit((plan) => {
			plan.tasks = [
				makeTask({ id: 'p' }),
				makeTask({ id: 'a', parentId: 'p' }),
				makeTask({ id: 'b', parentId: 'p' }),
				makeTask({ id: 'independent' })
			];
		});
		viewer.setExpanded(workspace.plan.id, 'p', true);
		const screen = await mount(),
			root = screen.container;
		expect(root.querySelectorAll('[data-testid="route-map-dependency"]')).toHaveLength(0);
		expect(root.querySelectorAll('[data-route-map-joint-break]')).toHaveLength(0);
		const families = [...root.querySelectorAll<SVGElement>('[data-family-branch]')];
		expect(families.length).toBeGreaterThan(0);
		expect(
			root.querySelectorAll('[data-testid="route-map-guide"]:not([data-family-branch])').length
		).toBeGreaterThan(0);
		for (const branch of families) {
			expect(getComputedStyle(branch).strokeWidth).toBe('6px');
		}
		expect(root.querySelectorAll('[data-testid="route-map-stage-label"]')).toHaveLength(4);
		expect(root.querySelector('[data-stage-progress]')).toBeNull();
	});

	it('gives every station its own stage badge and cross-stage endpoints a capsule', async () => {
		motion.reduced = true;
		workspace.commit((plan) => {
			Object.assign(plan, fablePlan());
		});
		viewer.setExpanded(workspace.plan.id, 'soil', true);
		const screen = await mount(),
			root = screen.container;
		const model = routeMapModel(workspace.plan, new Set(['soil']));
		const labels = [...root.querySelectorAll<HTMLElement>('[data-testid="route-map-stage-label"]')];
		expect(labels).toHaveLength(model.nodes.length);
		for (const node of model.nodes) {
			const badge = labels.find((l) => l.dataset.host === node.id)!;
			expect(badge.dataset.stage).toBe(node.stageId);
			expect(badge.dataset.role).toBe('start');
			expect(badge.querySelector('[data-stage-progress]')).toBeNull();
			expect(badge.getBoundingClientRect().top).toBeGreaterThanOrEqual(
				label(root, node.id).getBoundingClientRect().bottom
			);
		}
		for (const id of ['soil', 'seeds', 'water', 'stall'])
			expect(
				root.querySelector(`[data-testid="route-map-interchange"][data-station="${id}"]`)
			).not.toBeNull();
		expect(root.querySelector('[data-carrier="lead-in"]')).toBeNull();
	});

	it('keeps family membership out of lit keys for the real example and independent children', async () => {
		motion.reduced = true;
		workspace.commit((plan) => Object.assign(plan, pinnedExamplePlan()));
		const screen = await mount();
		const root = screen.container;
		mark(root, 'task-5').focus();
		flushSync();
		expect(
			root.querySelector(
				'[data-testid="route-map-dependency"][data-from="task-5"][data-to="task-6"]'
			)
		).toBeNull();
		expect(root.querySelector('[data-overlay-for="task-5->task-6"]')).toBeNull();
		expect(mark(root, 'task-6').getAttribute('data-route')).toBe('off');
		const sowing = mark(root, 'task-5').getBoundingClientRect();
		const water = mark(root, 'task-6').getBoundingClientRect();
		expect(water.left).toBeGreaterThan(sowing.left);
		workspace.commit((plan) => {
			const stageId = plan.stages[0].id;
			plan.tasks = [
				makeTask({ id: 'P', stageId }),
				makeTask({ id: 'a', stageId, parentId: 'P', start: '2027-01-01' }),
				makeTask({ id: 'b', stageId, parentId: 'P', start: '2027-01-02' })
			];
		});
		viewer.setExpanded(workspace.plan.id, 'P', true);
		flushSync();
		mark(root, 'a').focus();
		flushSync();
		expect(root.querySelectorAll('[data-testid="route-map-dependency"]')).toHaveLength(0);
		expect(root.querySelectorAll('[data-overlay-for]')).toHaveLength(0);
		expect(mark(root, 'b').getAttribute('data-route')).toBe('off');
		expect(mark(root, 'b').getBoundingClientRect().left).toBeGreaterThan(
			mark(root, 'a').getBoundingClientRect().left
		);
	});

	it('retains imported walkway ids, one opaque off-route mix and undimmed capsule outlines', async () => {
		workspace.commit((plan) => Object.assign(plan, fablePlan()));
		viewer.setExpanded(workspace.plan.id, 'soil', true);
		const screen = await mount();
		const root = screen.container;
		const walkway = root.querySelector(
			'[data-testid="route-map-dependency"][data-from="soil"][data-to="water"]'
		)!;
		expect(walkway.querySelector('[data-testid="gantt-dependency"]')).not.toBeNull();
		const outlines = [
			...root.querySelectorAll<SVGElement>(
				'[data-testid="route-map-interchange"] [data-sign-outline]'
			)
		];
		expect(outlines).toHaveLength(4);
		const before = outlines.map((e) => getComputedStyle(e).stroke);
		mark(root, 'compost').focus();
		flushSync();
		await expect.poll(() => outlines.map((e) => getComputedStyle(e).stroke)).toEqual(before);
		for (const e of outlines) expect(getComputedStyle(e).opacity).toBe('1');
		const off = root.querySelector('[data-testid="gantt-dependency"][data-route="off"]')!;
		expect(off.getAttribute('stroke')).toContain('30%');
		expect(off.getAttribute('stroke')!.match(/color-mix/g)).toHaveLength(1);
		expect(getComputedStyle(off).opacity).toBe('1');
		expect(getComputedStyle(label(root, 'seeds')).opacity).toBe('1');
	});

	it('renders a fitting example panel as one item with complete dependencies and no continuation stubs', async () => {
		const plan = pinnedExamplePlan();
		const model = routeMapModel(plan, new Set());
		const paper = routeMapPaper(model, {
			...screenMetrics,
			clearance: 4,
			sheetWidth: (297 * 96) / 25.4,
			sheetHeight: (210 * 96) / 25.4,
			margin: 57,
			repeatedLabelWidth: 0,
			gutter: 0,
			headerHeight: 36,
			footerHeight: 54,
			lineHeight: 16
		});
		const segment = {
			...paper.segment,
			data: { stages: plan.stages, nodes: model.nodes, panels: paper.panels }
		};
		const printed = await render(PrintRouteMap, {
			segment,
			from: 0,
			to: segment.items.length,
			first: true,
			width: 1000
		});
		const root = printed.container;
		expect.soft(root.querySelectorAll('[data-item]')).toHaveLength(1);
		expect.soft(root.querySelectorAll('[data-continuation-station]')).toHaveLength(0);
		expect.soft(root.querySelectorAll('[data-continuation-stub]')).toHaveLength(0);
		for (const [from, to] of [
			['task-4', 'task-5'],
			['task-5', 'task-7']
		]) {
			const paths = root.querySelectorAll(
				`[data-carrier="walkway"][data-from="${from}"][data-to="${to}"] [data-carrier-path]`
			);
			expect.soft(paths, `${from} -> ${to} is drawn once`).toHaveLength(1);
			const route = paper.segment.items
				.flatMap((item) => item.edges)
				.find((edge) => edge.from === from && edge.to === to);
			expect.soft(route, 'The renderer receives a complete dependency').toBeDefined();
			if (route && paths.length === 1) {
				const path = paths[0] as SVGPathElement;
				const start = path.getPointAtLength(0),
					end = path.getPointAtLength(path.getTotalLength());
				expect(start.x).toBeCloseTo(route.points[0].x, 1);
				expect(start.y).toBeCloseTo(route.points[0].y, 1);
				expect(end.x).toBeCloseTo(route.points.at(-1)!.x, 1);
				expect(end.y).toBeCloseTo(route.points.at(-1)!.y, 1);
				const item = paths[0].closest('[data-item]')!;
				expect(item.querySelector(`[data-paper-station="${from}"]`)).not.toBeNull();
				expect(item.querySelector(`[data-paper-station="${to}"]`)).not.toBeNull();
			}
		}
	});

	it('puts a text space between the printed station reference and title', async () => {
		const plan = pinnedExamplePlan();
		const model = routeMapModel(plan, new Set());
		const paper = routeMapPaper(model, {
			...screenMetrics,
			sheetWidth: 1200,
			sheetHeight: 900,
			margin: 24,
			repeatedLabelWidth: 0,
			gutter: 0,
			headerHeight: 36,
			footerHeight: 54,
			lineHeight: 16
		});
		const segment = {
			...paper.segment,
			data: { stages: plan.stages, nodes: model.nodes, panels: paper.panels }
		};
		const printed = await render(PrintRouteMap, {
			segment,
			from: 0,
			to: segment.items.length,
			first: true,
			width: 1100
		});
		const station = printed.container.querySelector('[data-paper-station="task-0"]')!;
		const label = station.nextElementSibling!;
		expect(label.classList.contains('paper-label')).toBe(true);
		const reference = label.querySelector('small')!;
		expect(reference.nextElementSibling!.textContent?.replaceAll('\u00a0', ' ')).toBe(' ');
		expect(getComputedStyle(reference).marginRight).toBe('3px');
		const visibleTitle = [...label.childNodes]
			.filter((node) => node.nodeType === Node.TEXT_NODE)
			.map((node) => node.textContent?.trim())
			.filter(Boolean)
			.join(' ');
		expect(visibleTitle).toBe('Site survey');
		for (const paperLabel of printed.container.querySelectorAll<HTMLElement>('.paper-label')) {
			const firstBreak = paperLabel.querySelector('br')!;
			const children = [...paperLabel.childNodes];
			const firstRow = children.slice(0, children.indexOf(firstBreak));
			const bounds = firstRow.flatMap((node) => {
				if (node instanceof HTMLElement) return [node.getBoundingClientRect()];
				if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) return [];
				const range = document.createRange();
				range.selectNode(node);
				return [range.getBoundingClientRect()];
			});
			const box = paperLabel.getBoundingClientRect();
			for (const bound of bounds) {
				expect(bound.right).toBeLessThanOrEqual(box.right + 1);
				expect(bound.left).toBeGreaterThanOrEqual(box.left - 1);
			}
		}

		const soilStation = printed.container.querySelector('[data-paper-station="task-1"]')!;
		const soilLabel = soilStation.nextElementSibling!;
		const soilText = [...soilLabel.childNodes]
			.filter((node) => node.nodeType === Node.TEXT_NODE)
			.map((node) => node.textContent?.trim())
			.filter(Boolean);
		expect(soilText).toEqual(['Soil', 'preparation']);
	});

	it('prints paper status sizes and joins named continuation target lists in one marker per station and side', async () => {
		workspace.commit((plan) => {
			plan.stages = [
				{ id: 's1', title: 'Source', description: '', color: 'blue' },
				{ id: 's2', title: 'Target', description: '', color: 'green' }
			];
			plan.tasks = [
				makeTask({ id: 'P' }),
				makeTask({ id: 'child', parentId: 'P' }),
				...['a', 'b', 'c'].map((id) =>
					makeTask({ id, stageId: 's2', title: `Target ${id}`, dependsOn: ['P'] })
				)
			];
		});
		const model = routeMapModel(workspace.plan, new Set());
		const paper = routeMapPaper(model, {
			...screenMetrics,
			sheetWidth: 180,
			sheetHeight: 500,
			margin: 24,
			repeatedLabelWidth: 0,
			gutter: 0,
			headerHeight: 36,
			footerHeight: 54,
			lineHeight: 16
		});
		const segment = {
			...paper.segment,
			data: { stages: workspace.plan.stages, nodes: model.nodes, panels: paper.panels }
		};

		const screen = await render(PrintRouteMap, {
			segment,
			from: 0,
			to: segment.items.length,
			first: true,
			width: 1000
		});
		const root = screen.container;
		const source = root.querySelector('[data-paper-station="P"] [data-route-map-station-glyph]')!;
		expect(source.getAttribute('width')).toBe('6');
		const ordinary = root.querySelector('[data-paper-station="a"] [data-route-map-station-glyph]')!;
		expect(ordinary.getAttribute('width')).toBe('6');
		const exit = root.querySelector('[data-continuation-station="P"][data-direction="exit"]')!;
		expect(
			root.querySelectorAll('[data-continuation-station="P"][data-direction="exit"]')
		).toHaveLength(1);
		const refs = ['a', 'b', 'c'].map((id) => {
			const station = root.querySelector(`[data-paper-station="${id}"]`)!;
			return `${station.getAttribute('data-reference')} Target ${id}`;
		});
		expect(exit.textContent).toContain(joinList(refs, uiIntl()));
		for (const marker of root.querySelectorAll('[data-continuation-station]'))
			expect(marker.textContent).toMatch(/→/);
		const workflows = [...root.querySelectorAll('[data-relation="workflow"]')];
		expect(workflows.length).toBeGreaterThan(0);
		for (const marker of workflows) expect(marker.textContent).toContain('Workflow');
		expect(exit.textContent).not.toContain('Workflow');
	});

	it('retargets interrupted geometry from the current frame and keeps dependency ports on moving station centers', async () => {
		workspace.commit((plan) => {
			plan.tasks = [
				makeTask({ id: 'A', start: '2027-01-01' }),
				makeTask({ id: 'C', dependsOn: ['A'] })
			];
		});
		const frame = await mockFrames();
		try {
			const screen = await mount();
			const root = screen.container;
			frame(0);
			frame(300);
			const start = pathPoints(root, 'A', 'C');
			flushSync(() =>
				workspace.commit((plan) => {
					plan.tasks.push(makeTask({ id: 'obstacle' }));
					plan.tasks.find((t) => t.id === 'A')!.dependsOn = ['obstacle'];
				})
			);
			frame(300);
			frame(396);
			const midway = pathPoints(root, 'A', 'C');
			expect(midway).not.toEqual(start);
			flushSync(() =>
				workspace.commit((plan) => {
					plan.tasks.push(makeTask({ id: 'obstacle2' }));
					plan.tasks.find((t) => t.id === 'obstacle')!.dependsOn = ['obstacle2'];
				})
			);
			const retargeted = pathPoints(root, 'A', 'C');
			expect(retargeted).toEqual(midway);
			for (const at of [444, 492, 700]) {
				frame(at);
				const p = pathPoints(root, 'A', 'C');
				const svg = root.querySelector('[data-testid="route-map"] svg')!.getBoundingClientRect();
				for (const [id, point] of [
					['A', p[0]],
					['C', p.at(-1)!]
				] as const) {
					const box = mark(root, id).getBoundingClientRect();
					expect(point.x).toBeCloseTo(box.x + box.width / 2 - svg.x, 1);
					expect(point.y).toBeCloseTo(box.y + box.height / 2 - svg.y, 1);
				}
			}
		} finally {
			frame(2000);
			frame(3000);
		}
	});

	it('cross-fades carrier changes and settles reduced-motion geometry without interpolating point meanings', async () => {
		workspace.commit((plan) => {
			plan.stages.push({ id: 's2', title: 'Next', description: '', color: 'green' });
			plan.tasks = [makeTask({ id: 'A' }), makeTask({ id: 'target', dependsOn: ['A'] })];
		});
		const frame = await mockFrames();
		try {
			// Begin with settled geometry. Freeze new native animations at creation so
			// browser load cannot finish a fade before the test samples its midpoint.
			motion.reduced = true;
			const screen = await mount();
			frame(0);
			frame(300);
			motion.reduced = false;
			const selector = '[data-testid="route-map-dependency"][data-from="A"][data-to="target"]';
			const nativeAnimate = Element.prototype.animate;
			vi.spyOn(Element.prototype, 'animate').mockImplementation(function (
				this: Element,
				keyframes,
				options
			) {
				const animation = nativeAnimate.call(this, keyframes, options);
				if (this.matches(selector)) animation.pause();
				return animation;
			});
			expect(screen.container.querySelector(selector)!.getAttribute('data-carrier')).toBe('line');
			flushSync(() =>
				workspace.commit((plan) => {
					plan.tasks.find((t) => t.id === 'target')!.stageId = 's2';
				})
			);
			expect(
				[...screen.container.querySelectorAll(selector)]
					.map((e) => e.getAttribute('data-carrier'))
					.sort()
			).toEqual(['line', 'walkway']);
			frame(300);
			// Finish Svelte's delay placeholders, then wait for both paused fades.
			const routeAnimations = () =>
				screen.container
					.getAnimations({ subtree: true })
					.filter((a) => ((a.effect as KeyframeEffect).target as Element).matches(selector));
			const isFade = (animation: Animation) =>
				new Set((animation.effect as KeyframeEffect).getKeyframes().map((k) => k.opacity)).size > 1;
			await expect
				.poll(() => {
					const animations = routeAnimations();
					for (const animation of animations.filter((a) => !isFade(a))) animation.finish();
					return animations.filter(isFade).length;
				})
				.toBe(2);
			const animations = routeAnimations().filter(isFade);
			for (const animation of animations) {
				animation.pause();
				animation.currentTime = 80;
			}
			frame(380);
			const fading = [...screen.container.querySelectorAll<SVGElement>(selector)];
			expect(fading).toHaveLength(2);
			const visibleOpacity = (element: Element) => {
				let opacity = 1;
				for (let e: Element | null = element; e && e !== screen.container; e = e.parentElement)
					opacity *= Number(getComputedStyle(e).opacity);
				return opacity;
			};
			expect(fading.some((e) => visibleOpacity(e) > 0 && visibleOpacity(e) < 1)).toBe(true);
			for (const animation of animations) animation.finish();
			frame(700);
			await Promise.resolve();
			flushSync();
			await expect.poll(() => screen.container.querySelectorAll(selector).length).toBe(1);
			expect(screen.container.querySelector(selector)!.getAttribute('data-carrier')).toBe(
				'walkway'
			);
			motion.reduced = true;
			flushSync(() =>
				workspace.commit((plan) => {
					plan.tasks.find((t) => t.id === 'target')!.stageId = 's1';
				})
			);
			expect(screen.container.querySelectorAll(selector)).toHaveLength(1);
			expect(screen.container.querySelector(selector)!.getAttribute('data-carrier')).toBe('line');
			expect(pathPoints(screen.container, 'A', 'target').length).toBeGreaterThanOrEqual(2);
		} finally {
			frame(2000);
			frame(3000);
		}
	});

	it('keeps satisfied connector mixes, cycle warning/casing and Gantt line/status forms', async () => {
		workspace.commit((plan) => {
			plan.stages.push({ id: 's2', title: 'Next', description: '', color: 'green' });
			plan.tasks = [
				makeTask({ id: 'A', status: 'done' }),
				makeTask({ id: 'B', status: 'done', dependsOn: ['A'] }),
				makeTask({ id: 'C', status: 'canceled' }),
				makeTask({ id: 'X', stageId: 's2' }),
				makeTask({ id: 'Y', stageId: 's2', dependsOn: ['A'] }),
				makeTask({ id: 'cycle-a', stageId: 's2', status: 'done', dependsOn: ['cycle-b'] }),
				makeTask({ id: 'cycle-b', stageId: 's2', dependsOn: ['cycle-a'] })
			];
		});
		const screen = await mount();
		const root = screen.container;
		const satisfied = root.querySelector(
			'[data-testid="route-map-dependency"][data-from="A"][data-to="Y"] [data-testid="gantt-dependency"]'
		)!;
		expect(satisfied.getAttribute('stroke')).toContain('40%');
		const done = mark(root, 'A').querySelector('[data-route-map-station-glyph]')!;
		expect(done.querySelectorAll('circle,path').length).toBeGreaterThan(0);
		expect(label(root, 'A').querySelector('[data-route-map-status] svg')).not.toBeNull();
		const lines = [...root.querySelectorAll<SVGElement>('[data-testid="route-map-guide"]')];
		expect(lines.some((l) => l.getAttribute('stroke')?.includes('40%'))).toBe(true);
		const cycles = [
			...root.querySelectorAll<SVGElement>('[data-testid="gantt-dependency"][data-cycle="true"]')
		];
		expect(cycles).toHaveLength(2);
		for (const path of cycles) {
			expect(getComputedStyle(path).strokeWidth).toBe('2px');
			expect(getComputedStyle(path).strokeDasharray.replaceAll(',', '')).toBe('1px 4px');
			expect(getComputedStyle(path).strokeLinecap).toBe('round');
			const casing = path.previousElementSibling!;
			expect(getComputedStyle(casing).strokeWidth).toBe('4px');
			expect(casing.getAttribute('d')).toBe(path.getAttribute('d'));
		}
	});

	it('uses thin Gantt connector widths for legacy subtask walkways on screen and paper', async () => {
		workspace.commit((plan) => {
			plan.stages.push({ id: 's2', title: 'Next', description: '', color: 'green' });
			plan.tasks = [
				makeTask({ id: 'P' }),
				makeTask({ id: 'child', parentId: 'P', dependsOn: ['outside'] }),
				makeTask({ id: 'outside', stageId: 's2' })
			];
		});
		viewer.setExpanded(workspace.plan.id, 'P', true);
		const screen = await mount();
		const connector = screen.container.querySelector(
			'[data-testid="route-map-dependency"][data-from="outside"][data-to="child"] [data-testid="gantt-dependency"]'
		)!;
		expect(getComputedStyle(connector).strokeWidth).toBe('1.5px');
		const model = routeMapModel(workspace.plan, new Set(['P']));
		const paper = routeMapPaper(model, {
			...screenMetrics,
			sheetWidth: 1200,
			sheetHeight: 900,
			margin: 24,
			repeatedLabelWidth: 0,
			gutter: 0,
			headerHeight: 36,
			footerHeight: 54,
			lineHeight: 16
		});
		const segment = {
			...paper.segment,
			data: { stages: workspace.plan.stages, nodes: model.nodes, panels: paper.panels }
		};
		const printed = await render(PrintRouteMap, {
			segment,
			from: 0,
			to: segment.items.length,
			first: true,
			width: 1100
		});
		const child = printed.container.querySelector(
			'[data-paper-station="child"] [data-route-map-station-glyph]'
		)!;
		expect(child.getAttribute('width')).toBe('4');
		const thin = [
			...printed.container.querySelectorAll<SVGElement>(
				'[data-carrier="walkway"] [data-carrier-path]'
			)
		];
		expect(thin.length).toBeGreaterThan(0);
		for (const path of thin) expect(getComputedStyle(path).strokeWidth).toBe('0.75px');
	});

	// Shared PR #57 must merge before these close-time resolver cases can run.
	it.skip('returns an open child dialog to the parent after collapse (shared PR #57)', async () => {
		viewer.setExpanded(workspace.plan.id, 'P', true);
		const screen = await mount();
		await userEvent.click(mark(screen.container, 'a'));
		flushSync(() => viewer.setExpanded(workspace.plan.id, 'P', false));
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => document.activeElement).toBe(mark(screen.container, 'P'));
	});

	it.skip('resolves dialog return after child or family deletion (shared PR #57)', async () => {
		viewer.setExpanded(workspace.plan.id, 'P', true);
		const screen = await mount();
		await userEvent.click(mark(screen.container, 'a'));
		flushSync(() => removeTasks(workspace, ['a']));
		await expect.poll(() => document.activeElement).toBe(mark(screen.container, 'P'));
		await userEvent.click(mark(screen.container, 'b'));
		flushSync(() => removeTasks(workspace, ['P']));
		await expect.element(screen.getByTestId('diagram-view-route-map')).toHaveFocus();
	});
});
