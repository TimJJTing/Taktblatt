import '../../../routes/layout.css';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { GEOMETRY_MOTION_MS, motionDuration } from '#lib/motion.ts';
import StageTest from '#lib/components/diagram/DiagramStage.test.svelte';
import TaskStatusIcon from '#lib/components/task/TaskStatusIcon.svelte';
import { createViewRegistry } from '#lib/components/diagram/view-registry.ts';
import { view as gantt } from '#lib/components/timeline/diagram-view.ts';
import { makePlan } from '#lib/domain/test-helpers.ts';
import { familySummary } from '#lib/domain/derive.ts';
import { familySummaryText } from '#lib/components/diagram/family-summary.ts';
import type { Plan } from '#lib/domain/schema.ts';
import { getLocale, overwriteGetLocale } from '#lib/paraglide/runtime.js';
import {
	canceledSubtasks,
	garden,
	isolatedParent,
	kanbanTask,
	longStageTitle,
	unrelatedCycle
} from '#lib/scene/kanban-fixtures.test-helper.ts';
import { removeTasks, updateTask } from '#lib/state/commands.ts';
import { EditingState } from '#lib/state/editing.svelte.ts';
import { MemoryStorage } from '#lib/state/memory-storage.ts';
import { ViewerState } from '#lib/state/viewer.svelte.ts';
import { Workspace } from '#lib/state/workspace.svelte.ts';
import { view as kanban } from './diagram-view.ts';

const originalLocale = getLocale;
let originalViewport: { width: number; height: number };
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('#lib/motion.ts', async (original) => ({
	...(await original<typeof import('#lib/motion.ts')>()),
	motionDuration: (ms: number) => (motion.reduced ? 0 : ms)
}));
beforeEach(async () => {
	originalViewport = { width: window.innerWidth, height: window.innerHeight };
	await page.viewport(1200, 900);
	motion.reduced = false;
	overwriteGetLocale(() => 'en');
});
afterEach(async () => {
	overwriteGetLocale(originalLocale);
	vi.restoreAllMocks();
	await page.viewport(originalViewport.width, originalViewport.height);
});

