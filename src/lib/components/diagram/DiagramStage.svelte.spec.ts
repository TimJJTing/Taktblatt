import '../../../routes/layout.css';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, tick } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { userEvent, page } from 'vitest/browser';
import { view as routeMapView } from '#lib/components/route-map/diagram-view.ts';
import { view as ganttView } from '#lib/components/timeline/diagram-view.ts';
import { makePlan, makeTask } from '#lib/domain/test-helpers.ts';
import { getLocale, overwriteGetLocale } from '#lib/paraglide/runtime.js';
import { EditingState } from '#lib/state/editing.svelte.ts';
import { MemoryStorage } from '#lib/state/memory-storage.ts';
import { PlanStorage } from '#lib/state/storage.ts';
import { ViewerState } from '#lib/state/viewer.svelte.ts';
import { Workspace } from '#lib/state/workspace.svelte.ts';
import StageTest from './DiagramStage.test.svelte';
import { fixtureView } from './fixture-views.test-helper.ts';
import { createViewRegistry, type ViewRegistry } from './view-registry.ts';

const motion = vi.hoisted(() => ({ reduced: false, duration: null as number | null }));
vi.mock('#lib/motion.ts', async (original) => ({
	...(await original<typeof import('#lib/motion.ts')>()),
	motionDuration: (ms: number) => (motion.reduced ? 0 : (motion.duration ?? ms))
}));

const listView = fixtureView('test-list', { order: 15, label: 'Test list' });
const rowView = fixtureView('test-row', { order: 25, label: 'Test row', layout: 'row' });
const partialView = fixtureView('test-partial', { order: 35, label: 'Test partial', omit: ['b'] });
const parentOnlyView = fixtureView('test-parent-only', {
	order: 45,
	label: 'Parent only',
	omitSubtasks: true
});
const scrollView = fixtureView('test-scroll', {
	order: 55,
	label: 'Test scroll',
	layout: 'row',
	scroll: { height: 100, width: 140, paddingTop: 20, paddingLeft: 16 }
});

const originalLocale = getLocale;

let ws: Workspace;
beforeEach(() => {
	ws = new Workspace(new MemoryStorage());
	ws.commit((plan) => {
		const stageId = plan.stages[0].id;
		plan.range = { start: '2027-01-01', end: '2027-01-31' };
		plan.tasks = [
			makeTask({ id: 'a', title: 'Alpha', stageId, start: '2027-01-02', end: '2027-01-08' }),
			makeTask({ id: 'b', title: 'Beta', stageId, start: '2027-01-10', end: '2027-01-16' }),
			makeTask({ id: 'c', title: 'Gamma', stageId, start: '2027-01-18', end: '2027-01-28' })
		];
	});
});
afterEach(() => {
	motion.reduced = false;
	motion.duration = null;
	vi.useRealTimers();
	overwriteGetLocale(originalLocale);
	vi.restoreAllMocks();
});

async function mount(
	registry: ViewRegistry,
	editing = new EditingState(),
	onReveal: (row: { top: number; bottom: number }) => void = () => {},
	options: { withDialog?: boolean; workspace?: Workspace } = {}
) {
	const viewer = new ViewerState(new MemoryStorage(), registry.ids);
	const screen = await render(StageTest, {
		workspace: options.workspace ?? ws,
		viewer,
		registry,
		editing,
		onReveal,
		withDialog: options.withDialog ?? false
	});
	const container = screen.container;
	const stage = container.querySelector<HTMLElement>('[data-testid="diagram-stage"]')!;
	const layer = (view: string) =>
		container.querySelector<HTMLElement>(`[data-diagram-view="${view}"]`);
	const task = (view: string, id: string) =>
		container.querySelector<HTMLElement>(
			`[data-diagram-view="${view}"] [data-diagram-task="${id}"]`
		);
	const radios = () => [...container.querySelectorAll<HTMLElement>('[role="radio"]')];
	const radio = (name: string) => radios().find((item) => item.textContent?.trim() === name)!;
	const select = (id: string) => {
		viewer.setDiagramView(id);
		flushSync();
	};
	const settled = () =>
		expect.poll(() => container.querySelectorAll('[data-diagram-layer]').length).toBe(1);
	const announcement = () =>
		container.querySelector('[data-testid="diagram-view-announcement"]')?.textContent ?? '';
	return {
		screen,
		container,
		viewer,
		stage,
		layer,
		task,
		radios,
		radio,
		select,
		settled,
		announcement
	};
}

