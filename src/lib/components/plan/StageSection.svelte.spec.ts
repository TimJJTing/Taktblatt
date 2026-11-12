import { beforeEach, describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { userEvent } from 'vitest/browser';
import { makeTask } from '#lib/domain/test-helpers.ts';
import { EditingState } from '#lib/state/editing.svelte.ts';
import { updateTask } from '#lib/state/commands.ts';
import { render } from 'vitest-browser-svelte';
import { MemoryStorage } from '#lib/state/memory-storage.ts';
import { Workspace } from '#lib/state/workspace.svelte.ts';
import StageSectionTest from './StageSection.test.svelte';

describe('stage heading signs', () => {
	let ws: Workspace;
	beforeEach(() => {
		ws = new Workspace(new MemoryStorage());
		ws.commit((plan) => {
			plan.stages[0].title = 'Prepare';
			plan.stages[0].color = 'blue';
		});
	});

	it('shows S1 with the editable stage title and keeps the color picker', async () => {
		const screen = await render(StageSectionTest, { workspace: ws });
		const heading = screen.container.querySelector('h3')!;
		const badge = heading.querySelector('.stage-badge');
		expect(badge?.textContent?.trim()).toBe('S1');
		expect(badge?.closest('[aria-hidden="true"]')).not.toBeNull();
		await expect.element(screen.getByRole('heading', { level: 3 })).toHaveAccessibleName(/Prepare/);
		await expect.element(screen.getByRole('heading', { level: 3 })).not.toHaveAccessibleName(/S1/);
		await expect.element(screen.getByRole('region')).not.toHaveAccessibleName(/S1/);
		await expect.element(screen.getByTestId('stage-title')).toHaveTextContent('Prepare');
		await screen.getByTestId('stage-color').click();
		await expect.element(screen.getByRole('radiogroup')).toBeVisible();
		await screen.getByRole('radio', { name: 'violet', exact: true }).click();
		expect(ws.plan.stages[0].color).toBe('violet');
		await expect
			.poll(() => document.activeElement)
			.toBe(screen.getByTestId('stage-color').element());
	});
});

describe('Work plan route input', () => {
	function workspace() {
		const ws = new Workspace(new MemoryStorage());
		ws.commit((plan) => {
			const stageId = plan.stages[0].id;
			plan.range = { start: '2027-01-01', end: '2027-01-31' };
			plan.tasks = [
				makeTask({ id: 'a', stageId, start: '2027-01-02', end: '2027-01-05' }),
				makeTask({ id: 'b', stageId, start: '2027-01-10', end: '2027-01-15', dependsOn: ['a'] }),
				makeTask({ id: 'other', stageId, start: '2027-01-20', end: '2027-01-22' })
			];
		});
		ws.history.clear();
		return ws;
	}
	const chartRow = (container: Element, id: string) =>
		container.querySelector(`[data-testid="gantt-row"][data-task-id="${id}"]`)!;

	it('lights a row from pointer intent without waiting to set linked highlight', async () => {
		const ws = workspace(),
			editing = new EditingState();
		const screen = await render(StageSectionTest, { workspace: ws, editing, withGantt: true });
		const row = screen.container.querySelector('tr[data-task-id="a"]')!;
		row.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
		flushSync();
		expect(editing.highlightId).toBe('a');
		await expect.poll(() => chartRow(screen.container, 'b').getAttribute('data-route')).toBe('lit');
		row.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
		flushSync();
		expect(chartRow(screen.container, 'b').hasAttribute('data-route')).toBe(false);
	});

	it('retains pointer edit focus on Esc and follows live dependency edits, undo and redo', async () => {
		const ws = workspace(),
			editing = new EditingState();
		const screen = await render(StageSectionTest, { workspace: ws, editing, withGantt: true });
		const title = screen.container.querySelector(
			'tr[data-task-id="b"] [data-testid="task-title"]'
		) as HTMLElement;
		await userEvent.click(title);
		expect(editing.routeId).toBe('b');
		await userEvent.keyboard('{Escape}');
		expect(editing.routeId).toBe('b');
		updateTask(ws, 'b', { dependsOn: ['other'] });
		flushSync();
		expect(chartRow(screen.container, 'a').getAttribute('data-route')).toBe('off');
		expect(chartRow(screen.container, 'other').getAttribute('data-route')).toBe('lit');
		ws.undo();
		flushSync();
		expect(chartRow(screen.container, 'a').getAttribute('data-route')).toBe('lit');
		ws.redo();
		flushSync();
		expect(chartRow(screen.container, 'other').getAttribute('data-route')).toBe('lit');
		expect(editing.routeId).toBe('b');
	});

	it('promotes focus moved by Tab within a row and rejects hover until focus leaves', async () => {
		const ws = workspace(),
			editing = new EditingState();
		const screen = await render(StageSectionTest, { workspace: ws, editing, withGantt: true });
		await userEvent.click(
			screen.container.querySelector('tr[data-task-id="b"] [data-testid="task-title"]')!
		);
		await userEvent.keyboard('{Escape}');
		await userEvent.tab();
		expect(document.activeElement?.closest('tr')?.getAttribute('data-task-id')).toBe('b');
		const other = screen.container.querySelector(
			'[data-task-id="other"] [data-testid="gantt-bar"]'
		)!;
		other.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
		await new Promise((resolve) => setTimeout(resolve, 150));
		expect(editing.routeId).toBe('b');
		expect(chartRow(screen.container, 'other').getAttribute('data-route')).toBe('off');
		other.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
		await userEvent.click(screen.getByTestId('outside-row'));
		expect(editing.routeId).toBeNull();
	});

	it('keeps row ownership in the status select and date portal, including normal focus return', async () => {
		const ws = workspace(),
			editing = new EditingState();
		const screen = await render(StageSectionTest, { workspace: ws, editing, withGantt: true });
		for (const [testId, contentSelector] of [
			['task-status', '[role="listbox"]'],
			['task-target', '[data-slot="popover-content"]']
		]) {
			const trigger = screen.container.querySelector(
				`tr[data-task-id="b"] [data-testid="${testId}"]`
			)!;
			await userEvent.click(trigger);
			await expect.poll(() => document.querySelector(contentSelector)).not.toBeNull();
			const content = document.querySelector(contentSelector)!;
			expect(content.closest('tr')).toBeNull();
			await expect.poll(() => editing.routeId).toBe('b');
			expect(chartRow(screen.container, 'a').getAttribute('data-route')).toBe('lit');
			await userEvent.keyboard('{Escape}');
			await expect.poll(() => document.querySelector(contentSelector)).toBeNull();
			await expect.poll(() => editing.routeId).toBe('b');
			expect(document.activeElement?.closest('tr')?.getAttribute('data-task-id')).toBe('b');
		}
		await userEvent.click(screen.getByTestId('outside-row'));
		expect(editing.routeId).toBeNull();
	});
});