async function mount(plan: Plan, withDialog = false) {
	const workspace = new Workspace(new MemoryStorage());
	workspace.commit((draft) => Object.assign(draft, plan, { id: draft.id }));
	workspace.history.clear();
	const registry = createViewRegistry([gantt, kanban]);
	const viewer = new ViewerState(new MemoryStorage(), registry.ids);
	viewer.setDiagramView('kanban');
	const editing = new EditingState();
	const openDetails = vi.spyOn(editing, 'openDetails');
	const screen = await render(StageTest, { workspace, viewer, registry, editing, withDialog });
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

describe('Kanban swimlanes', () => {
	it('counts top-level cards across stages and keeps their cells and lane boxes on expansion', async () => {
		const { board, workspace, viewer } = await mount(garden());
		const headings = [...board.querySelectorAll<HTMLElement>('[data-testid="kanban-heading"]')];
		expect(headings.map((heading) => heading.dataset.column)).toEqual([
			'blocked',
			'todo',
			'in_progress',
			'done'
		]);
		expect(
			headings.map((heading) =>
				heading.querySelector('[data-testid="kanban-count"]')?.textContent?.trim()
			)
		).toEqual(['2', '3', '1', '1']);
		const lanes = [...board.querySelectorAll<HTMLElement>('[data-testid="kanban-swimlane"]')];
		expect(lanes).toHaveLength(workspace.plan.stages.length);
		const snapshot = () =>
			lanes.map((lane) =>
				[...lane.querySelectorAll<HTMLElement>('[data-testid="kanban-card"]')].map((card) => ({
					id: card.dataset.diagramTask,
					column: card.closest<HTMLElement>('[data-testid="kanban-cell"]')?.dataset.column,
					rect: card.getBoundingClientRect().toJSON()
				}))
			);
		const before = snapshot();
		expect(before.flat()).toHaveLength(7);
		const parent = workspace.plan.tasks.find((task) => task.title === 'Neighbourhood stall')!;
		flushSync(() => viewer.setExpanded(workspace.plan.id, parent.id, true));
		await expect
			.poll(() => board.querySelectorAll('[data-testid="kanban-item"]').length)
			.toBeGreaterThan(0);
		const after = snapshot();
		expect(after.map((lane) => lane.map(({ id, column }) => ({ id, column })))).toEqual(
			before.map((lane) => lane.map(({ id, column }) => ({ id, column })))
		);
		for (let i = 0; i < before.length; i++)
			for (let j = 0; j < before[i].length; j++) {
				expect(after[i][j].rect.x).toBeCloseTo(before[i][j].rect.x, 0);
				expect(after[i][j].rect.width).toBeCloseTo(before[i][j].rect.width, 0);
				expect(after[i][j].rect.height).toBeCloseTo(before[i][j].rect.height, 0);
			}
		expect(
			headings.map((heading) =>
				heading.querySelector('[data-testid="kanban-count"]')?.textContent?.trim()
			)
		).toEqual(['2', '3', '1', '1']);
	});

	it('aligns stage headings and status tracks, including a long title and empty stage', async () => {
		const { board, workspace } = await mount(longStageTitle());
		const lanes = [...board.querySelectorAll<HTMLElement>('[data-testid="kanban-swimlane"]')];
		expect(lanes.map((lane) => lane.dataset.stage)).toEqual(
			workspace.plan.stages.map((stage) => stage.id)
		);
		const headings = [...board.querySelectorAll<HTMLElement>('[data-testid="kanban-heading"]')];
		expect(headings).toHaveLength(4);
		for (const lane of lanes) {
			const heading = lane.querySelector<HTMLElement>('[data-testid="kanban-stage-heading"]');
			const stem = lane.querySelector<HTMLElement>('[data-testid="kanban-stem"]');
			const title = lane.querySelector<HTMLElement>('[data-testid="kanban-stage-title"]');
			const badge = heading?.querySelector<HTMLElement>('.stage-badge');
			expect(heading && stem && title && badge).toBeTruthy();
			const cells = [...lane.querySelectorAll<HTMLElement>('[data-testid="kanban-cell"]')];
			expect(cells).toHaveLength(4);
			expect(
				Math.abs(badge!.getBoundingClientRect().left - stem!.getBoundingClientRect().left)
			).toBeLessThanOrEqual(0.5);
			expect(stem!.getBoundingClientRect().width).toBeCloseTo(4, 1);
			expect(title!.getBoundingClientRect().left).toBeGreaterThanOrEqual(
				stem!.getBoundingClientRect().right
			);
			expect(title!.getBoundingClientRect().right).toBeLessThanOrEqual(
				cells[0].getBoundingClientRect().left + 1
			);
			for (let i = 0; i < 4; i++) {
				expect(
					Math.abs(cells[i].getBoundingClientRect().left - headings[i].getBoundingClientRect().left)
				).toBeLessThanOrEqual(1);
				expect(
					Math.abs(
						cells[i].getBoundingClientRect().width - headings[i].getBoundingClientRect().width
					)
				).toBeLessThanOrEqual(1);
			}
		}
		const title = lanes[0].querySelector<HTMLElement>('[data-testid="kanban-stage-title"]')!;
		expect(lanes[0].querySelector('[data-testid="kanban-stage-count"]')?.textContent?.trim()).toBe(
			'Tasks: 1'
		);
		expect(lanes[1].querySelector('[data-testid="kanban-stage-count"]')?.textContent?.trim()).toBe(
			'Tasks: 0'
		);
		expect(title.getBoundingClientRect().height).toBeGreaterThan(
			parseFloat(getComputedStyle(title).lineHeight) * 1.5
		);
		expect(lanes[1].querySelector('[data-testid="kanban-stage-empty"]')?.textContent).toContain(
			'No tasks in this stage'
		);
		expect(
			lanes[0]
				.querySelector<HTMLElement>('[data-testid="kanban-cell"][data-column="done"]')
				?.textContent?.trim()
		).toBe('');
	});

	it('names blocked and canceled items with stage and status context even during route focus', async () => {
		const plan = isolatedParent(true);
		plan.stages[0].title = 'Design';
		plan.tasks.push(kanbanTask('X', { parentId: 'P', status: 'canceled' }));
		const { board, action, viewer, workspace } = await mount(plan);
		expect(board.querySelector('[data-testid="kanban-family"]')).not.toBeNull();
		flushSync(() => viewer.setExpanded(workspace.plan.id, 'P', true));
		const blocked = 'Open task details for C2. Subtask of P. S1 and Design. Todo and Blocked';
		const canceled = 'Open task details for X. Subtask of P. S1 and Design. Canceled';
		await expect.element(action('C2')).toHaveAccessibleName(blocked);
		await expect.element(action('X')).toHaveAccessibleName(canceled);
		action('C2').focus();
		await expect
			.poll(() => board.querySelectorAll('[data-testid="kanban-dependency"]').length)
			.toBe(1);
		await expect.element(action('C2')).toHaveAccessibleName(blocked);
		await expect.element(action('X')).toHaveAccessibleName(canceled);
	});

	it('renders the effective parent status glyph and updates it after a child status change', async () => {
		motion.reduced = true;
		const plan = canceledSubtasks();
		plan.tasks.find((task) => task.id === 'A')!.status = 'in_progress';
		const { board, workspace } = await mount(plan);
		const card = () =>
			board.querySelector<HTMLElement>('[data-testid="kanban-card"][data-diagram-task="P"]')!;
		expect(card()).not.toBeNull();
		expect(card().closest<HTMLElement>('[data-testid="kanban-cell"]')?.dataset.column).toBe(
			'in_progress'
		);
		const glyph = () => card().querySelector<SVGElement>('[data-diagram-station="P"] svg')!;
		expect(glyph()).not.toBeNull();
		expect(glyph().getBoundingClientRect().width).toBeCloseTo(16, 1);
		expect(glyph().getBoundingClientRect().height).toBeCloseTo(16, 1);
		const inProgressReference = await render(TaskStatusIcon, { status: 'in_progress' });
		const geometry = (svg: SVGElement) =>
			[...svg.children].map((node) => ({
				tag: node.tagName,
				path: node.getAttribute('d'),
				cx: node.getAttribute('cx'),
				cy: node.getAttribute('cy'),
				r: node.getAttribute('r')
			}));
		expect(geometry(glyph())).toEqual(
			geometry(inProgressReference.container.querySelector('svg')!)
		);
		const filled = glyph().querySelector<SVGPathElement>('path');
		expect(filled).not.toBeNull();
		expect(getComputedStyle(filled!).fill).toBe(getComputedStyle(glyph()).color);
		expect(glyph().querySelector('circle')).not.toBeNull();
		const contrastPath = filled!.getAttribute('d');
		flushSync(() => updateTask(workspace, 'A', { status: 'done' }));
		expect(card().closest<HTMLElement>('[data-testid="kanban-cell"]')?.dataset.column).toBe('done');
		const donePath = glyph().querySelector('path');
		const doneReference = await render(TaskStatusIcon, { status: 'done' });
		expect(geometry(glyph())).toEqual(geometry(doneReference.container.querySelector('svg')!));
		expect(glyph().querySelector('circle')).not.toBeNull();
		expect(donePath).not.toBeNull();
		expect(donePath!.getAttribute('d')).not.toBe(contrastPath);
		expect(getComputedStyle(donePath!).fill).toBe('none');
	});

	it('sizes cards to short and two-line titles without a fixed height', async () => {
		const plan = makePlan([
			kanbanTask('short', { title: 'Short' }),
			kanbanTask('long', {
				title: 'A long title with enough words to wrap across two lines in this status track'
			})
		]);
		const { board, action } = await mount(plan);
		const short = board.querySelector<HTMLElement>(
			'[data-testid="kanban-card"][data-diagram-task="short"]'
		);
		const long = board.querySelector<HTMLElement>(
			'[data-testid="kanban-card"][data-diagram-task="long"]'
		);
		expect(short && long).toBeTruthy();
		const label = [...action('long').querySelectorAll<HTMLElement>('*')].find(
			(node) => node.textContent === plan.tasks[1].title
		)!;
		const lineHeight = parseFloat(getComputedStyle(label).lineHeight);
		expect(label.getBoundingClientRect().height).toBeGreaterThan(lineHeight * 1.5);
		expect(label.getBoundingClientRect().height).toBeLessThanOrEqual(lineHeight * 2 + 1);
		expect(long!.getBoundingClientRect().height).toBeGreaterThan(
			short!.getBoundingClientRect().height
		);
		for (const card of [short!, long!]) {
			const cell = card
				.closest<HTMLElement>('[data-testid="kanban-cell"]')!
				.getBoundingClientRect();
			const bounds = card.getBoundingClientRect();
			expect(bounds.left).toBeGreaterThanOrEqual(cell.left - 1);
			expect(bounds.right).toBeLessThanOrEqual(cell.right + 1);
		}
	});

	it('shows the family summary and all ordered items, including canceled', async () => {
		const { board, workspace, viewer, action } = await mount(canceledSubtasks());
		const card = board.querySelector<HTMLElement>(
			'[data-testid="kanban-card"][data-diagram-task="P"]'
		);
		expect(card).not.toBeNull();
		const summary = familySummaryText(familySummary(workspace.index, 'P'), getLocale());
		expect(card!.querySelector('[data-testid="kanban-card-summary"]')?.textContent?.trim()).toBe(
			summary
		);
		await expect.element(action('P')).toHaveAccessibleDescription(new RegExp(summary));
		const row = board.querySelector<HTMLElement>('[data-testid="kanban-family"][data-parent="P"]');
		expect(row).not.toBeNull();
		expect(row!.textContent).toContain('Subtasks: 3');
		const toggle = row!.querySelector<HTMLButtonElement>('[data-testid="kanban-family-toggle"]');
		expect(toggle?.tagName).toBe('BUTTON');
		await expect.element(toggle!).toHaveAccessibleName('Expand P');
		expect(toggle!.getAttribute('aria-expanded')).toBe('false');
		const box = toggle!.getBoundingClientRect();
		expect(box.width).toBeGreaterThanOrEqual(24);
		expect(box.height).toBeGreaterThanOrEqual(24);
		const originalPlan = JSON.stringify(workspace.plan);
		await userEvent.click(toggle!);
		expect(document.activeElement).toBe(toggle);
		expect(viewer.isExpanded(workspace.plan.id, 'P')).toBe(true);
		expect(workspace.history.canUndo).toBe(false);
		expect(JSON.stringify(workspace.plan)).toBe(originalPlan);
		expect(toggle!.getAttribute('aria-expanded')).toBe('true');
		await expect.element(toggle!).toHaveAccessibleName('Collapse P');
		const detail = row!.querySelector<HTMLElement>('[data-testid="kanban-family-detail"]');
		expect(detail?.tagName).toBe('UL');
		expect(toggle!.getAttribute('aria-controls')).toBe(detail!.id);
		const items = [...detail!.querySelectorAll<HTMLElement>('[data-testid="kanban-item"]')];
		expect(items.map((item) => item.dataset.diagramTask)).toEqual(['A', 'B', 'X']);
		for (const [i, state] of ['Todo', 'Done', 'Canceled'].entries()) {
			expect(items[i].dataset.diagramParent).toBe('P');
			expect(items[i].querySelector('[data-testid="kanban-item-state"]')?.textContent).toContain(
				state
			);
			const mark = items[i].querySelector<HTMLElement>('[data-diagram-station]');
			expect(mark?.getBoundingClientRect().width).toBeCloseTo(16, 1);
			expect(mark?.getBoundingClientRect().height).toBeCloseTo(16, 1);
			expect(mark?.querySelector('svg circle')).not.toBeNull();
			if (i === 1) expect(mark?.querySelector('svg path')).not.toBeNull();
			if (i === 2) expect(mark?.querySelector('svg line')).not.toBeNull();
			await expect
				.element(items[i].querySelector<HTMLButtonElement>('[data-diagram-label]')!)
				.toHaveAccessibleName(new RegExp(`P.*${state}`));
		}
		expect(card!.querySelector('[data-testid="kanban-card-summary"]')?.textContent?.trim()).toBe(
			summary
		);
		for (const key of ['Enter', ' ']) {
			await userEvent.keyboard(key === 'Enter' ? '{Enter}' : key);
			expect(document.activeElement).toBe(toggle);
		}
	});

	it('distinguishes no tasks from all canceled and keeps empty lanes', async () => {
		const empty = await mount(makePlan([]));
		const text = empty.board.querySelector('[data-testid="kanban-empty"]')?.textContent;
		expect(text).toMatch(/no tasks/i);
		expect(empty.board.querySelector('[data-testid="kanban-stage-empty"]')?.textContent).toMatch(
			/no tasks in this stage/i
		);
		empty.screen.unmount();
		const canceled = await mount(makePlan([kanbanTask('Z', { status: 'canceled' })]));
		expect(canceled.board.querySelector('[data-testid="kanban-empty"]')?.textContent).toMatch(
			/canceled/i
		);
		expect(canceled.board.querySelectorAll('[data-testid="kanban-card"]')).toHaveLength(0);
	});

	it('marks card signs and scrollers and exposes the shared status key', async () => {
		const { board, action, station } = await mount(isolatedParent());
		const card = board.querySelector<HTMLElement>(
			'[data-testid="kanban-card"][data-diagram-task="P"]'
		);
		expect(card).not.toBeNull();
		for (const id of ['kanban-scroll', 'kanban-strip']) {
			const region = board.querySelector<HTMLElement>(`[data-testid="${id}"]`);
			expect(region?.hasAttribute('data-diagram-scroller')).toBe(true);
			await expect.element(region!).toHaveAccessibleName(/.+/);
		}
		expect(action('P').tagName).toBe('BUTTON');
		expect(action('P').dataset.routeFocus).toBe('keyboard');
		const mark = card!.querySelector<HTMLElement>('[data-diagram-station="P"]');
		expect(mark?.getBoundingClientRect().width).toBeCloseTo(16, 1);
		expect(mark?.getBoundingClientRect().height).toBeCloseTo(16, 1);
		expect(station('P').hasAttribute('data-diagram-station')).toBe(false);
		await expect.element(station('P')).toHaveAccessibleName('Show dependency route for P');
		expect(board.querySelector('details')).toBeNull();
		expect(board.textContent).not.toContain('›');
		const key = board.querySelector<HTMLElement>('[aria-label="Status"]');
		expect(key).not.toBeNull();
		expect([...key!.querySelectorAll('li')].map((li) => li.textContent?.trim())).toEqual([
			'Todo',
			'In progress',
			'Done',
			'Canceled'
		]);
		expect(board.textContent).toMatch(/ready/i);
	});

	it('names and describes cards with stage, status and missing metadata', async () => {
		const plan = makePlan([kanbanTask('A')]);
		plan.stages[0].title = 'Design';
		const { board, action } = await mount(plan);
		expect(board.querySelector('[data-testid="kanban-card"]')).not.toBeNull();
		for (const text of [/Open task details for A/, /S1/, /Design/, /Todo/])
			await expect.element(action('A')).toHaveAccessibleName(text);
		for (const text of [/No owners/, /No dates/, /Ready/])
			await expect.element(action('A')).toHaveAccessibleDescription(text);
		expect(board.textContent).toContain('No owners');
		expect(board.textContent).toContain('No dates');
	});

	it('returns focus to a parent when viewer state collapses its focused item', async () => {
		const { board, action, viewer, workspace } = await mount(isolatedParent());
		expect(board.querySelector('[data-testid="kanban-family"]')).not.toBeNull();
		flushSync(() => viewer.setExpanded(workspace.plan.id, 'P', true));
		action('C1').focus();
		flushSync(() => viewer.setExpanded(workspace.plan.id, 'P', false));
		await expect.poll(() => document.activeElement).toBe(action('P'));
	});
});

describe('swimlane keyboard navigation', () => {
	it('navigates example cards by column and by nonempty cell, without moving from family controls', async () => {
		const plan = garden();
		const id = (title: string) => plan.tasks.find((task) => task.title === title)!.id;
		const { board, action, station, viewer, workspace } = await mount(plan);
		expect(board.querySelectorAll('[data-testid="kanban-swimlane"]')).toHaveLength(3);
		flushSync(() => viewer.setExpanded(workspace.plan.id, id('Neighbourhood stall'), true));
		action(id('Order seeds')).focus();
		for (const [key, title] of [
			['ArrowDown', 'Watering rota'],
			['ArrowDown', 'Neighbourhood stall'],
			['ArrowDown', 'Neighbourhood stall'],
			['Home', 'Order seeds'],
			['End', 'Neighbourhood stall'],
			['ArrowUp', 'Watering rota'],
			['ArrowLeft', 'Sowing'],
			['ArrowRight', 'Watering rota'],
			['Home', 'Order seeds'],
			['ArrowLeft', 'Order seeds'],
			['ArrowRight', 'Soil preparation'],
			['ArrowRight', 'Site survey'],
			['ArrowRight', 'Site survey']
		]) {
			await userEvent.keyboard(`{${key}}`);
			expect(document.activeElement).toBe(action(id(title)));
		}
		const family = board.querySelector<HTMLElement>(
			`[data-testid="kanban-family"][data-parent="${id('Neighbourhood stall')}"]`
		)!;
		const toggle = family.querySelector<HTMLButtonElement>('[data-testid="kanban-family-toggle"]')!;
		for (const target of [station(id('Order seeds')), toggle, action(id('Book a table'))]) {
			target.focus();
			await userEvent.keyboard('{ArrowDown}{ArrowRight}{Home}{End}');
			expect(document.activeElement).toBe(target);
		}
	});
});

describe('family focus recovery', () => {
	it('returns to the parent after deleting an item in its dialog', async () => {
		const { board, action, viewer, workspace } = await mount(isolatedParent(), true);
		expect(board.querySelector('[data-testid="kanban-family"]')).not.toBeNull();
		flushSync(() => viewer.setExpanded(workspace.plan.id, 'P', true));
		await userEvent.click(action('C1'));
		await expect.element(page.getByTestId('task-dialog')).toBeVisible();
		await userEvent.click(page.getByRole('button', { name: 'Delete…' }));
		await userEvent.click(page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }));
		await expect.poll(() => document.activeElement).toBe(action('P'));
	});

	it('returns to the parent when creation of a focused item is undone', async () => {
		const { board, action, viewer, workspace } = await mount(isolatedParent());
		expect(board.querySelector('[data-testid="kanban-family"]')).not.toBeNull();
		flushSync(() => viewer.setExpanded(workspace.plan.id, 'P', true));
		workspace.commit((plan) => plan.tasks.push(kanbanTask('new-child', { parentId: 'P' })));
		flushSync();
		action('new-child').focus();
		workspace.undo();
		flushSync();
		await expect.poll(() => document.activeElement).toBe(action('P'));
	});

	it('clamps a long title while retaining its accessible name', async () => {
		const title = 'W'.repeat(512);
		const { board, action } = await mount(makePlan([kanbanTask('long', { title })]));
		const card = board.querySelector<HTMLElement>('[data-testid="kanban-card"]');
		expect(card).not.toBeNull();
		await expect.element(action('long')).toHaveAccessibleName(new RegExp(title));
		const label = [...action('long').querySelectorAll<HTMLElement>('*')].find(
			(node) => node.textContent === title
		);
		expect(label).toBeDefined();
		const style = getComputedStyle(label!);
		expect(style.webkitLineClamp).toBe('2');
		expect(label!.getBoundingClientRect().height).toBeLessThanOrEqual(
			parseFloat(style.lineHeight) * 2 + 1
		);
	});
});