const threeViews = () => createViewRegistry([rowView, ganttView, listView]);

/** Where focus is: the view of its layer and its task id, or its test id. */
function focusPlace() {
	const active = document.activeElement;
	if (!(active instanceof HTMLElement)) return null;
	const view = active.closest<HTMLElement>('[data-diagram-view]')?.dataset.diagramView;
	if (view) return `${view}:${active.getAttribute('data-diagram-task')}`;
	return active.getAttribute('data-testid') ?? active.textContent?.trim();
}

function near(a: DOMRect, b: DOMRect) {
	for (const key of ['x', 'y', 'width', 'height'] as const) {
		expect(Math.abs(a[key] - b[key]), key).toBeLessThanOrEqual(1);
	}
}

describe('diagram view switch', () => {
	it('is absent with Gantt alone and shows the registered views in order with more', async () => {
		const single = await mount(createViewRegistry([ganttView]));
		expect(single.container.querySelector('[data-testid="diagram-view-switch"]')).toBeNull();
		expect(single.stage.dataset.view).toBe('gantt');
		expect(single.task('gantt', 'a')).not.toBeNull();
		single.screen.unmount();

		const { container, radios } = await mount(threeViews());
		const group = container.querySelector('[data-testid="diagram-view-switch"]')!;
		expect(group.getAttribute('role')).toBe('radiogroup');
		expect(radios().map((item) => item.textContent?.trim())).toEqual([
			'Gantt',
			'Test list',
			'Test row'
		]);
		expect(radios().map((item) => item.getAttribute('aria-checked'))).toEqual([
			'true',
			'false',
			'false'
		]);
		for (const item of radios()) {
			expect(item.getAttribute('aria-controls')).toBe('stage-under-test');
		}
	});

	it('wraps arrows, supports Home and End, and keeps only the checked choice in the Tab order', async () => {
		const { viewer, radios, radio, stage } = await mount(threeViews());
		const expectChecked = (name: string) => {
			expect(radios().map((item) => item.tabIndex)).toEqual(
				radios().map((item) => (item.textContent?.trim() === name ? 0 : -1))
			);
			expect(radio(name).getAttribute('aria-checked')).toBe('true');
			expect(document.activeElement).toBe(radio(name));
		};
		radio('Gantt').focus();
		await userEvent.keyboard('{ArrowLeft}');
		expect(viewer.diagramView).toBe('test-row');
		expectChecked('Test row');
		await userEvent.keyboard('{ArrowRight}');
		expect(viewer.diagramView).toBe('gantt');
		expectChecked('Gantt');
		await userEvent.keyboard('{End}');
		expectChecked('Test row');
		await userEvent.keyboard('{Home}');
		expectChecked('Gantt');
		await userEvent.keyboard('{ArrowDown}');
		expectChecked('Test list');
		await userEvent.keyboard('{ArrowUp}');
		expectChecked('Gantt');
		await expect.poll(() => stage.dataset.view).toBe('gantt');
	});

	it('uses the UI language for the switch, the region and the announcement', async () => {
		overwriteGetLocale(() => 'de');
		const { container, stage, select, announcement } = await mount(threeViews());
		expect(
			container.querySelector('[data-testid="diagram-view-switch"]')!.getAttribute('aria-label')
		).toBe('Diagrammansicht');
		expect(stage.getAttribute('role')).toBe('region');
		expect(stage.getAttribute('aria-label')).toBe('Diagramm Gantt');
		select('test-list');
		expect(stage.getAttribute('aria-label')).toBe('Diagramm Test list');
		await expect.poll(announcement).toBe('Ansicht Test list');
	});
});

