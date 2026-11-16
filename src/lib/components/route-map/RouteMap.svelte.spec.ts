import { GEOMETRY_MOTION_MS } from '#lib/motion.ts';
import '../../../routes/layout.css';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { DIAGRAM_ATTR } from '#lib/components/diagram/view-contract.ts';
import { fablePlan, pinnedExamplePlan, screenMetrics } from '#lib/scene/route-map.test-helpers.ts';
import { formatRangeDisplay, joinList } from '#lib/domain/format.ts';
import { uiIntl } from '#lib/ui-language.ts';
import { indexTasks } from '#lib/domain/derive.ts';
import { routeMapModel } from '#lib/domain/route-map.ts';
import { routeMapPaper } from '#lib/scene/route-map-paper.ts';
import PrintRouteMap from './PrintRouteMap.svelte';
import { makeTask } from '#lib/domain/test-helpers.ts';
import { removeTasks, updateTask } from '#lib/state/commands.ts';
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
		viewer = new ViewerState(new MemoryStorage(), ['gantt', 'route-map']);
		viewer.setDiagramView('route-map');
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
		expect(open).toHaveBeenCalledWith('P', station, expect.any(Function));
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
			expect(open).toHaveBeenLastCalledWith('standalone', station, expect.any(Function));
			await userEvent.keyboard('{Escape}');
			await expect.poll(() => document.activeElement).toBe(station);
		}
		tap(label(screen.container, 'standalone'));
		expect(open).toHaveBeenLastCalledWith('standalone', station, expect.any(Function));
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => document.activeElement).toBe(station);
	});

	it('expands only with its named chevron and keeps plan data, history unchanged', async () => {
		const screen = await mount();
		const before = JSON.stringify(workspace.plan);
		const chevron = screen.getByRole('button', { name: `Expand ${fullTitle}` });
		await expect.element(chevron).toHaveAttribute('aria-expanded', 'false');
		await userEvent.click(chevron);
		await expect
			.element(screen.getByRole('button', { name: `Collapse ${fullTitle}` }))
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

	it('projects collapsed family routes in both directions and keeps same-stage parent rails when expanded', async () => {
		workspace.commit((plan) => {
			plan.tasks = [
				makeTask({ id: 'up' }),
				makeTask({ id: 'P' }),
				makeTask({ id: 'a', parentId: 'P', dependsOn: ['up'] }),
				makeTask({ id: 'b', parentId: 'P', dependsOn: ['a'] }),
				makeTask({ id: 'down', dependsOn: ['b', 'up'] }),
				makeTask({ id: 'other' })
			];
		});
		const screen = await mount();
		await userEvent.tab();
		mark(screen.container, 'P').focus();
		flushSync();
		expect(editing.routeId).toBe('P');
		const litCollapsed = [
			...screen.container.querySelectorAll('[data-testid="route-map-dependency"][data-route="lit"]')
		]
			.map((e) => `${e.getAttribute('data-from')}->${e.getAttribute('data-to')}`)
			.sort();
		expect(litCollapsed).toEqual(['P->down', 'up->P']);
		const collapsedDeps = [
			...screen.container.querySelectorAll('[data-testid="route-map-dependency"]')
		];
		expect(collapsedDeps).toHaveLength(3);
		expect(collapsedDeps.every((e) => e.getAttribute('data-carrier') === 'line')).toBe(true);
		const other = screen.container.querySelector(`[${DIAGRAM_ATTR.task}="other"]`)!;
		expect(other.getAttribute('data-route')).toBe('off');
		expect(getComputedStyle(label(screen.container, 'other')).opacity).toBe('1');
		expect(
			screen.container.querySelector('[data-testid="route-map-guide"] [data-route="lit"]')
		).toBeNull();

		viewer.setExpanded(workspace.plan.id, 'P', true);
		flushSync();
		mark(screen.container, 'down').focus();
		flushSync();
		expect(editing.routeId).toBe('down');
		const expandedDeps = [
			...screen.container.querySelectorAll('[data-testid="route-map-dependency"]')
		];
		expect(expandedDeps).toHaveLength(4);
		expect(expandedDeps.every((e) => e.getAttribute('data-carrier') === 'line')).toBe(true);
		const litExpanded = [
			...screen.container.querySelectorAll('[data-testid="route-map-dependency"][data-route="lit"]')
		]
			.map((e) => `${e.getAttribute('data-from')}->${e.getAttribute('data-to')}`)
			.sort();
		expect(litExpanded).toEqual(['P->down', 'a->b', 'up->P', 'up->down']);
		for (const id of ['up', 'a', 'b', 'down'])
			expect(mark(screen.container, id).getAttribute('data-route')).toBe('lit');
		expect(mark(screen.container, 'P').getAttribute('data-route')).toBe('off');
		expect(mark(screen.container, 'other').getAttribute('data-route')).toBe('off');
	});

	const assertInheritedRouteState = (
		container: ParentNode,
		{
			owner,
			expectedDeps,
			litRails,
			litStations,
			offStations
		}: {
			owner: string;
			expectedDeps: string[];
			litRails: string[];
			litStations: string[];
			offStations: string[];
		}
	) => {
		expect(editing.routeId).toBe(owner);
		const deps = [...container.querySelectorAll('[data-testid="route-map-dependency"]')];
		expect(
			deps.map((e) => `${e.getAttribute('data-from')}->${e.getAttribute('data-to')}`).sort()
		).toEqual(expectedDeps);
		expect(deps.every((e) => e.getAttribute('data-carrier') === 'line')).toBe(true);
		expect(
			container.querySelector(
				'[data-testid="route-map-dependency"][data-from="external"][data-to="child"]'
			)
		).toBeNull();
		expect(
			container.querySelector(
				'[data-testid="route-map-guide"][data-route="lit"], [data-family-branch][data-route="lit"]'
			)
		).toBeNull();
		expect(
			deps
				.filter((e) => e.getAttribute('data-route') === 'lit')
				.map((e) => `${e.getAttribute('data-from')}->${e.getAttribute('data-to')}`)
				.sort()
		).toEqual(litRails);
		for (const dep of deps) {
			const key = `${dep.getAttribute('data-from')}->${dep.getAttribute('data-to')}`;
			expect(dep.getAttribute('data-route')).toBe(litRails.includes(key) ? 'lit' : 'off');
		}
		for (const id of litStations) {
			expect(mark(container, id).getAttribute('data-route')).toBe('lit');
		}
		for (const id of offStations) {
			expect(mark(container, id).getAttribute('data-route')).toBe('off');
		}
	};

	it('lights collapsed inherited route rails on tail and hidden-child dialog focus without borrowing external->parent when expanded', async () => {
		motion.reduced = true;
		const stageId = 's1';
		workspace.commit((plan) => {
			plan.tasks = [
				makeTask({ id: 'external', stageId }),
				makeTask({ id: 'parent', stageId, dependsOn: ['external'] }),
				makeTask({ id: 'child', stageId, parentId: 'parent' }),
				makeTask({ id: 'tail', stageId, dependsOn: ['child'] }),
				makeTask({ id: 'other', stageId })
			];
		});
		const screen = await mount();
		const expectedDeps = ['external->parent', 'parent->tail'];

		await userEvent.tab();
		mark(screen.container, 'tail').focus();
		flushSync();
		expect(mark(screen.container, 'child')).toBeNull();
		assertInheritedRouteState(screen.container, {
			owner: 'tail',
			expectedDeps,
			litRails: ['external->parent', 'parent->tail'],
			litStations: ['external', 'parent', 'tail'],
			offStations: ['other']
		});

		editing.openDetails('child', null);
		flushSync();
		await expect.element(page.getByTestId('task-dialog')).toBeVisible();
		expect(mark(screen.container, 'child')).toBeNull();
		assertInheritedRouteState(screen.container, {
			owner: 'child',
			expectedDeps,
			litRails: ['external->parent', 'parent->tail'],
			litStations: ['external', 'parent', 'tail'],
			offStations: ['other']
		});
		await userEvent.keyboard('{Escape}');
		await expect.element(page.getByTestId('task-dialog')).not.toBeInTheDocument();

		viewer.setExpanded(workspace.plan.id, 'parent', true);
		flushSync();
		await userEvent.tab();
		mark(screen.container, 'tail').focus();
		flushSync();
		assertInheritedRouteState(screen.container, {
			owner: 'tail',
			expectedDeps,
			litRails: ['parent->tail'],
			litStations: ['external', 'child', 'tail'],
			offStations: ['parent', 'other']
		});

		mark(screen.container, 'child').focus();
		flushSync();
		assertInheritedRouteState(screen.container, {
			owner: 'child',
			expectedDeps,
			litRails: ['parent->tail'],
			litStations: ['external', 'child', 'tail'],
			offStations: ['parent', 'other']
		});
	});

	it('lights the U9 sourceParent->parent rail for a collapsed inherited child route across all four family-expansion states', async () => {
		motion.reduced = true;
		const stageId = 's1';
		workspace.commit((plan) => {
			plan.tasks = [
				makeTask({ id: 'sourceParent', stageId }),
				makeTask({ id: 'external', stageId, parentId: 'sourceParent' }),
				makeTask({ id: 'parent', stageId, dependsOn: ['external'] }),
				makeTask({ id: 'child', stageId, parentId: 'parent' }),
				makeTask({ id: 'tail', stageId, dependsOn: ['child'] }),
				makeTask({ id: 'other', stageId })
			];
		});
		const expectedDeps = ['parent->tail', 'sourceParent->parent'];
		viewer.setExpanded(workspace.plan.id, 'sourceParent', true);
		const screen = await mount();

		// 1-2. sourceParent expanded only + tail keyboard focus
		await userEvent.tab();
		mark(screen.container, 'tail').focus();
		flushSync();
		expect(mark(screen.container, 'child')).toBeNull();
		assertInheritedRouteState(screen.container, {
			owner: 'tail',
			expectedDeps,
			litRails: ['parent->tail', 'sourceParent->parent'],
			litStations: ['external', 'parent', 'tail'],
			offStations: ['sourceParent', 'other']
		});

		// 3. sourceParent expanded only + hidden child dialog focus
		editing.openDetails('child', null);
		flushSync();
		await expect.element(page.getByTestId('task-dialog')).toBeVisible();
		expect(mark(screen.container, 'child')).toBeNull();
		assertInheritedRouteState(screen.container, {
			owner: 'child',
			expectedDeps,
			litRails: ['parent->tail', 'sourceParent->parent'],
			litStations: ['external', 'parent', 'tail'],
			offStations: ['sourceParent', 'other']
		});
		await userEvent.keyboard('{Escape}');
		await expect.element(page.getByTestId('task-dialog')).not.toBeInTheDocument();

		// 4a. Neither expanded + tail keyboard focus
		viewer.setExpanded(workspace.plan.id, 'sourceParent', false);
		flushSync();
		await userEvent.tab();
		mark(screen.container, 'tail').focus();
		flushSync();
		expect(mark(screen.container, 'external')).toBeNull();
		expect(mark(screen.container, 'child')).toBeNull();
		assertInheritedRouteState(screen.container, {
			owner: 'tail',
			expectedDeps,
			litRails: ['parent->tail', 'sourceParent->parent'],
			litStations: ['sourceParent', 'parent', 'tail'],
			offStations: ['other']
		});

		// 4b. Both expanded + tail keyboard focus
		viewer.setExpanded(workspace.plan.id, 'sourceParent', true);
		viewer.setExpanded(workspace.plan.id, 'parent', true);
		flushSync();
		await userEvent.tab();
		mark(screen.container, 'tail').focus();
		flushSync();
		assertInheritedRouteState(screen.container, {
			owner: 'tail',
			expectedDeps,
			litRails: ['parent->tail'],
			litStations: ['external', 'child', 'tail'],
			offStations: ['sourceParent', 'parent', 'other']
		});

		// 4c. parent expanded only + tail keyboard focus
		viewer.setExpanded(workspace.plan.id, 'sourceParent', false);
		flushSync();
		await userEvent.tab();
		mark(screen.container, 'tail').focus();
		flushSync();
		expect(mark(screen.container, 'external')).toBeNull();
		assertInheritedRouteState(screen.container, {
			owner: 'tail',
			expectedDeps,
			litRails: ['parent->tail'],
			litStations: ['sourceParent', 'child', 'tail'],
			offStations: ['parent', 'other']
		});
	});

	it('activates route focus from station and name hover targets and clears on leave', async () => {
		motion.reduced = true;
		workspace.commit((plan) => {
			plan.tasks = [
				makeTask({ id: 'P', title: 'Parent P' }),
				makeTask({ id: 'standalone', title: 'Standalone' })
			];
		});
		const screen = await mount();
		await document.fonts.ready;
		const labelP = label(screen.container, 'P');
		const markP = mark(screen.container, 'P');
		const labelStandalone = label(screen.container, 'standalone');
		const leaveTarget = screen.getByTestId('diagram-view-route-map');
		await expect.element(labelP).toBeVisible();
		await expect.element(markP).toBeVisible();
		await expect.element(labelStandalone).toBeVisible();
		await expect.element(leaveTarget).toBeVisible();

		await userEvent.hover(labelP);
		await expect.poll(() => editing.routeId).toBe('P');
		await userEvent.hover(labelStandalone);
		await expect.poll(() => editing.routeId).toBe('standalone');
		await userEvent.hover(markP);
		await expect.poll(() => editing.routeId).toBe('P');
		await userEvent.hover(leaveTarget);
		await expect.poll(() => editing.routeId).toBeNull();
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

	it('places sibling summary and expansion control below the name in station, name, control Tab order', async () => {
		motion.reduced = true;
		const screen = await mount();
		const station = mark(screen.container, 'P');
		const title = label(screen.container, 'P');
		const control = screen.getByRole('button', { name: `Expand ${fullTitle}` });
		await expect.element(control).toBeVisible();
		const button = screen.container.querySelector<HTMLButtonElement>(
			'[aria-expanded="false"][aria-controls]'
		)!;
		const group = title.closest('[data-route-map-task]')!;
		const summary = [...group.querySelectorAll<HTMLElement>('*')].find(
			(element) => element.textContent?.trim() === '3 ready' && element.children.length === 0
		);
		expect(summary).toBeDefined();
		expect(summary!.parentElement).toBe(button.parentElement);
		expect(button.closest('button button')).toBeNull();
		expect(title.closest('button button')).toBeNull();
		expect(summary!.getBoundingClientRect().top).toBeGreaterThanOrEqual(
			title.getBoundingClientRect().bottom
		);
		expect(button.getBoundingClientRect().top).toBeGreaterThanOrEqual(
			title.getBoundingClientRect().bottom
		);
		expect(group.textContent).not.toContain('›');
		expect(group.textContent).not.toMatch(/Subtasks:\s*\d+/);
		expect(screen.container.querySelector('[aria-label^="Show subtasks of "]')).toBeNull();
		expect(screen.container.querySelector('[aria-label^="Hide subtasks of "]')).toBeNull();
		station.focus();
		await userEvent.tab();
		await expect.element(title).toHaveFocus();
		await userEvent.tab();
		await expect.element(control).toHaveFocus();
	});

	it('uses one neutral station glyph and places the selected status icon beside each task name', async () => {
		motion.reduced = true;
		const statuses = ['todo', 'in_progress', 'done', 'canceled'] as const;
		workspace.commit((plan) => {
			plan.tasks = statuses.map((status, i) =>
				makeTask({ id: `status-${i}`, title: `Task ${i}`, status })
			);
		});
		workspace.commit((plan) => {
			plan.tasks.push(
				makeTask({ id: 'family', title: 'Family' }),
				makeTask({ id: 'child', title: 'Child', parentId: 'family', status: 'done' })
			);
		});
		viewer.setExpanded(workspace.plan.id, 'family', true);
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
		for (const id of ['status-0', 'status-1', 'status-2', 'status-3', 'child']) {
			const name = label(root, id);
			const icon = name.querySelector<SVGElement>('[data-route-map-status] svg');
			expect(icon).not.toBeNull();
			const box = icon!.getBoundingClientRect();
			expect(box.width).toBe(16);
			expect(box.height).toBe(16);
			const text = [...name.querySelectorAll<HTMLElement>('span')].find(
				(element) =>
					element.children.length === 0 &&
					element.textContent?.trim() === (id === 'child' ? 'Child' : `Task ${id.slice(-1)}`)
			);
			expect(text).toBeDefined();
			expect(box.left).toBeLessThan(text!.getBoundingClientRect().left);
		}

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

		const paperPlan = {
			...workspace.plan,
			tasks: workspace.plan.tasks.filter((task) => task.id.startsWith('status-'))
		};
		const model = routeMapModel(paperPlan, new Set(), indexTasks(paperPlan.tasks));
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

	it('shows the example family summaries and describes parents in both expansion states', async () => {
		motion.reduced = true;
		workspace.commit((plan) => Object.assign(plan, pinnedExamplePlan()));
		const screen = await mount();
		for (const expanded of [false, true]) {
			for (const [id, summary] of [
				['task-1', '1 in progress and 1 done'],
				['task-8', '1 ready and 1 blocked']
			] as const) {
				const controls = screen.container.querySelector<HTMLElement>(
					`[data-route-map-controls="${id}"]`
				)!;
				const visibleSummary = controls.querySelector<HTMLElement>('span')!;
				await expect.element(visibleSummary).toBeVisible();
				await expect.element(visibleSummary).toHaveTextContent(summary);
				await expect
					.element(mark(screen.container, id))
					.toHaveAccessibleDescription(new RegExp(summary));
			}
			if (!expanded) {
				viewer.setExpanded(workspace.plan.id, 'task-1', true);
				viewer.setExpanded(workspace.plan.id, 'task-8', true);
				flushSync();
			}
		}
	});

	it('keeps example station names within their text boxes in both expansion states', async () => {
		motion.reduced = true;
		const fixture = pinnedExamplePlan();
		workspace.commit((plan) => Object.assign(plan, fixture));
		const screen = await mount();
		await document.fonts.ready;
		for (const expanded of [false, true]) {
			const tasks = fixture.tasks.filter((task) => expanded || task.parentId === null);
			for (const task of tasks) {
				const name = label(screen.container, task.id);
				const title = [...name.querySelectorAll<HTMLElement>('span')].find(
					(element) => element.children.length === 0 && element.textContent === task.title
				);
				expect(title, task.title).toBeDefined();
				expect(title!.scrollWidth, task.title).toBeLessThanOrEqual(title!.clientWidth);
			}
			if (!expanded) {
				viewer.setExpanded(workspace.plan.id, 'task-1', true);
				viewer.setExpanded(workspace.plan.id, 'task-8', true);
				flushSync();
			}
		}
	});

	it('displays measured wrapped summary and badge geometry on the first frame', async () => {
		motion.reduced = false;
		workspace.commit((plan) => {
			plan.tasks = [
				makeTask({ id: 'P', title: 'Parent' }),
				makeTask({ id: 'a', parentId: 'P', status: 'in_progress' }),
				makeTask({ id: 'b', parentId: 'P', status: 'done' })
			];
		});
		await document.fonts.ready;
		const frame = await mockFrames();
		try {
			const screen = await mount();
			const controls = screen.container.querySelector<HTMLElement>(
				'[data-route-map-controls="P"]'
			)!;
			const title = label(screen.container, 'P');
			const badge = screen.container.querySelector<HTMLElement>(
				'[data-testid="route-map-stage-label"][data-stage="s1"]'
			)!;
			const boxes = () =>
				[controls, title, badge].map((element) => {
					const { x, y, width, height } = element.getBoundingClientRect();
					return [x, y, width, height];
				});
			frame(0);
			const first = boxes();
			expect(controls.textContent).toContain('1 in progress and 1 done');
			expect(first[0][3]).toBeGreaterThan(24);
			let time = 300;
			let previous: number[][] | undefined;
			let settled = first;
			await expect
				.poll(() => {
					frame(time);
					time += 300;
					settled = boxes();
					const stable =
						previous !== undefined &&
						settled.every((box, i) =>
							box.every((value, j) => Math.abs(value - previous![i][j]) < 0.01)
						);
					previous = settled;
					return stable;
				})
				.toBe(true);
			for (let i = 0; i < first.length; i++) {
				for (let j = 0; j < first[i].length; j++) {
					expect(Math.abs(first[i][j] - settled[i][j])).toBeLessThanOrEqual(1);
				}
			}
			expect(first[2][1]).toBeGreaterThanOrEqual(first[0][1] + first[0][3]);
		} finally {
			frame(10000);
			frame(11000);
		}
	});

	for (const lifecycle of ['empty replacement', 'plan switch'] as const) {
		it(`displays measured first-frame geometry after ${lifecycle}`, async () => {
			motion.reduced = false;
			const family = (prefix: string) => [
				makeTask({ id: `${prefix}-parent`, title: 'Parent' }),
				makeTask({ id: `${prefix}-a`, parentId: `${prefix}-parent`, status: 'in_progress' }),
				makeTask({ id: `${prefix}-b`, parentId: `${prefix}-parent`, status: 'done' })
			];
			workspace.commit((plan) => {
				plan.tasks = lifecycle === 'empty replacement' ? [] : family('old');
			});
			const firstPlanId = workspace.plan.id;
			let secondPlanId = '';
			if (lifecycle === 'plan switch') {
				workspace.createPlan();
				workspace.commit((plan) => {
					plan.stages = [{ id: 's1', title: 'Prepare', description: '', color: 'blue' }];
					plan.tasks = family('new');
				});
				secondPlanId = workspace.plan.id;
				workspace.switchTo(firstPlanId);
			}
			await document.fonts.ready;
			const frame = await mockFrames();
			try {
				const screen = await mount();
				frame(0);
				frame(300);
				flushSync(() => {
					if (lifecycle === 'plan switch') workspace.switchTo(secondPlanId);
					else
						workspace.commit((plan) => {
							plan.tasks = family('new');
						});
				});
				frame(300);
				const controls = screen.container.querySelector<HTMLElement>(
					'[data-route-map-controls="new-parent"]'
				)!;
				const title = label(screen.container, 'new-parent');
				const badge = screen.container.querySelector<HTMLElement>(
					'[data-testid="route-map-stage-label"][data-stage="s1"]'
				)!;
				const boxes = () =>
					[controls, title, badge].map((element) => {
						const { x, y, width, height } = element.getBoundingClientRect();
						return [x, y, width, height];
					});
				const first = boxes();
				expect(controls.textContent).toContain('1 in progress and 1 done');
				expect(first[0][3]).toBeGreaterThan(24);
				let previous: number[][] | undefined;
				let settled = first;
				let time = 600;
				await expect
					.poll(() => {
						frame(time);
						time += 300;
						settled = boxes();
						const stable =
							previous !== undefined &&
							settled.every((box, i) =>
								box.every((value, j) => Math.abs(value - previous![i][j]) < 0.01)
							);
						previous = settled;
						return stable;
					})
					.toBe(true);
				for (let i = 0; i < first.length; i++)
					for (let j = 0; j < first[i].length; j++)
						expect(Math.abs(first[i][j] - settled[i][j])).toBeLessThanOrEqual(1);
				expect(first[2][1]).toBeGreaterThanOrEqual(first[0][1] + first[0][3]);
			} finally {
				frame(10000);
				frame(11000);
			}
		});
	}

	it.each(['initial mount', 'plan switch'] as const)(
		'displays measured empty-stage geometry on first frame after %s',
		async (lifecycle) => {
			motion.reduced = false;
			const setFamily = () =>
				workspace.commit((plan) => {
					plan.stages = [
						{ id: 's1', title: 'Prepare', description: '', color: 'blue' },
						{ id: 'empty', title: 'Empty stage', description: '', color: 'green' }
					];
					plan.tasks = [
						makeTask({ id: 'parent', title: 'Parent' }),
						makeTask({ id: 'a', parentId: 'parent', status: 'in_progress' }),
						makeTask({ id: 'b', parentId: 'parent', status: 'done' })
					];
				});
			let targetPlanId = workspace.plan.id;
			if (lifecycle === 'plan switch') {
				const firstPlanId = workspace.plan.id;
				workspace.createPlan();
				setFamily();
				targetPlanId = workspace.plan.id;
				workspace.switchTo(firstPlanId);
			} else setFamily();
			await document.fonts.ready;
			const frame = await mockFrames();
			try {
				const screen = await mount();
				frame(0);
				let time = 300;
				if (lifecycle === 'plan switch') {
					frame(time);
					flushSync(() => workspace.switchTo(targetPlanId));
					frame(time);
					time += 300;
				}
				const controls = screen.container.querySelector<HTMLElement>(
					'[data-route-map-controls="parent"]'
				)!;
				expect(controls.textContent).toContain('1 in progress and 1 done');
				expect(controls.getBoundingClientRect().height).toBeGreaterThan(24);
				expect(viewer.isExpanded(workspace.plan.id, 'parent')).toBe(false);
				const badge = screen.container.querySelector<HTMLElement>(
					'[data-testid="route-map-stage-label"][data-stage="empty"]'
				);
				const placeholder = [
					...screen.container.querySelectorAll<SVGElement>('[data-route-map-station-glyph]')
				].find((glyph) => !glyph.closest('[data-diagram-task]'));
				expect(badge).not.toBeNull();
				expect(placeholder).toBeDefined();
				const boxes = () =>
					[badge!, placeholder!].map((element) => {
						const { x, y, width, height } = element.getBoundingClientRect();
						return [x, y, width, height];
					});
				const first = boxes();
				let previous: number[][] | undefined;
				let settled = first;
				await expect
					.poll(() => {
						frame(time);
						time += 300;
						settled = boxes();
						const stable =
							previous !== undefined &&
							settled.every((box, i) =>
								box.every((value, j) => Math.abs(value - previous![i][j]) < 0.01)
							);
						previous = settled;
						return stable;
					})
					.toBe(true);
				for (let i = 0; i < first.length; i++)
					for (let j = 0; j < first[i].length; j++)
						expect(Math.abs(first[i][j] - settled[i][j])).toBeLessThanOrEqual(1);
			} finally {
				frame(10000);
				frame(11000);
			}
		}
	);

	it('animates a later label-height change in an initialized scene', async () => {
		motion.reduced = false;
		workspace.commit((plan) => {
			plan.tasks = [makeTask({ id: 'P', title: 'Parent' })];
		});
		await document.fonts.ready;
		const frame = await mockFrames();
		try {
			const screen = await mount();
			frame(0);
			frame(300);
			const badge = screen.container.querySelector<HTMLElement>(
				'[data-testid="route-map-stage-label"][data-stage="s1"]'
			)!;
			const start = badge.getBoundingClientRect().top;
			flushSync(() => updateTask(workspace, 'P', { title: 'A longer parent title that wraps' }));
			const title = label(screen.container, 'P');
			await expect
				.poll(() => {
					const span = [...title.querySelectorAll<HTMLElement>('span')].find(
						(element) =>
							element.textContent === 'A longer parent title that wraps' && !element.children.length
					);
					return span?.getBoundingClientRect().height ?? 0;
				})
				.toBeGreaterThan(16);
			let time = 300;
			let midway = start;
			await expect
				.poll(() => {
					frame(time);
					time += 16;
					midway = badge.getBoundingClientRect().top;
					return midway;
				})
				.not.toBe(start);
			frame(time + 300);
			const end = badge.getBoundingClientRect().top;
			expect(midway).not.toBe(end);
		} finally {
			frame(2000);
			frame(3000);
		}
	});

	it('exposes a large named expansion control that owns the expanded child stations', async () => {
		motion.reduced = true;
		const screen = await mount();
		const control = screen.getByRole('button', { name: `Expand ${fullTitle}` });
		await expect.element(control).toHaveAttribute('aria-expanded', 'false');
		const button = screen.container.querySelector<HTMLButtonElement>(
			'[aria-expanded="false"][aria-controls]'
		)!;
		const box = button.getBoundingClientRect();
		expect(box.width).toBeGreaterThanOrEqual(24);
		expect(box.height).toBeGreaterThanOrEqual(24);
		await userEvent.click(control);
		await expect
			.element(screen.getByRole('button', { name: `Collapse ${fullTitle}` }))
			.toHaveAttribute('aria-expanded', 'true');
		const targetId = button.getAttribute('aria-controls');
		expect(targetId).toBeTruthy();
		const target = document.getElementById(targetId!);
		expect(target).not.toBeNull();
		expect(target!.contains(mark(screen.container, 'a'))).toBe(true);
	});

	it('describes readiness without rendering a ready light in the map layer', async () => {
		const screen = await mount();
		const layer = screen.container.querySelector('[data-diagram-view="route-map"]')!;
		expect(
			layer.querySelector(
				'[data-testid="ready-dot"], .ready-dot, [role="img"][aria-label^="Ready"]'
			)
		).toBeNull();
		await expect.element(mark(screen.container, 'standalone')).toHaveAccessibleDescription(/Ready/);
	});

	it('shows canceled child stations and includes them in the family summary', async () => {
		motion.reduced = true;
		workspace.commit((plan) => {
			plan.tasks.find((task) => task.id === 'a')!.status = 'canceled';
		});
		viewer.setExpanded(workspace.plan.id, 'P', true);
		const screen = await mount();
		expect(mark(screen.container, 'a')).not.toBeNull();
		expect(
			label(screen.container, 'a').querySelector('[data-route-map-status="canceled"]')
		).not.toBeNull();
		const controls = screen.container.querySelector<HTMLElement>('[data-route-map-controls="P"]')!;
		const visibleSummary = controls.querySelector<HTMLElement>('span')!;
		await expect.element(visibleSummary).toBeVisible();
		await expect.element(visibleSummary).toHaveTextContent('1 canceled');
	});

	it('owns the parent route on expansion-control keyboard focus without touch route toggling', async () => {
		motion.reduced = true;
		const screen = await mount();
		const title = label(screen.container, 'P');
		const station = mark(screen.container, 'P');
		const control = screen.getByRole('button', { name: `Expand ${fullTitle}` });
		title.focus();
		await userEvent.tab();
		await expect.element(control).toHaveFocus();
		await expect.poll(() => station.getAttribute('data-route')).toBe('lit');
		expect(editing.routeId).toBe('P');
		screen.container.querySelector<HTMLElement>('[data-testid="diagram-view-route-map"]')!.focus();
		await expect.poll(() => editing.routeId).toBeNull();
		expect(station.getAttribute('data-route')).not.toBe('lit');
		const button = screen.container.querySelector<HTMLButtonElement>(
			'[data-route-map-controls="P"] button'
		)!;
		tap(button);
		await expect
			.element(screen.getByRole('button', { name: `Collapse ${fullTitle}` }))
			.toHaveAttribute('aria-expanded', 'true');
		expect(editing.detailsTaskId).toBeNull();
		expect(editing.routeId).toBeNull();
		label(screen.container, 'P').focus();
		await userEvent.tab();
		await expect.poll(() => station.getAttribute('data-route')).toBe('lit');
		flushSync(() => removeTasks(workspace, ['a', 'b', 'c']));
		expect(screen.container.querySelector('[data-route-map-controls="P"] button')).toBeNull();
		await expect.poll(() => document.activeElement).toBe(station);
		await expect.poll(() => editing.routeId).toBe('P');
		await expect.poll(() => station.getAttribute('data-route')).toBe('lit');
		screen.container.querySelector<HTMLElement>('[data-testid="diagram-view-route-map"]')!.focus();
		await expect.poll(() => editing.routeId).toBeNull();
		await expect.poll(() => station.getAttribute('data-route')).not.toBe('lit');
	});

	it('keeps control focus after pointer and keyboard activation and shows keyboard focus', async () => {
		motion.reduced = true;
		const screen = await mount();
		const control = screen.getByRole('button', { name: `Expand ${fullTitle}` });
		await expect.element(control).toBeVisible();
		await userEvent.click(control);
		const expanded = screen.getByRole('button', { name: `Collapse ${fullTitle}` });
		await expect.element(expanded).toHaveFocus();
		await expect.element(expanded).toHaveAttribute('aria-expanded', 'true');
		await userEvent.keyboard('{Enter}');
		await expect.element(control).toHaveFocus();
		await expect.element(control).toHaveAttribute('aria-expanded', 'false');
		await userEvent.keyboard(' ');
		await expect.element(expanded).toHaveFocus();
		await expect.element(expanded).toHaveAttribute('aria-expanded', 'true');
		label(screen.container, 'P').focus();
		await userEvent.tab();
		await expect.element(expanded).toHaveFocus();
		const button = screen.container.querySelector<HTMLButtonElement>(
			'[aria-expanded="true"][aria-controls]'
		)!;
		expect(getComputedStyle(button).outlineStyle).not.toBe('none');
	});

	it('shows the shared status key below the map scroller', async () => {
		const screen = await mount();
		const list = screen.getByRole('list', { name: 'Status' });
		await expect.element(list).toBeVisible();
		const node = screen.container.querySelector<HTMLElement>('ul[aria-label="Status"]')!;
		expect([...node.querySelectorAll('li')].map((item) => item.textContent?.trim())).toEqual([
			'Todo',
			'In progress',
			'Done',
			'Canceled'
		]);
		expect(node.nextElementSibling?.textContent?.trim()).toBe(
			'Ready: all dependencies are finished. Blocked: a dependency is not finished.'
		);
		const scroller = screen.container.querySelector<HTMLElement>(
			'[data-testid="route-map-scroller"]'
		)!;
		expect(node.getBoundingClientRect().top).toBeGreaterThanOrEqual(
			scroller.getBoundingClientRect().bottom
		);
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
		expect(root.querySelectorAll('[data-testid="route-map-stage-label"]')).toHaveLength(1);
		expect(root.querySelector('[data-stage-progress]')).toBeNull();
	});

	it('places one badge at the first top-level station of each fable stage in both states', async () => {
		motion.reduced = true;
		workspace.commit((plan) => Object.assign(plan, fablePlan()));
		const screen = await mount(),
			root = screen.container;
		for (const expanded of [false, true]) {
			viewer.setExpanded(workspace.plan.id, 'soil', expanded);
			flushSync();
			const badges = [
				...root.querySelectorAll<HTMLElement>('[data-testid="route-map-stage-label"]')
			];
			expect(badges.map((badge) => badge.dataset.host).sort()).toEqual(
				['survey', 'water', 'stall'].sort()
			);
			for (const badge of badges) {
				expect(badge.getBoundingClientRect().top).toBeGreaterThanOrEqual(
					label(root, badge.dataset.host!).getBoundingClientRect().bottom
				);
			}
			for (const id of ['soil', 'seeds', 'water', 'stall'])
				expect(
					root.querySelector(`[data-testid="route-map-interchange"][data-station="${id}"]`)
				).not.toBeNull();
		}
	});

	it('renders one station size and equal empty child and top-level transfers', async () => {
		motion.reduced = true;
		const plan = fablePlan();
		plan.tasks.find((task) => task.id === 'water')!.dependsOn.push('test');
		workspace.commit((current) => Object.assign(current, plan));
		viewer.setExpanded(workspace.plan.id, 'soil', true);
		const root = (await mount()).container;
		const glyphs = [...root.querySelectorAll<SVGElement>('[data-route-map-station-glyph]')];
		expect(glyphs).toHaveLength(plan.tasks.length);
		for (const glyph of glyphs) {
			const box = glyph.getBoundingClientRect();
			expect([box.width, box.height]).toEqual([8, 8]);
			expect(glyph.querySelectorAll('circle')).toHaveLength(1);
			expect(glyph.querySelectorAll('path, line, rect, polygon, polyline')).toHaveLength(0);
			expect(glyph.querySelector('circle')!.getAttribute('fill')).toBe('var(--station-ground)');
		}
		expect(root.querySelector('[data-testid="route-map-terminus"]')).toBeNull();
		expect(root.querySelector('[data-dock-dot]')).toBeNull();
		for (const id of ['test', 'water']) {
			const box = root
				.querySelector(`[data-testid="route-map-interchange"][data-station="${id}"]`)!
				.getBoundingClientRect();
			expect([box.width, box.height]).toEqual([16, 32]);
		}
	});

	it('lists the map signs in order with hidden sample graphics', async () => {
		const root = (await mount()).container;
		const key = root.querySelector('ul[aria-label="Map signs"]')!;
		expect(key).not.toBeNull();
		expect([...key.querySelectorAll('li')].map((item) => item.textContent?.trim())).toEqual([
			'Stage journey',
			'Subtask route',
			'Station',
			'Transfer',
			'Cross-stage dependency',
			'Dependency cycle'
		]);
		const samples = [...key.querySelectorAll('li svg')];
		expect(samples).toHaveLength(6);
		for (const sample of samples) expect(sample.getAttribute('aria-hidden')).toBe('true');
	});

	it('shows a neutral placeholder and badge for an empty stage with its screen reader count', async () => {
		motion.reduced = true;
		workspace.commit((plan) => {
			plan.stages.push({ id: 'empty', title: 'Empty stage', description: '', color: 'green' });
			plan.tasks = [makeTask({ id: 'only', stageId: 's1' })];
		});
		const root = (await mount()).container;
		expect(root.querySelectorAll('[data-route-map-station-glyph]')).toHaveLength(2);
		expect(
			root.querySelectorAll('[data-testid="route-map-stage-label"][data-stage="empty"]')
		).toHaveLength(1);
		const count = [...root.querySelectorAll('.sr-only')].find((element) =>
			/Empty stage\s+0 to go/.test(element.textContent ?? '')
		);
		expect(count).toBeDefined();
		expect(root.querySelectorAll('[data-route-map-status]')).toHaveLength(1);
		const placeholder = [
			...root.querySelectorAll<SVGElement>('[data-route-map-station-glyph]')
		].find((glyph) => !glyph.closest('[data-diagram-task]'))!;
		expect(placeholder).toBeDefined();
		const probe = document.createElement('span');
		probe.style.color = 'var(--foreground)';
		root.appendChild(probe);
		expect(getComputedStyle(placeholder).color).toBe(getComputedStyle(probe).color);
		probe.remove();
	});

	it('prints a neutral ring and badge without a status icon for an empty stage', async () => {
		const plan = fablePlan();
		plan.stages = [plan.stages[0], { ...plan.stages[1], id: 'empty', title: 'Empty stage' }];
		plan.tasks = [plan.tasks[0]];
		const model = routeMapModel(plan, new Set(), indexTasks(plan.tasks));
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
		const root = printed.container;
		const glyphs = [...root.querySelectorAll<SVGElement>('[data-route-map-station-glyph]')];
		const placeholder = glyphs.find((glyph) => !glyph.closest('[data-paper-station]'))!;
		expect(glyphs).toHaveLength(2);
		expect(placeholder).toBeDefined();
		expect(placeholder.getBoundingClientRect().width).toBe(6);
		expect(placeholder.getBoundingClientRect().height).toBe(6);
		expect(placeholder.querySelectorAll('circle')).toHaveLength(1);
		const probe = document.createElement('span');
		probe.style.color = 'var(--color-paper-ink, #1A1D23)';
		root.appendChild(probe);
		expect(getComputedStyle(placeholder).color).toBe(getComputedStyle(probe).color);
		probe.remove();
		expect(
			root.querySelectorAll('[data-testid="route-map-stage-label"][data-stage="empty"]')
		).toHaveLength(1);
		expect(root.querySelectorAll('[data-route-map-status]')).toHaveLength(1);
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
		const model = routeMapModel(plan, new Set(), indexTasks(plan.tasks));
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
		const model = routeMapModel(plan, new Set(), indexTasks(plan.tasks));
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
		const model = routeMapModel(workspace.plan, new Set(), workspace.index);
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

	it('uses thin Gantt connector widths for cross-stage legacy subtask walkways on screen and paper', async () => {
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
		const model = routeMapModel(workspace.plan, new Set(['P']), workspace.index);
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
		expect(child.getAttribute('width')).toBe('6');
		const thin = [
			...printed.container.querySelectorAll<SVGElement>(
				'[data-carrier="walkway"] [data-carrier-path]'
			)
		];
		expect(thin.length).toBeGreaterThan(0);
		for (const path of thin) expect(getComputedStyle(path).strokeWidth).toBe('0.75px');
	});

	it('routes same-stage legacy external subtask dependencies as parent rails in both expand states', async () => {
		motion.reduced = true;
		workspace.commit((plan) => {
			plan.tasks = [
				makeTask({ id: 'P' }),
				makeTask({ id: 'sameStage' }),
				makeTask({ id: 'child', parentId: 'P', dependsOn: ['sameStage'] })
			];
		});
		const screen = await mount();
		expect(
			screen.container
				.querySelector('[data-testid="route-map-dependency"][data-from="sameStage"][data-to="P"]')
				?.getAttribute('data-carrier')
		).toBe('line');
		viewer.setExpanded(workspace.plan.id, 'P', true);
		flushSync();
		expect(
			screen.container
				.querySelector('[data-testid="route-map-dependency"][data-from="sameStage"][data-to="P"]')
				?.getAttribute('data-carrier')
		).toBe('line');
		expect(
			screen.container.querySelector(
				'[data-testid="route-map-dependency"][data-from="sameStage"][data-to="child"]'
			)
		).toBeNull();
	});

	it('lights the parent rail and exact stations in both directions on U9 and keeps exact descriptions in both expand states', async () => {
		motion.reduced = true;
		const fixture = pinnedExamplePlan();
		fixture.tasks.find((t) => t.id === 'task-4')!.dependsOn.push('task-2');
		workspace.commit((plan) => Object.assign(plan, fixture));
		const screen = await mount();
		expect(
			screen.container
				.querySelector('[data-testid="route-map-dependency"][data-from="task-1"][data-to="task-4"]')
				?.getAttribute('data-carrier')
		).toBe('line');
		await expect
			.element(mark(screen.container, 'task-4'))
			.toHaveAccessibleDescription(/Depends on Site survey and Soil test\./);
		await expect
			.element(mark(screen.container, 'task-4'))
			.toHaveAccessibleDescription(/Required by Sowing\./);

		viewer.setExpanded(workspace.plan.id, 'task-1', true);
		flushSync();
		const parentRail = screen.container.querySelector(
			'[data-testid="route-map-dependency"][data-from="task-1"][data-to="task-4"]'
		);
		expect(parentRail?.getAttribute('data-carrier')).toBe('line');
		expect(
			screen.container.querySelector(
				'[data-testid="route-map-dependency"][data-from="task-2"][data-to="task-4"]'
			)
		).toBeNull();

		const seedsStation = mark(screen.container, 'task-4');
		const testStation = mark(screen.container, 'task-2');
		await expect
			.element(seedsStation)
			.toHaveAccessibleDescription(/Depends on Site survey and Soil test\./);
		await expect.element(seedsStation).toHaveAccessibleDescription(/Required by Sowing\./);
		await expect.element(seedsStation).toHaveAccessibleDescription(/Ready\. Dependencies done: 2/);
		await expect
			.element(testStation)
			.toHaveAccessibleDescription(/Required by Add compost and Order seeds\./);
		await expect.element(testStation).toHaveAccessibleDescription(/Subtask of Soil preparation\./);
		const seedsDescBefore = seedsStation
			.closest('[data-route-map-task]')!
			.querySelector('.sr-only')?.textContent;
		const testDescBefore = testStation
			.closest('[data-route-map-task]')!
			.querySelector('.sr-only')?.textContent;

		await userEvent.tab();
		seedsStation.focus();
		flushSync();
		expect(editing.routeId).toBe('task-4');
		expect(parentRail?.getAttribute('data-route')).toBe('lit');
		expect(testStation.getAttribute('data-route')).toBe('lit');
		expect(mark(screen.container, 'task-1').getAttribute('data-route')).toBe('off');
		expect(
			seedsStation.closest('[data-route-map-task]')!.querySelector('.sr-only')?.textContent
		).toBe(seedsDescBefore);

		testStation.focus();
		flushSync();
		expect(editing.routeId).toBe('task-2');
		expect(parentRail?.getAttribute('data-route')).toBe('lit');
		expect(seedsStation.getAttribute('data-route')).toBe('lit');
		expect(mark(screen.container, 'task-1').getAttribute('data-route')).toBe('off');
		expect(
			testStation.closest('[data-route-map-task]')!.querySelector('.sr-only')?.textContent
		).toBe(testDescBefore);

		expect(workspace.index.state.get('task-4')!.readiness).toEqual({
			kind: 'ready',
			via: 'dependencies',
			count: 2
		});
		updateTask(workspace, 'task-2', { status: 'todo' });
		flushSync();
		expect(workspace.index.state.get('task-4')!.readiness.kind).not.toBe('ready');
		await expect.element(seedsStation).not.toHaveAccessibleDescription(/Ready/);
		workspace.undo();
		flushSync();
		expect(workspace.index.state.get('task-4')!.readiness).toEqual({
			kind: 'ready',
			via: 'dependencies',
			count: 2
		});
		await expect.element(seedsStation).toHaveAccessibleDescription(/Ready\. Dependencies done: 2/);
	});

	it('keeps exact predecessor and dependent descriptions across expand states, reverse external direction, and merged edges', async () => {
		motion.reduced = true;
		workspace.commit((plan) => {
			plan.tasks = [
				makeTask({ id: 'ext', title: 'External task' }),
				makeTask({ id: 'P', title: 'Parent P' }),
				makeTask({ id: 'c1', title: 'Child one', parentId: 'P', dependsOn: ['ext'] }),
				makeTask({ id: 'c2', title: 'Child two', parentId: 'P', dependsOn: ['ext'] }),
				makeTask({ id: 'down', title: 'Downstream task', dependsOn: ['c1', 'c2'] })
			];
		});
		const screen = await mount();
		const extStation = mark(screen.container, 'ext');
		const downStation = mark(screen.container, 'down');
		await expect
			.element(extStation)
			.toHaveAccessibleDescription(/Required by Child one and Child two\./);
		await expect
			.element(downStation)
			.toHaveAccessibleDescription(/Depends on Child one and Child two\./);
		const parentStation = mark(screen.container, 'P');
		await expect.element(parentStation).toHaveAccessibleDescription(/Depends on External task\./);
		await expect
			.element(parentStation)
			.toHaveAccessibleDescription(/Required by Downstream task\./);
		const parentDesc =
			parentStation.closest('[data-route-map-task]')!.querySelector('.sr-only')?.textContent ?? '';
		expect(parentDesc.match(/External task/g)).toHaveLength(1);
		expect(parentDesc.match(/Downstream task/g)).toHaveLength(1);

		viewer.setExpanded(workspace.plan.id, 'P', true);
		flushSync();
		await expect
			.element(extStation)
			.toHaveAccessibleDescription(/Required by Child one and Child two\./);
		await expect
			.element(downStation)
			.toHaveAccessibleDescription(/Depends on Child one and Child two\./);
		const childOne = mark(screen.container, 'c1');
		await expect.element(childOne).toHaveAccessibleDescription(/Depends on External task\./);
		await expect.element(childOne).toHaveAccessibleDescription(/Required by Downstream task\./);
		await expect.element(childOne).toHaveAccessibleDescription(/Subtask of Parent P\./);
		await expect
			.element(childOne)
			.toHaveAccessibleDescription(/A subtask can depend only on tasks with the same parent\./);
	});

	it('lights an aggregate parent rail for each represented stored pair independently while keeping unrelated siblings and synthetic rails off', async () => {
		motion.reduced = true;
		workspace.commit((plan) => {
			plan.tasks = [
				makeTask({ id: 'P', start: '2027-01-01' }),
				makeTask({ id: 'c1', parentId: 'P', start: '2027-01-01' }),
				makeTask({ id: 'c2', parentId: 'P', start: '2027-01-02' }),
				makeTask({ id: 'c3', parentId: 'P', start: '2027-01-03' }),
				makeTask({ id: 'Q', start: '2027-01-04' }),
				makeTask({ id: 'd1', parentId: 'Q', start: '2027-01-04', dependsOn: ['c1'] }),
				makeTask({ id: 'd2', parentId: 'Q', start: '2027-01-05', dependsOn: ['c2'] }),
				makeTask({ id: 'd3', parentId: 'Q', start: '2027-01-06' }),
				makeTask({ id: 'other', start: '2027-02-01' })
			];
		});
		viewer.setExpanded(workspace.plan.id, 'P', true);
		viewer.setExpanded(workspace.plan.id, 'Q', true);
		const screen = await mount();
		const rail = screen.container.querySelector(
			'[data-testid="route-map-dependency"][data-from="P"][data-to="Q"]'
		);
		expect(rail?.getAttribute('data-carrier')).toBe('line');

		await userEvent.tab();
		mark(screen.container, 'd1').focus();
		flushSync();
		expect(rail?.getAttribute('data-route')).toBe('lit');
		expect(mark(screen.container, 'c1').getAttribute('data-route')).toBe('lit');
		expect(mark(screen.container, 'd1').getAttribute('data-route')).toBe('lit');
		for (const offId of ['c2', 'c3', 'd2', 'd3', 'P', 'Q', 'other'])
			expect(mark(screen.container, offId).getAttribute('data-route')).toBe('off');
		expect(
			[
				...screen.container.querySelectorAll(
					'[data-testid="route-map-dependency"][data-route="lit"]'
				)
			].map((e) => `${e.getAttribute('data-from')}->${e.getAttribute('data-to')}`)
		).toEqual(['P->Q']);

		mark(screen.container, 'd2').focus();
		flushSync();
		expect(rail?.getAttribute('data-route')).toBe('lit');
		expect(mark(screen.container, 'c2').getAttribute('data-route')).toBe('lit');
		expect(mark(screen.container, 'd2').getAttribute('data-route')).toBe('lit');
		for (const offId of ['c1', 'c3', 'd1', 'd3', 'P', 'Q', 'other'])
			expect(mark(screen.container, offId).getAttribute('data-route')).toBe('off');
		expect(
			[
				...screen.container.querySelectorAll(
					'[data-testid="route-map-dependency"][data-route="lit"]'
				)
			].map((e) => `${e.getAttribute('data-from')}->${e.getAttribute('data-to')}`)
		).toEqual(['P->Q']);
	});

	it('returns an open child dialog to the parent after collapse', async () => {
		viewer.setExpanded(workspace.plan.id, 'P', true);
		const screen = await mount();
		await userEvent.click(mark(screen.container, 'a'));
		flushSync(() => viewer.setExpanded(workspace.plan.id, 'P', false));
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => document.activeElement).toBe(mark(screen.container, 'P'));
	});

	it('resolves dialog return after child or family deletion', async () => {
		viewer.setExpanded(workspace.plan.id, 'P', true);
		const screen = await mount();
		await userEvent.click(mark(screen.container, 'a'));
		flushSync(() => removeTasks(workspace, ['a']));
		await expect.poll(() => document.activeElement).toBe(mark(screen.container, 'P'));
		await userEvent.click(mark(screen.container, 'b'));
		flushSync(() => removeTasks(workspace, ['P']));
		await expect.element(screen.getByTestId('diagram-view-route-map')).toHaveFocus();
	});

	it('returns focus to the parent station when a subtask is deleted inside the task dialog', async () => {
		viewer.setExpanded(workspace.plan.id, 'P', true);
		const screen = await mount();
		await userEvent.click(mark(screen.container, 'a'));
		await expect.element(page.getByTestId('task-dialog')).toBeVisible();
		await userEvent.click(page.getByRole('button', { name: 'Delete…' }));
		await expect.element(page.getByRole('alertdialog')).toBeVisible();
		await userEvent.click(page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }));
		await expect.poll(() => document.activeElement).toBe(mark(screen.container, 'P'));
	});

	it('returns focus to the parent station when a focused subtask is removed through undo', async () => {
		viewer.setExpanded(workspace.plan.id, 'P', true);
		const screen = await mount();
		const added = makeTask({ id: 'undo-child', title: 'Undo child', parentId: 'P' });
		workspace.commit((plan) => {
			plan.tasks.push(added);
		});
		flushSync();
		await expect.poll(() => mark(screen.container, 'undo-child')).not.toBeNull();
		mark(screen.container, 'undo-child').focus();
		workspace.undo();
		flushSync();
		await expect.poll(() => document.activeElement).toBe(mark(screen.container, 'P'));
	});
});
