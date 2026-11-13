import '../../../routes/layout.css';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import { DIAGRAM_ATTR } from '#lib/components/diagram/view-contract.ts';
import { makeTask } from '#lib/domain/test-helpers.ts';
import { removeTasks } from '#lib/state/commands.ts';
import { EditingState } from '#lib/state/editing.svelte.ts';
import { ViewerState } from '#lib/state/viewer.svelte.ts';
import { MemoryStorage } from '#lib/state/memory-storage.ts';
import { Workspace } from '#lib/state/workspace.svelte.ts';
import RouteMapTest from './RouteMap.test.svelte';

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
	afterEach(() => vi.restoreAllMocks());
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

	it('expands only with its named chevron and keeps plan data, history and N to go unchanged', async () => {
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
		await expect.element(screen.getByText('2 to go', { exact: true }).first()).toBeVisible();
		await userEvent.click(control);
		expect(mark(screen.container, 'a')).toBeNull();
		await expect.element(screen.getByText('2 to go', { exact: true }).first()).toBeVisible();
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