describe('focus across a view change', () => {
	it('moves focus from a task in the outgoing view to the same task in the incoming view', async () => {
		const { task, select, settled } = await mount(threeViews());
		task('gantt', 'b')!.focus();
		select('test-list');
		await expect.poll(focusPlace).toBe('test-list:b');
		await settled();
		task('test-list', 'c')!.focus();
		select('gantt');
		await expect.poll(focusPlace).toBe('gantt:c');
	});

	it('focuses the selected switch choice when the incoming view does not show the task', async () => {
		const { task, select, radio } = await mount(
			createViewRegistry([ganttView, listView, partialView])
		);
		task('gantt', 'b')!.focus();
		select('test-partial');
		await expect.poll(() => document.activeElement).toBe(radio('Test partial'));
	});

	it('focuses the visible parent when the incoming view does not show the subtask', async () => {
		ws.commit((plan) => {
			const stageId = plan.stages[0].id;
			plan.tasks = [
				makeTask({ id: 'p', title: 'Parent', stageId, start: '2027-01-02', end: '2027-01-08' }),
				makeTask({
					id: 'sub',
					title: 'Child',
					parentId: 'p',
					stageId,
					start: '2027-01-03',
					end: '2027-01-06'
				})
			];
		});
		const { task, select, settled } = await mount(
			createViewRegistry([ganttView, listView, parentOnlyView])
		);
		select('test-list');
		await settled();
		task('test-list', 'sub')!.focus();
		select('test-parent-only');
		await expect.poll(focusPlace).toBe('test-parent-only:p');
	});

	it('reveals the focused target inside nested scrollers after a view change', async () => {
		ws.commit((plan) => {
			const stageId = plan.stages[0].id;
			plan.tasks = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'].map((id) =>
				makeTask({ id, title: id.toUpperCase(), stageId, start: '2027-01-02', end: '2027-01-08' })
			);
		});
		const onReveal = vi.fn();
		const { container, task, select, settled } = await mount(
			createViewRegistry([ganttView, listView, scrollView]),
			new EditingState(),
			onReveal
		);
		select('test-list');
		await settled();
		task('test-list', 't8')!.focus();
		select('test-scroll');
		await expect.poll(focusPlace).toBe('test-scroll:t8');
		await settled();

		const outer = container.querySelector<HTMLElement>('[data-testid="fixture-row"]')!;
		const inner = container.querySelector<HTMLElement>('[data-testid="fixture-scroller"]')!;
		expect(outer.scrollTop).toBeGreaterThan(0);
		expect(inner.scrollLeft).toBeGreaterThan(0);
		const targetRect = task('test-scroll', 't8')!.getBoundingClientRect();
		const outerRect = outer.getBoundingClientRect();
		const innerRect = inner.getBoundingClientRect();
		expect(targetRect.top).toBeGreaterThanOrEqual(outerRect.top + 20 - 1);
		expect(targetRect.bottom).toBeLessThanOrEqual(outerRect.bottom + 1);
		expect(targetRect.left).toBeGreaterThanOrEqual(innerRect.left + 16 - 1);
		expect(targetRect.right).toBeLessThanOrEqual(innerRect.right + 1);
		expect(onReveal).toHaveBeenCalledWith(
			{ top: expect.any(Number), bottom: expect.any(Number) },
			'instant'
		);
	});

	it('keeps focus on the switch after a click on a choice', async () => {
		const { radio, settled, stage } = await mount(threeViews());
		await userEvent.click(radio('Test list'));
		await settled();
		expect(stage.dataset.view).toBe('test-list');
		expect(document.activeElement).toBe(radio('Test list'));
	});

	it('does not take focus from outside the stage', async () => {
		const { container, select, settled } = await mount(threeViews());
		const outside = container.querySelector<HTMLElement>('[data-testid="outside"]')!;
		outside.focus();
		select('test-row');
		await settled();
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(document.activeElement).toBe(outside);
	});
});

describe('focus on task disappearance', () => {
	it('moves focus to the parent or switch when a focused task disappears, and ignores focus elsewhere', async () => {
		ws.commit((plan) => {
			const stageId = plan.stages[0].id;
			plan.tasks = [
				makeTask({ id: 'p', title: 'Parent', stageId }),
				makeTask({ id: 'c1', title: 'Child 1', parentId: 'p', stageId }),
				makeTask({ id: 'c2', title: 'Child 2', parentId: 'p', stageId }),
				makeTask({ id: 'c3', title: 'Child 3', parentId: 'p', stageId }),
				makeTask({ id: 't', title: 'Top', stageId })
			];
		});
		const { container, task, select, settled, radio } = await mount(
			createViewRegistry([ganttView, listView])
		);
		select('test-list');
		await settled();

		// Focused subtask disappears -> parent gets focus.
		task('test-list', 'c1')!.focus();
		ws.commit((plan) => {
			plan.tasks = plan.tasks.filter((item) => item.id !== 'c1');
		});
		flushSync();
		await expect.poll(focusPlace).toBe('test-list:p');

		// Focus moved outside the stage clears the record -> subtask removal leaves focus outside.
		task('test-list', 'c2')!.focus();
		const outside = container.querySelector<HTMLElement>('[data-testid="outside"]')!;
		outside.focus();
		ws.commit((plan) => {
			plan.tasks = plan.tasks.filter((item) => item.id !== 'c2');
		});
		flushSync();
		await tick();
		expect(document.activeElement).toBe(outside);

		// Focus blurred to body clears the record -> subtask removal leaves focus on body.
		const c3 = task('test-list', 'c3')!;
		c3.focus();
		c3.blur();
		// A blur and a removal are separate user tasks.
		await tick();
		expect(document.activeElement).toBe(document.body);
		ws.commit((plan) => {
			plan.tasks = plan.tasks.filter((item) => item.id !== 'c3');
		});
		flushSync();
		await tick();
		expect(document.activeElement).toBe(document.body);

		// Focused top-level task disappears -> selected switch choice gets focus.
		task('test-list', 't')!.focus();
		ws.commit((plan) => {
			plan.tasks = plan.tasks.filter((item) => item.id !== 't');
		});
		flushSync();
		await expect.poll(() => document.activeElement).toBe(radio('Test list'));
	});
});