describe('swimlane signs and order', () => {
	it('tabs through cards, then the family and its items, then the next stage', async () => {
		const plan = garden();
		const id = (title: string) => plan.tasks.find((task) => task.title === title)!.id;
		const { board, action, station, viewer, workspace } = await mount(plan);
		expect(board.querySelectorAll('[data-testid="kanban-swimlane"]')).toHaveLength(3);
		flushSync(() => {
			viewer.setExpanded(workspace.plan.id, id('Soil preparation'), true);
			viewer.setExpanded(workspace.plan.id, id('Neighbourhood stall'), true);
		});
		const toggle = board.querySelector<HTMLButtonElement>(
			`[data-testid="kanban-family"][data-parent="${id('Soil preparation')}"] [data-testid="kanban-family-toggle"]`
		)!;
		const order = [
			action(id('Order seeds')),
			station(id('Order seeds')),
			action(id('Soil preparation')),
			station(id('Soil preparation')),
			action(id('Site survey')),
			station(id('Site survey')),
			toggle,
			action(id('Soil test')),
			action(id('Add compost')),
			action(id('Sowing'))
		];
		order[0].focus();
		for (const next of order.slice(1)) {
			await userEvent.keyboard('{Tab}');
			expect(document.activeElement).toBe(next);
		}
		const stallToggle = board.querySelector<HTMLButtonElement>(
			`[data-testid="kanban-family"][data-parent="${id('Neighbourhood stall')}"] [data-testid="kanban-family-toggle"]`
		)!;
		const stallOrder = [
			action(id('First harvest')),
			station(id('First harvest')),
			action(id('Neighbourhood stall')),
			station(id('Neighbourhood stall')),
			stallToggle,
			action(id('Book a table')),
			action(id('Make signs'))
		];
		stallOrder[0].focus();
		for (const next of stallOrder.slice(1)) {
			await userEvent.keyboard('{Tab}');
			expect(document.activeElement).toBe(next);
		}
	});

	it('shows ready lights, full descriptions and the readiness key', async () => {
		const plan = makePlan([
			kanbanTask('A', { owners: ['Ada', 'Lin'], start: '2027-01-03', end: '2027-01-04' }),
			kanbanTask('B', { dependsOn: ['A'] })
		]);
		const { board, action } = await mount(plan);
		expect(board.querySelectorAll('[data-testid="kanban-card"]')).toHaveLength(2);
		const a = board.querySelector<HTMLElement>(
			'[data-testid="kanban-card"][data-diagram-task="A"]'
		)!;
		const b = board.querySelector<HTMLElement>(
			'[data-testid="kanban-card"][data-diagram-task="B"]'
		)!;
		expect(a.querySelector('[data-testid="ready-dot"]')).not.toBeNull();
		expect(b.querySelector('[data-testid="ready-dot"]')).toBeNull();
		await expect.element(action('A')).toHaveAccessibleDescription(/Ada.*Lin/);
		await expect.element(action('A')).toHaveAccessibleDescription(/Jan.*3.*4.*2027/);
		await expect.element(action('A')).toHaveAccessibleDescription(/Ready/);
		const key = board.querySelector<HTMLElement>('ul[aria-label="Status"]');
		expect(key).not.toBeNull();
		expect(key!.nextElementSibling?.textContent).toBe(
			'Ready: all dependencies are finished. Blocked: a dependency is not finished.'
		);
	});

	it('keeps all card boxes in the expanded lane fixed in both directions and shifts the next lane', async () => {
		motion.reduced = true;
		const plan = garden();
		const parent = plan.tasks.find((task) => task.title === 'Soil preparation')!;
		const { board, viewer, workspace } = await mount(plan);
		const lanes = [...board.querySelectorAll<HTMLElement>('[data-testid="kanban-swimlane"]')];
		expect(lanes).toHaveLength(3);
		const rects = () =>
			[...lanes[0].querySelectorAll<HTMLElement>('[data-testid="kanban-card"]')].map((card) => {
				const { x, y, width, height } = card.getBoundingClientRect();
				return {
					x,
					y,
					width,
					height,
					id: card.dataset.diagramTask,
					cell: card.closest<HTMLElement>('[data-testid="kanban-cell"]')?.dataset.column
				};
			});
		const before = rects();
		const nextTop = lanes[1].getBoundingClientRect().top;
		flushSync(() => viewer.setExpanded(workspace.plan.id, parent.id, true));
		expect(rects()).toEqual(before);
		expect(lanes[1].getBoundingClientRect().top).toBeGreaterThan(nextTop);
		flushSync(() => viewer.setExpanded(workspace.plan.id, parent.id, false));
		expect(rects()).toEqual(before);
		expect(lanes[1].getBoundingClientRect().top).toBeCloseTo(nextTop, 0);
		expect(
			[...board.querySelectorAll('[data-testid="kanban-count"]')].map((node) =>
				node.textContent?.trim()
			)
		).toEqual(['2', '3', '1', '1']);
	});
});

