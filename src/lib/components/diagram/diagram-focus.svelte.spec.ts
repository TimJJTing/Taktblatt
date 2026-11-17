import '../../../routes/layout.css';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { indexTasks } from '#lib/domain/derive.ts';
import { makeTask } from '#lib/domain/test-helpers.ts';
import {
	diagramReturnFocus,
	parentIdOf,
	resolveTaskFocus,
	revealTarget,
	taskFocusTarget
} from './diagram-focus.ts';

function mountHtml(html: string): HTMLElement {
	const host = document.createElement('div');
	host.innerHTML = html;
	document.body.append(host);
	return host;
}

const hosts: HTMLElement[] = [];
function renderDom(html: string): HTMLElement {
	const host = mountHtml(html);
	hosts.push(host);
	return host;
}

afterEach(() => {
	while (hosts.length) hosts.pop()?.remove();
	vi.restoreAllMocks();
});

describe('taskFocusTarget', () => {
	it('prefers a focusable task box, then focusable label, then keyboard route target', () => {
		const root = renderDom(`
			<div>
				<button data-diagram-task="a">Box A</button>
				<button data-diagram-label="a">Label A</button>
				<button data-route-target="a" data-route-focus="keyboard">Route A</button>

				<div data-diagram-task="b">
					<button data-diagram-label="b">Label B</button>
					<button data-route-target="b" data-route-focus="keyboard">Route B</button>
				</div>

				<div data-diagram-task="c" tabindex="-1">
					<span data-diagram-label="c">Label C</span>
					<button data-route-target="c" data-route-focus="keyboard">Route C</button>
				</div>

				<div data-diagram-task="d">
					<span data-diagram-label="d">Label D</span>
					<span data-route-target="d">Not keyboard focusable</span>
				</div>
			</div>
		`);

		expect(taskFocusTarget(root, 'a')).toBe(root.querySelector('[data-diagram-task="a"]'));
		expect(taskFocusTarget(root, 'b')).toBe(root.querySelector('[data-diagram-label="b"]'));
		expect(taskFocusTarget(root, 'c')).toBe(
			root.querySelector('[data-route-target="c"][data-route-focus="keyboard"]')
		);
		expect(taskFocusTarget(root, 'd')).toBeNull();
		expect(taskFocusTarget(root, 'missing')).toBeNull();
	});
});

describe('parentIdOf', () => {
	it('reads data-diagram-parent first and falls back to the task index', () => {
		const root = renderDom(`
			<div>
				<div data-diagram-task="c1" data-diagram-parent="p1">
					<button data-diagram-label="c1">Child 1</button>
				</div>
				<button data-diagram-label="c2">Child 2</button>
				<button data-diagram-task="p1">Parent</button>
			</div>
		`);
		// Empty index proves data-diagram-parent does not rely on the index.
		const emptyIndex = indexTasks([]);
		expect(parentIdOf(root.querySelector('[data-diagram-task="c1"]'), emptyIndex)).toBe('p1');
		expect(parentIdOf(root.querySelector('[data-diagram-label="c1"]'), emptyIndex)).toBe('p1');

		const index = indexTasks([makeTask({ id: 'p1' }), makeTask({ id: 'c2', parentId: 'p1' })]);
		expect(parentIdOf(root.querySelector('[data-diagram-label="c2"]'), index)).toBe('p1');
		expect(parentIdOf(root.querySelector('[data-diagram-task="p1"]'), index)).toBeNull();
		expect(parentIdOf(null, index)).toBeNull();
	});
});

describe('resolveTaskFocus', () => {
	it('returns the task target, else the captured parent target, else switch', () => {
		const root = renderDom(`
			<div>
				<button data-diagram-task="p1">Parent</button>
				<button data-diagram-task="t1">Task</button>
			</div>
		`);

		expect(resolveTaskFocus(root, { taskId: 't1', parentId: 'p1' })).toBe(
			root.querySelector('[data-diagram-task="t1"]')
		);
		expect(resolveTaskFocus(root, { taskId: 'deleted-child', parentId: 'p1' })).toBe(
			root.querySelector('[data-diagram-task="p1"]')
		);
		expect(resolveTaskFocus(root, { taskId: 'deleted-top', parentId: null })).toBe('switch');
		expect(resolveTaskFocus(root, { taskId: 'deleted-child', parentId: 'missing-parent' })).toBe(
			'switch'
		);
	});
});

