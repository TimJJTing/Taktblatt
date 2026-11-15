import '../../../routes/layout.css';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import StageTest from '#lib/components/diagram/DiagramStage.test.svelte';
import { createViewRegistry } from '#lib/components/diagram/view-registry.ts';
import { view as gantt } from '#lib/components/timeline/diagram-view.ts';
import { makePlan } from '#lib/domain/test-helpers.ts';
import type { Plan } from '#lib/domain/schema.ts';
import { getLocale, overwriteGetLocale } from '#lib/paraglide/runtime.js';
import { isolatedParent, kanbanTask, mixedBoard } from '#lib/scene/kanban-fixtures.test-helper.ts';
import { removeTasks, updateTask } from '#lib/state/commands.ts';
import { EditingState } from '#lib/state/editing.svelte.ts';
import { MemoryStorage } from '#lib/state/memory-storage.ts';
import { ViewerState } from '#lib/state/viewer.svelte.ts';
import { Workspace } from '#lib/state/workspace.svelte.ts';
import { view as kanban } from './diagram-view.ts';

const originalLocale = getLocale;
beforeEach(() => overwriteGetLocale(() => 'en'));
afterEach(() => {
	overwriteGetLocale(originalLocale);
	vi.restoreAllMocks();
});

async function mount(plan: Plan) {
	const workspace = new Workspace(new MemoryStorage());
	workspace.commit((draft) => Object.assign(draft, plan, { id: draft.id }));
	workspace.history.clear();
	const registry = createViewRegistry([gantt, kanban]);
	const viewer = new ViewerState(new MemoryStorage(), registry.ids);
	viewer.setDiagramView('kanban');
	const editing = new EditingState();
	const openDetails = vi.spyOn(editing, 'openDetails');
	const screen = await render(StageTest, { workspace, viewer, registry, editing });
	const board = screen.container.querySelector<HTMLElement>('[data-testid="kanban"]')!;
	const card = (id: string) => board.querySelector<HTMLElement>(`[data-diagram-task="${id}"]`)!;
	const action = (id: string) =>
		board.querySelector<HTMLButtonElement>(`[data-diagram-label="${id}"]`)!;
	const station = (id: string) =>
		card(id).querySelector<HTMLButtonElement>('button[aria-label^="Show dependency route for"]')!;
	return { screen, board, card, action, station, workspace, viewer, editing, openDetails };
}

function touch(button: HTMLElement) {
	button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
	button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }));
	button.click();
	flushSync();
}

describe('Kanban columns and empty states', () => {
	it('shows four named column sections in fixed order with visible leaf counts and lists', async () => {
		const { board } = await mount(mixedBoard());
		const columns = [...board.querySelectorAll<HTMLElement>('[data-testid="kanban-column"]')];
		expect(columns.map((column) => column.dataset.column)).toEqual([
			'blocked',
			'todo',
			'in_progress',
			'done'
		]);
		for (const [i, name] of ['Blocked', 'Todo', 'In progress', 'Done'].entries()) {
			await expect.element(columns[i]).toHaveAccessibleName(new RegExp(name));
			expect(columns[i].matches('section, [role="region"]')).toBe(true);
			expect(columns[i].querySelector('[data-testid="kanban-count"]')?.textContent?.trim()).toBe(
				String([1, 3, 1, 3][i])
			);
			expect(columns[i].querySelector('ul, ol, [role="list"]')).not.toBeNull();
		}
		expect(board.querySelector('[role="grid"]')).toBeNull();
	});

	it('keeps zero-count headings and explains each empty column on a nonempty board', async () => {
		const { board } = await mount(makePlan([kanbanTask('done', { status: 'done' })]));
		expect(
			[...board.querySelectorAll('[data-testid="kanban-count"]')].map((count) =>
				count.textContent?.trim()
			)
		).toEqual(['0', '0', '0', '1']);
		expect(
			[...board.querySelectorAll('[data-testid="kanban-column"]')]
				.slice(0, 3)
				.every((column) => column.textContent?.includes('No tasks in this column'))
		).toBe(true);
		expect(board.querySelector('[data-testid="kanban-empty"]')).toBeNull();
	});

	it('distinguishes a plan with no tasks from one with all leaves canceled', async () => {
		const empty = await mount(makePlan([]));
		const explanation = empty.board.querySelector('[data-testid="kanban-empty"]')!;
		expect(explanation.textContent).toMatch(/no tasks/i);
		expect(empty.board.querySelectorAll('[data-testid="kanban-column"]')).toHaveLength(4);
		expect(empty.board.querySelectorAll('[data-diagram-label]')).toHaveLength(0);
		const emptyText = explanation.textContent;
		empty.screen.unmount();
		const canceled = await mount(makePlan([kanbanTask('Z', { status: 'canceled' })]));
		const canceledText = canceled.board.querySelector('[data-testid="kanban-empty"]')!.textContent;
		expect(canceledText).not.toBe(emptyText);
		expect(canceledText).toMatch(/canceled/i);
		expect(canceledText).toMatch(/Work plan/);
		expect(canceled.board.querySelectorAll('[data-diagram-label]')).toHaveLength(0);
	});
});