describe('view announcement', () => {
	it('announces nothing on mount, only the final view after rapid changes, and same-view fallback', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const { container, task, radio, select, announcement } = await mount(threeViews());
		await vi.advanceTimersByTimeAsync(400);
		expect(announcement()).toBe('');
		const regions = container.querySelectorAll('[aria-live="polite"]');
		expect(regions).toHaveLength(1);
		const said: string[] = [];
		const observer = new MutationObserver(() => said.push(regions[0].textContent ?? ''));
		observer.observe(regions[0], { childList: true, characterData: true, subtree: true });
		select('test-list');
		await tick();
		await vi.advanceTimersByTimeAsync(40);
		select('gantt');
		await tick();
		await vi.advanceTimersByTimeAsync(40);
		select('test-row');
		await tick();
		await tick();
		await vi.advanceTimersByTimeAsync(400);
		await tick();
		expect(announcement()).toBe('Test row view');
		expect(said.filter((text) => text !== '')).toEqual(['Test row view']);

		task('test-row', 'a')!.focus();
		ws.commit((plan) => {
			plan.tasks = plan.tasks.filter((item) => item.id !== 'a');
		});
		flushSync();
		await expect.poll(() => document.activeElement).toBe(radio('Test row'));
		await vi.advanceTimersByTimeAsync(400);
		await tick();
		observer.disconnect();
		expect(announcement()).toBe('Test row view');
		expect(said.filter((text) => text !== '')).toEqual(['Test row view', 'Test row view']);
	});
});

describe('task dialog return focus across stage changes', () => {
	it('keeps focus in the dialog when the diagram view changes and focuses the selected switch choice on close', async () => {
		const { container, select, settled, radio } = await mount(
			createViewRegistry([ganttView, routeMapView]),
			new EditingState(),
			() => {},
			{ withDialog: true }
		);
		select('route-map');
		await settled();

		const station = container.querySelector<HTMLElement>(
			'[data-diagram-view="route-map"] [data-route-target="a"][data-route-focus="keyboard"]'
		)!;
		await userEvent.click(station);
		const dialog = page.getByTestId('task-dialog');
		await expect.element(dialog).toBeVisible();
		await expect
			.poll(() =>
				document.querySelector('[data-testid="task-dialog"]')?.contains(document.activeElement)
			)
			.toBe(true);

		select('gantt');
		await settled();
		expect(
			document.querySelector('[data-testid="task-dialog"]')?.contains(document.activeElement)
		).toBe(true);

		await userEvent.keyboard('{Escape}');
		await expect.element(dialog).not.toBeInTheDocument();
		await expect.poll(() => document.activeElement).toBe(radio('Gantt'));
	});

	it('keeps focus in the dialog when the active plan changes and focuses the selected switch choice on close', async () => {
		const storage = new MemoryStorage();
		const plan1 = makePlan([
			makeTask({
				id: 'a',
				title: 'Plan 1 Alpha',
				stageId: 's1',
				start: '2027-01-02',
				end: '2027-01-08'
			})
		]);
		plan1.id = 'plan-1';
		const plan2 = makePlan([
			makeTask({
				id: 'a',
				title: 'Plan 2 Alpha',
				stageId: 's1',
				start: '2027-01-02',
				end: '2027-01-08'
			})
		]);
		plan2.id = 'plan-2';
		const planStorage = new PlanStorage(storage);
		planStorage.savePlan(plan1);
		planStorage.savePlan(plan2);
		planStorage.saveIndex({ planIds: ['plan-1', 'plan-2'], activeId: 'plan-1' });
		const workspace = new Workspace(storage);

		const { container, select, settled, radio } = await mount(
			createViewRegistry([ganttView, routeMapView]),
			new EditingState(),
			() => {},
			{ withDialog: true, workspace }
		);
		select('route-map');
		await settled();

		const station = container.querySelector<HTMLElement>(
			'[data-diagram-view="route-map"] [data-route-target="a"][data-route-focus="keyboard"]'
		)!;
		await userEvent.click(station);
		const dialog = page.getByTestId('task-dialog');
		await expect.element(dialog).toBeVisible();
		await expect
			.poll(() =>
				document.querySelector('[data-testid="task-dialog"]')?.contains(document.activeElement)
			)
			.toBe(true);

		workspace.switchTo('plan-2');
		flushSync();
		await tick();
		await expect.element(dialog).toBeVisible();
		expect(
			document.querySelector('[data-testid="task-dialog"]')?.contains(document.activeElement)
		).toBe(true);

		await userEvent.keyboard('{Escape}');
		await expect.element(dialog).not.toBeInTheDocument();
		await expect.poll(() => document.activeElement).toBe(radio('Route map'));
	});
});