describe('revealTarget', () => {
	it('scrolls nested marked scrollers clear of scroll-padding and calls onReveal', () => {
		const host = renderDom(`
			<div id="stage" style="position: relative; width: 320px; height: 200px;">
				<div
					id="outer"
					data-diagram-scroller=""
					style="width: 300px; height: 120px; overflow-y: auto; scroll-padding-top: 24px;"
				>
					<div
						id="inner"
						data-diagram-scroller=""
						style="width: 240px; overflow-x: auto; scroll-padding-left: 32px;"
					>
						<div style="position: relative; width: 600px; height: 400px;">
							<button
								id="target"
								style="position: absolute; left: 420px; top: 260px; width: 80px; height: 24px;"
							>Target</button>
						</div>
					</div>
				</div>
			</div>
		`);
		const stage = host.querySelector<HTMLElement>('#stage')!;
		const outer = host.querySelector<HTMLElement>('#outer')!;
		const inner = host.querySelector<HTMLElement>('#inner')!;
		const target = host.querySelector<HTMLElement>('#target')!;
		const onReveal = vi.fn();

		revealTarget(target, stage, onReveal);

		expect(outer.scrollTop).toBeGreaterThan(0);
		expect(inner.scrollLeft).toBeGreaterThan(0);
		const outerRect = outer.getBoundingClientRect();
		const innerRect = inner.getBoundingClientRect();
		const targetRect = target.getBoundingClientRect();
		expect(targetRect.top).toBeGreaterThanOrEqual(outerRect.top + 24 - 1);
		expect(targetRect.bottom).toBeLessThanOrEqual(outerRect.bottom + 1);
		expect(targetRect.left).toBeGreaterThanOrEqual(innerRect.left + 32 - 1);
		expect(targetRect.right).toBeLessThanOrEqual(innerRect.right + 1);
		expect(onReveal).toHaveBeenCalledWith({
			top: expect.any(Number),
			bottom: expect.any(Number)
		});
		const call = onReveal.mock.calls[0][0] as { top: number; bottom: number };
		expect(Math.abs(call.top - targetRect.top)).toBeLessThanOrEqual(1);
		expect(Math.abs(call.bottom - targetRect.bottom)).toBeLessThanOrEqual(1);

		// Scrolling back up clears sticky top and left padding too.
		outer.scrollTop = 320;
		inner.scrollLeft = 500;
		const topLeft = document.createElement('button');
		topLeft.style.cssText = 'position: absolute; left: 0px; top: 0px; width: 60px; height: 20px;';
		inner.firstElementChild!.append(topLeft);
		revealTarget(topLeft, stage, onReveal);
		expect(outer.scrollTop).toBe(0);
		expect(inner.scrollLeft).toBe(0);
	});
});