describe('Kanban card identity and names', () => {
	it('marks task boxes, labels, stations, subtasks and both shared scrollers', async () => {
		const { board, card, action, station, viewer, workspace } = await mount(isolatedParent());
		expect(card('P')).toBeNull();
		expect(card('C1').getAttribute('data-diagram-parent')).toBe('P');
		expect(card('U').hasAttribute('data-diagram-parent')).toBe(false);
		expect(card('C1').tabIndex).toBe(-1);
		expect(card('C1').matches('button, [role="button"]')).toBe(false);
		expect(action('C1').tagName).toBe('BUTTON');
		expect(station('C1').tagName).toBe('BUTTON');
		expect(action('C1').parentElement).toBe(station('C1').parentElement);
		expect(card('C1').querySelector('button button')).toBeNull();
		expect(card('C1').querySelector('[data-diagram-station="C1"]')).not.toBeNull();
		for (const id of ['kanban-scroll', 'kanban-strip']) {
			const region = board.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
			expect(region.hasAttribute('data-diagram-scroller')).toBe(true);
			await expect.element(region).toHaveAccessibleName(/.+/);
		}
		expect(viewer.isExpanded(workspace.plan.id, 'P')).toBe(false);
		expect(
			board.querySelectorAll('[title], [aria-grabbed], [aria-dropeffect], [draggable]')
		).toHaveLength(0);
		expect(board.querySelector('select, [role="combobox"]')).toBeNull();
	});

	it('names the action with stage and parent context and describes full owners, dates and readiness', async () => {
		const plan = makePlan([
			kanbanTask('P', { title: 'Launch' }),
			kanbanTask('C', {
				parentId: 'P',
				title: 'Review',
				owners: ['Ada', 'Lin'],
				start: '2027-01-03',
				end: '2027-01-04'
			})
		]);
		plan.stages[0].title = 'Design';
		const { action, station, card } = await mount(plan);
		await expect.element(action('C')).toHaveAccessibleName(/^Open task details for Review/);
		for (const context of [/S1/, /Design/, /Launch/]) {
			await expect.element(action('C')).toHaveAccessibleName(context);
		}
		await expect.element(action('C')).toHaveAccessibleName(/Todo/);
		await expect.element(action('C')).toHaveAccessibleDescription(/Ada.*Lin/);
		await expect.element(action('C')).toHaveAccessibleDescription(/Jan.*3.*4.*2027/);
		await expect.element(action('C')).toHaveAccessibleDescription(/Ready/);
		await expect.element(station('C')).toHaveAccessibleName('Show dependency route for Review');
		expect(card('C').textContent).toContain('Subtask of Launch');
		expect(card('C').textContent).toContain('Design');
		expect(card('C').querySelector('.stage-badge')?.textContent?.trim()).toBe('S1');
		const name = action('C').getAttribute('aria-label');
		station('C').focus();
		await userEvent.keyboard('{ArrowUp}');
		await expect.element(action('C')).toHaveAttribute('aria-label', name!);
	});

	it('uses the untitled fallback and reserved missing metadata text', async () => {
		const { action, station, card } = await mount(makePlan([kanbanTask('empty', { title: '' })]));
		await expect
			.element(action('empty'))
			.toHaveAccessibleName(/^Open task details for Untitled task/);
		await expect
			.element(station('empty'))
			.toHaveAccessibleName('Show dependency route for Untitled task');
		expect(card('empty').textContent).toContain('Untitled task');
		expect(card('empty').textContent).toContain('No owners');
		expect(card('empty').textContent).toContain('No dates');
	});
});