describe('outgoing layer', () => {
	it('is inert and takes no route input before its DOM is removed', async () => {
		const editing = new EditingState();
		const { layer, task, select, settled } = await mount(threeViews(), editing);
		const route = editing.routeFocus;
		const bar = task('gantt', 'a')!;
		route.focusEnter('a', route.tokenFor(bar), 'keyboard');
		expect(route.resolve()).toBe('a');

		select('test-list');
		await tick();
		await tick();
		flushSync();
		const outgoing = layer('gantt')!;
		expect(outgoing.isConnected, 'The outgoing layer is still in its exit transition').toBe(true);
		expect(outgoing.inert).toBe(true);
		expect(outgoing.getAttribute('aria-hidden')).toBe('true');
		expect(route.resolve()).toBeNull();
		route.focusEnter('a', route.tokenFor(bar), 'keyboard');
		expect(route.resolve()).toBeNull();
		const incoming = task('test-list', 'a')!;
		route.focusEnter('a', route.tokenFor(incoming), 'keyboard');
		expect(route.resolve()).toBe('a');

		await settled();
		expect(outgoing.isConnected).toBe(false);
	});
});

describe('view motion', () => {
	it('moves task boxes by id between views', async () => {
		const { task, select, settled } = await mount(threeViews());
		const animate = vi.spyOn(Element.prototype, 'animate');
		select('test-row');
		await tick();
		await tick();
		const moved = animate.mock.contexts.filter(
			(element) => element instanceof HTMLElement && element.hasAttribute('data-diagram-task')
		);
		expect(moved).toContain(task('test-row', 'b'));
		await settled();
	});

	it('starts no animation and swaps at once with reduced motion', async () => {
		motion.reduced = true;
		const { container, select, stage } = await mount(threeViews());
		const animate = vi.spyOn(Element.prototype, 'animate');
		select('test-row');
		await tick();
		await tick();
		expect(animate).not.toHaveBeenCalled();
		expect(document.getAnimations()).toHaveLength(0);
		expect(container.querySelectorAll('[data-diagram-layer]')).toHaveLength(1);
		expect(stage.dataset.view).toBe('test-row');
	});

	it('continues from the current rendered frame when a change interrupts a change', async () => {
		const { layer, task, select, settled } = await mount(threeViews());
		motion.duration = 60_000;
		select('test-list');
		await expect.poll(() => task('test-list', 'b')?.getAnimations().length ?? 0).toBeGreaterThan(0);
		const flying = task('test-list', 'b')!;
		for (const animation of flying.getAnimations()) {
			animation.pause();
			animation.currentTime = 20_000;
		}
		expect(flying.getAnimations().length, 'The first change is still in flight').toBeGreaterThan(0);
		const before = flying.getBoundingClientRect();

		motion.duration = null;
		select('test-row');
		await tick();
		await tick();
		const incoming = task('test-row', 'b');
		expect(incoming, 'The incoming layer has mounted').not.toBeNull();
		// The same frame: the incoming box starts where the interrupted box is now.
		near(incoming!.getBoundingClientRect(), before);
		// The interrupted outgoing box also continues from where it is. It does not jump back.
		near(flying.getBoundingClientRect(), before);
		// The first leaving layer started with the long test duration; finish its outro so settled() checks the second change.
		for (const animation of layer('gantt')?.getAnimations() ?? []) animation.finish();
		await settled();
	});
});
