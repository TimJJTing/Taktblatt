import '../../../routes/layout.css';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, tick } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import { view as ganttView } from '#lib/components/timeline/diagram-view.ts';
import { makeTask } from '#lib/domain/test-helpers.ts';
import { getLocale, overwriteGetLocale } from '#lib/paraglide/runtime.js';
import { EditingState } from '#lib/state/editing.svelte.ts';
import { MemoryStorage } from '#lib/state/memory-storage.ts';
import { ViewerState } from '#lib/state/viewer.svelte.ts';
import { Workspace } from '#lib/state/workspace.svelte.ts';
import {
	applyTransition,
	captureGeometry,
	routersCompatible,
	scrollContainerOf,
	sourceBox,
	type Box,
	type TaskGeometry
} from './diagram-motion.ts';
import StageTest from './DiagramStage.test.svelte';
import { testView } from './test-views.ts';
import { createViewRegistry, type ViewRegistry } from './view-registry.ts';

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('#lib/motion.ts', async (original) => ({
	...(await original<typeof import('#lib/motion.ts')>()),
	motionDuration: (ms: number) => (motion.reduced ? 0 : ms)
}));

const listView = testView('test-list', { order: 15, label: 'Test list' });
const rowView = testView('test-row', { order: 25, label: 'Test row', layout: 'row' });
const partialView = testView('test-partial', { order: 35, label: 'Test partial', omit: ['b'] });

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
	overwriteGetLocale(originalLocale);
	vi.restoreAllMocks();
});