describe('Kanban read-only actions', () => {
	it.each(['click', 'Enter', 'Space'])(
		'opens details once through EditingState for %s',
		async (activation) => {
			const { action, editing, openDetails, workspace } = await mount(makePlan([kanbanTask('A')]));
			const main = action('A');
			if (activation === 'click') await userEvent.click(main);
			else {
				main.focus();
				await userEvent.keyboard(activation === 'Enter' ? '{Enter}' : ' ');
			}
			expect(openDetails).toHaveBeenCalledTimes(1);
			expect(openDetails.mock.calls[0][0]).toBe('A');
			expect(editing.detailsReturnFocus).toBe(main);
			expect(editing.detailsTaskId).toBe('A');
			expect(workspace.history.canUndo).toBe(false);
		}
	);

	it('station keyboard activation lights a route without opening details or navigating the list', async () => {
		const { station, editing, openDetails, workspace } = await mount(
			makePlan([kanbanTask('A'), kanbanTask('B')])
		);
		station('A').focus();
		await userEvent.keyboard('{ArrowDown}{Enter} ');
		expect(document.activeElement).toBe(station('A'));
		expect(editing.routeId).toBe('A');
		expect(openDetails).not.toHaveBeenCalled();
		expect(workspace.history.canUndo).toBe(false);
	});

	it('keeps station touch toggles separate from the main action touch opener', async () => {
		const { action, station, editing, openDetails } = await mount(makePlan([kanbanTask('A')]));
		touch(station('A'));
		expect(editing.routeId).toBe('A');
		expect(openDetails).not.toHaveBeenCalled();
		touch(station('A'));
		expect(editing.routeId).toBeNull();
		touch(action('A'));
		expect(openDetails).toHaveBeenCalledTimes(1);
		expect(editing.detailsTaskId).toBe('A');
		editing.detailsTaskId = null;
		flushSync();
		expect(editing.routeId).toBeNull();
	});
});

describe('Kanban main action keyboard navigation', () => {
	it('moves within columns, skips empty columns, clamps ordinals and never wraps', async () => {
		const { action, workspace } = await mount(
			makePlan([
				kanbanTask('T1'),
				kanbanTask('T2'),
				kanbanTask('T3'),
				kanbanTask('D1', { status: 'done' }),
				kanbanTask('D2', { status: 'done' })
			])
		);
		action('T1').focus();
		for (const [key, id] of [
			['ArrowUp', 'T1'],
			['ArrowLeft', 'T1'],
			['ArrowDown', 'T2'],
			['End', 'T3'],
			['ArrowDown', 'T3'],
			['ArrowRight', 'D2'],
			['ArrowRight', 'D2'],
			['Home', 'D1'],
			['ArrowUp', 'D1'],
			['ArrowLeft', 'T1'],
			['End', 'T3'],
			['Home', 'T1']
		]) {
			await userEvent.keyboard(`{${key}}`);
			expect(document.activeElement).toBe(action(id));
		}
		expect(workspace.history.canUndo).toBe(false);
	});

	it('retains task focus when an external status command moves the card', async () => {
		const { action, workspace, card } = await mount(makePlan([kanbanTask('A'), kanbanTask('B')]));
		action('A').focus();
		updateTask(workspace, 'A', { status: 'done' });
		flushSync();
		await expect
			.poll(() => card('A').closest<HTMLElement>('[data-column]')?.dataset.column)
			.toBe('done');
		expect(document.activeElement).toBe(action('A'));
	});

	it('moves focus to the next card, then the previous card, then the selected diagram choice on removal', async () => {
		const { action, workspace, screen } = await mount(
			makePlan([kanbanTask('A'), kanbanTask('B'), kanbanTask('C')])
		);
		action('B').focus();
		removeTasks(workspace, ['B']);
		flushSync();
		await expect.poll(() => document.activeElement).toBe(action('C'));
		removeTasks(workspace, ['C']);
		flushSync();
		await expect.poll(() => document.activeElement).toBe(action('A'));
		removeTasks(workspace, ['A']);
		flushSync();
		await expect
			.poll(() => document.activeElement)
			.toBe(screen.container.querySelector('[data-testid="diagram-view-kanban"]'));
	});

	it('keeps actions and station targets in normal Tab order', async () => {
		const { card, action, station } = await mount(makePlan([kanbanTask('A'), kanbanTask('B')]));
		for (const id of ['A', 'B']) {
			expect(action(id).tabIndex).toBe(0);
			expect(station(id).tabIndex).toBe(0);
		}
		const controls = [...card('A').querySelectorAll<HTMLButtonElement>('button')];
		controls[0].focus();
		await userEvent.keyboard('{Tab}');
		expect(document.activeElement).toBe(controls[1]);
		await userEvent.keyboard('{Tab}');
		expect(card('B').contains(document.activeElement)).toBe(true);
	});
});