describe('swimlane route projection', () => {
	const paint = (board: HTMLElement, id: string) => {
		const node = board.querySelector<HTMLElement>(`[data-diagram-task="${id}"]`)!;
		const icon = node.querySelector<SVGElement>(`[data-diagram-station="${id}"] svg`)!;
		return { border: getComputedStyle(node).borderLeftColor, icon: getComputedStyle(icon).color };
	};
	const edges = (board: HTMLElement) =>
		[...board.querySelectorAll<HTMLElement>('[data-testid="kanban-dependency"]')]
			.map((edge) => `${edge.dataset.from}->${edge.dataset.to}`)
			.sort();

	it('projects parent input collapsed and a child route expanded', async () => {
		motion.reduced = true;
		const { board, action, viewer, workspace } = await mount(isolatedParent(true));
		expect(board.querySelector('[data-testid="kanban-family"]')).not.toBeNull();
		expect(edges(board)).toEqual([]);
		const p = paint(board, 'P');
		const u = paint(board, 'U');
		action('P').focus();
		await expect.poll(() => paint(board, 'U')).not.toEqual(u);
		expect(paint(board, 'P')).toEqual(p);
		expect(paint(board, 'U').border).not.toBe(u.border);
		expect(paint(board, 'U').icon).not.toBe(u.icon);
		expect(edges(board)).toEqual([]);
		(board.querySelector('[data-testid="kanban-family-toggle"]') as HTMLElement).focus();
		await expect.poll(() => paint(board, 'U')).toEqual(u);
		flushSync(() => viewer.setExpanded(workspace.plan.id, 'P', true));
		const baseline = Object.fromEntries(['P', 'U', 'C1', 'C2'].map((id) => [id, paint(board, id)]));
		action('C2').focus();
		await expect.poll(() => edges(board)).toEqual(['C1->C2']);
		for (const id of ['C1', 'C2']) expect(paint(board, id)).toEqual(baseline[id]);
		for (const id of ['P', 'U']) {
			expect(paint(board, id).border).not.toBe(baseline[id].border);
			expect(paint(board, id).icon).not.toBe(baseline[id].icon);
		}
	});

	it('limits unrelated routes and paints cycle connectors as warnings', async () => {
		motion.reduced = true;
		const { board, action, screen } = await mount(unrelatedCycle());
		expect(board.querySelectorAll('[data-testid="kanban-card"]')).toHaveLength(4);
		expect(edges(board)).toEqual([]);
		const baseline = Object.fromEntries(['A', 'B', 'X', 'Y'].map((id) => [id, paint(board, id)]));
		action('A').focus();
		await expect.poll(() => edges(board)).toEqual(['A->B']);
		for (const id of ['A', 'B']) expect(paint(board, id)).toEqual(baseline[id]);
		for (const id of ['X', 'Y']) {
			expect(paint(board, id).border).not.toBe(baseline[id].border);
			expect(paint(board, id).icon).not.toBe(baseline[id].icon);
		}
		action('X').focus();
		await expect.poll(() => edges(board)).toEqual(['X->Y', 'Y->X']);
		for (const line of board.querySelectorAll<SVGElement>('[data-testid="kanban-dependency"]')) {
			expect(line.getAttribute('data-cycle')).toBe('true');
			expect(getComputedStyle(line).strokeDasharray).toBe('1px, 4px');
			expect(getComputedStyle(line).strokeLinecap).toBe('round');
		}
		(screen.container.querySelector('[data-testid="outside"]') as HTMLElement).focus();
		await expect.poll(() => edges(board)).toEqual([]);
	});
});