async function mount(registry: ViewRegistry, editing = new EditingState()) {
	const viewer = new ViewerState(new MemoryStorage(), registry.ids);
	const screen = await render(StageTest, { workspace: ws, viewer, registry, editing });
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

describe('view announcement', () => {
	it('announces nothing on mount and only the final view after rapid changes', async () => {
		const { container, select, announcement } = await mount(threeViews());
		await new Promise((resolve) => setTimeout(resolve, 400));
		expect(announcement()).toBe('');
		const regions = container.querySelectorAll('[aria-live="polite"]');
		expect(regions).toHaveLength(1);
		const said: string[] = [];
		const observer = new MutationObserver(() => said.push(regions[0].textContent ?? ''));
		observer.observe(regions[0], { childList: true, characterData: true, subtree: true });
		select('test-list');
		await new Promise((resolve) => setTimeout(resolve, 40));
		select('gantt');
		await new Promise((resolve) => setTimeout(resolve, 40));
		select('test-row');
		await expect.poll(announcement).toBe('Test row view');
		await new Promise((resolve) => setTimeout(resolve, 400));
		observer.disconnect();
		expect(announcement()).toBe('Test row view');
		expect(said.filter((text) => text !== '')).toEqual(['Test row view']);
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
		const { task, select, settled } = await mount(threeViews());
		select('test-list');
		await new Promise((resolve) => setTimeout(resolve, 90));
		const flying = task('test-list', 'b')!;
		expect(flying.getAnimations().length, 'The first change is still in flight').toBeGreaterThan(0);
		const before = flying.getBoundingClientRect();

		select('test-row');
		await tick();
		await tick();
		const incoming = task('test-row', 'b');
		expect(incoming, 'The incoming layer has mounted').not.toBeNull();
		// The same frame: the incoming box starts where the interrupted box is now.
		near(incoming!.getBoundingClientRect(), before);
		// The interrupted outgoing box also continues from where it is. It does not jump back.
		near(flying.getBoundingClientRect(), before);
		await settled();
	});
});

describe('motion adapter hooks', () => {
	const hosts: HTMLElement[] = [];
	afterEach(() => {
		for (const host of hosts.splice(0)) host.remove();
	});

	function build(html: string) {
		const host = document.createElement('div');
		host.innerHTML = html;
		document.body.append(host);
		hosts.push(host);
		return (selector: string) => host.querySelector<HTMLElement>(selector)!;
	}

	const scrolledStage = () => {
		const find = build(`
			<div id="stage" style="position: fixed; left: 30px; top: 40px; width: 600px; height: 400px">
				<div id="scroller" style="position: absolute; left: 10px; top: 20px; width: 300px; height: 200px; overflow: auto">
					<div style="position: relative; width: 1000px; height: 1000px">
						<div data-diagram-task="a" data-diagram-parent="p" style="position: absolute; left: 100px; top: 200px; width: 80px; height: 20px; border-radius: 4px">
							<span data-diagram-station="a" style="position: absolute; left: 2px; top: 3px; width: 10px; height: 10px"></span>
						</div>
						<span data-diagram-label="a" style="position: absolute; left: 100px; top: 230px">Alpha</span>
						<span data-diagram-label="b" style="position: absolute; left: 400px; top: 260px">Beta</span>
					</div>
				</div>
				<div id="free" style="position: absolute; left: 400px; top: 0; width: 10px; height: 10px"></div>
			</div>`);
		const scroller = find('#scroller');
		scroller.scrollLeft = 20;
		scroller.scrollTop = 50;
		return find;
	};

	const round = (value: object | null) =>
		value &&
		Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				typeof item === 'number' ? Math.round(item) : item
			])
		);

	it('captureGeometry returns stage boxes with scroll offsets and running transforms', () => {
		const find = scrolledStage();
		const animation = find('[data-diagram-task="a"]').animate(
			[{ transform: 'translateX(30px)' }, { transform: 'translateX(30px)' }],
			{ duration: 10_000 }
		);
		const records = captureGeometry(find('#stage'), find('#stage'));
		animation.cancel();
		const a = records.get('a')!;
		expect(round(a.box)).toEqual({ x: 120, y: 170, w: 80, h: 20, radius: 4 });
		expect(round(a.station)).toEqual({ x: 127, y: 178, r: 5 });
		expect(round(a.label)).toEqual({ x: 90, y: 200 });
		expect(a.parentId).toBe('p');
		const b = records.get('b')!;
		expect(b.box).toBeNull();
		expect(b.station).toBeNull();
		expect(round(b.label)).toEqual({ x: 390, y: 230 });
		expect([...records.keys()].sort()).toEqual(['a', 'b']);
	});

	it('sourceBox uses the own box, then the own label, then the parent, else nothing', () => {
		const box: Box = { x: 1, y: 2, w: 3, h: 4, radius: 1 };
		const parentBox: Box = { x: 10, y: 20, w: 30, h: 40, radius: 0 };
		const record = (geometry: Partial<TaskGeometry>): TaskGeometry => ({
			box: null,
			station: null,
			label: null,
			parentId: null,
			...geometry
		});
		const outgoing = new Map<string, TaskGeometry>([
			['own', record({ box, label: { x: 9, y: 9 } })],
			['labelled', record({ label: { x: 5, y: 6 } })],
			['parent', record({ box: parentBox })],
			['label-parent', record({ label: { x: 7, y: 8 } })]
		]);
		expect(sourceBox('own', 'parent', outgoing)).toEqual(box);
		expect(sourceBox('labelled', 'parent', outgoing)).toEqual({
			x: 5,
			y: 6,
			w: 0,
			h: 0,
			radius: 0
		});
		expect(sourceBox('child', 'parent', outgoing)).toEqual(parentBox);
		expect(sourceBox('child', 'label-parent', outgoing)).toEqual({
			x: 7,
			y: 8,
			w: 0,
			h: 0,
			radius: 0
		});
		expect(sourceBox('child', 'missing', outgoing)).toBeNull();
		expect(sourceBox('child', null, outgoing)).toBeNull();
	});

	it('routersCompatible needs the same router and the same connector meaning', () => {
		expect(routersCompatible(ganttView.motion, { ...ganttView.motion })).toBe(true);
		expect(routersCompatible(ganttView.motion, listView.motion)).toBe(false);
		expect(
			routersCompatible(ganttView.motion, { ...ganttView.motion, connectorSchema: 'other-v1' })
		).toBe(false);
	});

	it('scrollContainerOf finds the scrolling ancestor and reads its offsets', () => {
		const find = scrolledStage();
		const container = scrollContainerOf(find('[data-diagram-task="a"]'), find('#stage'))!;
		expect(container.element).toBe(find('#scroller'));
		expect(round(container.bounds)).toEqual({ x: 10, y: 20, w: 300, h: 200, radius: 0 });
		expect(container.scrollLeft).toBe(20);
		expect(container.scrollTop).toBe(50);
		expect(scrollContainerOf(find('#free'), find('#stage'))).toBeNull();
	});

	it('applyTransition starts a retarget from the current rendered position', () => {
		const find = build(`
			<div id="stage" style="position: fixed; left: 0; top: 0; width: 800px; height: 400px">
				<div data-diagram-task="a" style="position: absolute; left: 300px; top: 0; width: 40px; height: 20px"></div>
			</div>`);
		const stage = find('#stage');
		const element = find('[data-diagram-task="a"]');
		const target = (x: number, y: number) =>
			new Map<string, TaskGeometry>([
				[
					'a',
					{ box: { x, y, w: 40, h: 20, radius: 0 }, station: null, label: null, parentId: null }
				]
			]);
		const first = applyTransition(stage, stage, target(0, 100), 1000, 'toward');
		expect(first).toHaveLength(1);
		first[0].pause();
		first[0].currentTime = 500;
		const middle = element.getBoundingClientRect();
		expect(Math.abs(middle.x - 300), 'The first motion is in flight').toBeGreaterThan(10);

		const second = applyTransition(stage, stage, target(600, 0), 1000, 'toward');
		expect(second).toHaveLength(1);
		second[0].pause();
		near(element.getBoundingClientRect(), middle);
		second[0].finish();
		const end = element.getBoundingClientRect();
		expect(Math.round(end.x)).toBe(600);
		expect(Math.round(end.y)).toBe(0);
		second[0].cancel();
	});

	it('applyTransition with duration 0 starts nothing', () => {
		const find = build(`
			<div id="stage" style="position: fixed; left: 0; top: 0; width: 800px; height: 400px">
				<div data-diagram-task="a" style="position: absolute; left: 300px; top: 0; width: 40px; height: 20px"></div>
			</div>`);
		const stage = find('#stage');
		const source = new Map<string, TaskGeometry>([
			[
				'a',
				{ box: { x: 0, y: 0, w: 40, h: 20, radius: 0 }, station: null, label: null, parentId: null }
			]
		]);
		expect(applyTransition(stage, stage, source, 0, 'from')).toEqual([]);
		expect(find('[data-diagram-task="a"]').getAnimations()).toHaveLength(0);
	});
});