describe('diagramReturnFocus', () => {
	function setupReturnHost() {
		const host = renderDom(`
			<div>
				<div role="radiogroup">
					<button
						role="radio"
						aria-checked="true"
						aria-controls="stage-1"
						data-testid="diagram-view-kanban"
					>Kanban</button>
				</div>
				<div id="stage-1">
					<div data-diagram-layer="0" data-diagram-view="kanban">
						<div data-diagram-task="p1">
							<button data-diagram-label="p1">Parent</button>
						</div>
						<div data-diagram-task="c1" data-diagram-parent="p1">
							<button data-diagram-label="c1">Child</button>
						</div>
					</div>
				</div>
			</div>
		`);
		const stage = host.querySelector<HTMLElement>('#stage-1')!;
		const choice = host.querySelector<HTMLButtonElement>('[data-testid="diagram-view-kanban"]')!;
		const parentLabel = host.querySelector<HTMLButtonElement>('[data-diagram-label="p1"]')!;
		const childBox = host.querySelector<HTMLElement>('[data-diagram-task="c1"]')!;
		const childLabel = host.querySelector<HTMLButtonElement>('[data-diagram-label="c1"]')!;
		let planId = 'plan-1';
		let viewId: 'gantt' | 'route-map' | 'kanban' = 'kanban';
		const current = {
			planId: () => planId,
			viewId: () => viewId,
			stage: () => stage,
			controls: 'stage-1',
			onReveal: vi.fn()
		};
		return {
			host,
			stage,
			choice,
			parentLabel,
			childBox,
			childLabel,
			current,
			setPlanId: (id: string) => {
				planId = id;
			},
			setViewId: (id: 'gantt' | 'route-map' | 'kanban') => {
				viewId = id;
			}
		};
	}

	it('returns the opening element when it stays connected in the active layer for the same task', () => {
		const env = setupReturnHost();
		const resolve = diagramReturnFocus(
			{
				planId: 'plan-1',
				viewId: 'kanban',
				taskId: 'c1',
				parentId: 'p1',
				from: env.childLabel
			},
			env.current
		);
		expect(resolve()).toBe(env.childLabel);
	});

	it('does not return a connected opening element whose task identity changed', () => {
		const env = setupReturnHost();
		const resolve = diagramReturnFocus(
			{
				planId: 'plan-1',
				viewId: 'kanban',
				taskId: 'c1',
				parentId: 'p1',
				from: env.childLabel
			},
			env.current
		);
		env.childBox.setAttribute('data-diagram-task', 'other');
		env.childLabel.setAttribute('data-diagram-label', 'other');
		const replacementBox = document.createElement('div');
		replacementBox.setAttribute('data-diagram-task', 'c1');
		replacementBox.setAttribute('data-diagram-parent', 'p1');
		const replacementLabel = document.createElement('button');
		replacementLabel.setAttribute('data-diagram-label', 'c1');
		replacementBox.append(replacementLabel);
		env.stage.querySelector('[data-diagram-layer]')!.append(replacementBox);

		expect(resolve()).toBe(replacementLabel);

		replacementBox.remove();
		expect(resolve()).toBe(env.parentLabel);
	});

	it('returns the task focus target when the opening element was replaced (moved card)', () => {
		const env = setupReturnHost();
		const resolve = diagramReturnFocus(
			{
				planId: 'plan-1',
				viewId: 'kanban',
				taskId: 'c1',
				parentId: 'p1',
				from: env.childLabel
			},
			env.current
		);
		env.childBox.remove();
		const movedBox = document.createElement('div');
		movedBox.setAttribute('data-diagram-task', 'c1');
		movedBox.setAttribute('data-diagram-parent', 'p1');
		const movedLabel = document.createElement('button');
		movedLabel.setAttribute('data-diagram-label', 'c1');
		movedBox.append(movedLabel);
		env.stage.querySelector('[data-diagram-layer]')!.append(movedBox);

		expect(resolve()).toBe(movedLabel);
	});

	it('returns the visible parent target when the task is missing and parentId was captured', () => {
		const env = setupReturnHost();
		const resolve = diagramReturnFocus(
			{
				planId: 'plan-1',
				viewId: 'kanban',
				taskId: 'c1',
				parentId: 'p1',
				from: env.childLabel
			},
			env.current
		);
		env.childBox.remove();
		expect(resolve()).toBe(env.parentLabel);
	});

	it('returns the selected switch choice when both task and parent are missing', () => {
		const env = setupReturnHost();
		const resolve = diagramReturnFocus(
			{
				planId: 'plan-1',
				viewId: 'kanban',
				taskId: 'c1',
				parentId: null,
				from: env.childLabel
			},
			env.current
		);
		env.childBox.remove();
		expect(resolve()).toBe(env.choice);
	});

	it('returns the selected switch choice when the active view or plan changed', () => {
		const env = setupReturnHost();
		const resolveView = diagramReturnFocus(
			{
				planId: 'plan-1',
				viewId: 'kanban',
				taskId: 'c1',
				parentId: 'p1',
				from: env.childLabel
			},
			env.current
		);
		env.setViewId('route-map');
		expect(resolveView()).toBe(env.choice);

		env.setViewId('kanban');
		const resolvePlan = diagramReturnFocus(
			{
				planId: 'plan-1',
				viewId: 'kanban',
				taskId: 'c1',
				parentId: 'p1',
				from: env.childLabel
			},
			env.current
		);
		env.setPlanId('plan-2');
		expect(resolvePlan()).toBe(env.choice);
	});
});