describe('swimlane motion', () => {
	const finishAnimations = () => {
		for (const animation of document.getAnimations()) {
			if (
				animation.playState !== 'finished' &&
				animation.effect?.getComputedTiming().endTime !== Infinity
			)
				animation.finish();
		}
	};
	const animationsFor = (element: Element) =>
		document.getAnimations().filter((animation) => {
			const target = (animation.effect as KeyframeEffect | null)?.target;
			return target instanceof Element && (target === element || element.contains(target));
		});
	it('animates a card move and the lane shift and transitions family detail in and out', async () => {
		const plan = garden();
		const parent = plan.tasks.find((task) => task.title === 'Soil preparation')!;
		const moving = plan.tasks.find((task) => task.title === 'Order seeds')!;
		const { board, workspace, viewer } = await mount(plan);
		const lanes = [...board.querySelectorAll<HTMLElement>('[data-testid="kanban-swimlane"]')];
		expect(lanes).toHaveLength(3);
		finishAnimations();
		const captured: { target: Element; animation: Animation }[] = [];
		const nativeAnimate = Element.prototype.animate;
		vi.spyOn(Element.prototype, 'animate').mockImplementation(function (
			this: Element,
			keyframes,
			options
		) {
			const animation = nativeAnimate.call(this, keyframes, options);
			animation.pause();
			captured.push({ target: this, animation });
			return animation;
		});
		const cardFor = () =>
			board.querySelector<HTMLElement>(
				`[data-testid="kanban-card"][data-diagram-task="${moving.id}"]`
			)!;
		const originalX = cardFor().getBoundingClientRect().x;
		flushSync(() => updateTask(workspace, moving.id, { status: 'done' }));
		const geometryFor = (target: Element) =>
			captured.find(
				(entry) =>
					entry.target === target &&
					entry.animation.effect?.getTiming().duration === motionDuration(GEOMETRY_MOTION_MS)
			)?.animation;
		await expect.poll(() => !!geometryFor(cardFor())).toBe(true);
		const movingAnimation = geometryFor(cardFor())!;
		movingAnimation.currentTime = 0;
		const startX = cardFor().getBoundingClientRect().x;
		movingAnimation.currentTime = GEOMETRY_MOTION_MS / 2;
		const middleX = cardFor().getBoundingClientRect().x;
		movingAnimation.currentTime = GEOMETRY_MOTION_MS;
		const finalX = cardFor().getBoundingClientRect().x;
		expect(startX).toBeCloseTo(originalX, 0);
		expect(finalX).toBeGreaterThan(startX + 10);
		expect(middleX).toBeGreaterThan(startX);
		expect(middleX).toBeLessThan(finalX);
		movingAnimation.finish();
		expect(cardFor().getBoundingClientRect().x).toBeCloseTo(finalX, 0);
		finishAnimations();
		captured.length = 0;
		const originalLaneY = lanes[1].getBoundingClientRect().y;
		flushSync(() => viewer.setExpanded(workspace.plan.id, parent.id, true));
		const detail = board.querySelector<HTMLElement>('[data-testid="kanban-family-detail"]');
		expect(detail).not.toBeNull();
		const detailFade = async () => {
			await expect
				.poll(() =>
					captured.some(
						(entry) => entry.target === detail && entry.animation.effect?.getTiming().duration === 0
					)
				)
				.toBe(true);
			for (const entry of captured.filter(
				(entry) => entry.target === detail && entry.animation.effect?.getTiming().duration === 0
			))
				entry.animation.finish();
			await expect
				.poll(() =>
					captured.some(
						(entry) =>
							entry.target === detail && Number(entry.animation.effect?.getTiming().duration) > 0
					)
				)
				.toBe(true);
			return captured.find(
				(entry) =>
					entry.target === detail && Number(entry.animation.effect?.getTiming().duration) > 0
			)!.animation;
		};
		const enter = await detailFade();
		await expect.poll(() => !!geometryFor(lanes[1])).toBe(true);
		const laneAnimation = geometryFor(lanes[1])!;
		laneAnimation.currentTime = 0;
		const laneStart = lanes[1].getBoundingClientRect().y;
		laneAnimation.currentTime = GEOMETRY_MOTION_MS / 2;
		const laneMiddle = lanes[1].getBoundingClientRect().y;
		laneAnimation.currentTime = GEOMETRY_MOTION_MS;
		const laneEnd = lanes[1].getBoundingClientRect().y;
		expect(laneStart).toBeCloseTo(originalLaneY, 0);
		expect(laneEnd).toBeGreaterThan(laneStart);
		expect(laneMiddle).toBeGreaterThan(laneStart);
		expect(laneMiddle).toBeLessThan(laneEnd);
		enter.currentTime = 0;
		const enteringStart = Number(getComputedStyle(detail!).opacity);
		enter.currentTime = Number(enter.effect!.getTiming().duration) / 2;
		const enteringMiddle = Number(getComputedStyle(detail!).opacity);
		enter.currentTime = Number(enter.effect!.getTiming().duration);
		const enteringEnd = Number(getComputedStyle(detail!).opacity);
		expect(enteringStart).toBeLessThan(enteringMiddle);
		expect(enteringMiddle).toBeLessThan(enteringEnd);
		enter.finish();
		laneAnimation.finish();
		expect(lanes[1].getBoundingClientRect().y).toBeCloseTo(laneEnd, 0);
		captured.length = 0;
		flushSync(() => viewer.setExpanded(workspace.plan.id, parent.id, false));
		const leave = await detailFade();
		leave.currentTime = 0;
		const leavingStart = Number(getComputedStyle(detail!).opacity);
		leave.currentTime = Number(leave.effect!.getTiming().duration) / 2;
		const leavingMiddle = Number(getComputedStyle(detail!).opacity);
		leave.currentTime = Number(leave.effect!.getTiming().duration);
		const leavingEnd = Number(getComputedStyle(detail!).opacity);
		expect(leavingStart).toBeGreaterThan(leavingMiddle);
		expect(leavingMiddle).toBeGreaterThan(leavingEnd);
		leave.finish();
		await expect.poll(() => !!geometryFor(lanes[1])).toBe(true);
		const collapse = geometryFor(lanes[1])!;
		collapse.currentTime = GEOMETRY_MOTION_MS;
		collapse.finish();
		expect(lanes[1].getBoundingClientRect().y).toBeCloseTo(originalLaneY, 0);
	});

	it('moves cards and lanes immediately without animations when motion is reduced', async () => {
		motion.reduced = true;
		const plan = garden();
		const parent = plan.tasks.find((task) => task.title === 'Soil preparation')!;
		const moving = plan.tasks.find((task) => task.title === 'Order seeds')!;
		const { board, workspace, viewer } = await mount(plan);
		const lanes = [...board.querySelectorAll<HTMLElement>('[data-testid="kanban-swimlane"]')];
		expect(lanes).toHaveLength(3);
		finishAnimations();
		flushSync(() => updateTask(workspace, moving.id, { status: 'done' }));
		const card = board.querySelector<HTMLElement>(
			`[data-testid="kanban-card"][data-diagram-task="${moving.id}"]`
		)!;
		expect(card.closest<HTMLElement>('[data-testid="kanban-cell"]')?.dataset.column).toBe('done');
		const before = lanes[1].getBoundingClientRect().top;
		flushSync(() => viewer.setExpanded(workspace.plan.id, parent.id, true));
		expect(lanes[1].getBoundingClientRect().top).toBeGreaterThan(before);
		await new Promise(requestAnimationFrame);
		expect(animationsFor(board)).toHaveLength(0);
		flushSync(() => viewer.setExpanded(workspace.plan.id, parent.id, false));
		expect(lanes[1].getBoundingClientRect().top).toBeCloseTo(before, 0);
		await new Promise(requestAnimationFrame);
		expect(animationsFor(board)).toHaveLength(0);
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

	it('moves focus to the selected diagram choice on removal', async () => {
		const { action, workspace, screen } = await mount(
			makePlan([kanbanTask('A'), kanbanTask('B'), kanbanTask('C')])
		);
		action('B').focus();
		removeTasks(workspace, ['B']);
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
