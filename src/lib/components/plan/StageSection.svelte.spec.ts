import { beforeEach, describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { userEvent } from 'vitest/browser';
import { makeTask } from '#lib/domain/test-helpers.ts';
import { HOVER_COLD_MS, HOVER_GRACE_MS } from '#lib/state/route-focus.svelte.ts';
import { EditingState } from '#lib/state/editing.svelte.ts';
import { updateTask } from '#lib/state/commands.ts';
import { render } from 'vitest-browser-svelte';
import { MemoryStorage } from '#lib/state/memory-storage.ts';
import { Workspace } from '#lib/state/workspace.svelte.ts';
import StageSectionTest from './StageSection.test.svelte';

const HOVER_SCHEDULING_MARGIN_MS = 50;

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
				makeTask({
					id: 'b',
					stageId,
					owners: ['Ada'],
					start: '2027-01-10',
					end: '2027-01-15',
					dependsOn: ['a']
				}),
				makeTask({ id: 'other', stageId, start: '2027-01-20', end: '2027-01-22' })
			];
		});
		ws.history.clear();
		return ws;
	}
	const chartRow = (container: Element, id: string) =>
		container.querySelector(`[data-testid="gantt-row"][data-task-id="${id}"]`)!;

	it('keeps pointer row focus below hover and restores it after leave without a Gantt', async () => {
		const ws = workspace(),
			editing = new EditingState();
		const screen = await render(StageSectionTest, { workspace: ws, editing });
		expect(screen.container.querySelector('[data-testid="gantt-row"]')).toBeNull();
		await userEvent.click(
			screen.container.querySelector('tr[data-task-id="b"] [data-testid="task-title"]')!
		);
		expect(document.activeElement?.closest('tr')?.dataset.taskId).toBe('b');
		expect(editing.routeId).toBe('b');
		await userEvent.hover(screen.container.querySelector('tr[data-task-id="other"]')!);
		await expect.poll(() => editing.routeId).toBe('other');
		await userEvent.hover(screen.getByTestId('outside-row'));
		await expect.poll(() => editing.routeId).toBe('b');
		await userEvent.keyboard('{Escape}');
		expect(editing.routeId).toBe('b');
	});

	it('clears Work plan hover and pending input on Escape without a Gantt', async () => {
		const ws = workspace(),
			editing = new EditingState();
		const screen = await render(StageSectionTest, { workspace: ws, editing });
		await userEvent.hover(screen.container.querySelector('tr[data-task-id="a"]')!);
		await expect.poll(() => editing.routeId).toBe('a');
		await userEvent.hover(screen.container.querySelector('tr[data-task-id="other"]')!);
		await userEvent.keyboard('{Escape}');
		expect(editing.routeId).toBeNull();
		await new Promise((resolve) =>
			setTimeout(resolve, HOVER_COLD_MS + HOVER_GRACE_MS + HOVER_SCHEDULING_MARGIN_MS)
		);
		expect(editing.routeId).toBeNull();
	});

	function touchClick(target: Element) {
		target.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
		target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	}

	it.each(['Escape', 'outside touch click'] as const)(
		'clears touch input through %s without a Gantt',
		async (clearBy) => {
			const ws = workspace(),
				editing = new EditingState();
			const screen = await render(StageSectionTest, { workspace: ws, editing });
			// The touch candidate can outlive the view that supplied its mark.
			editing.routeFocus.toggleTouch('a', 'touch-a');
			expect(editing.routeId).toBe('a');
			if (clearBy === 'Escape') await userEvent.keyboard('{Escape}');
			else touchClick(screen.getByTestId('outside-row').element());
			expect(editing.routeId).toBeNull();
		}
	);

	it('keeps row focus and floating ownership when the Gantt unmounts', async () => {
		const ws = workspace(),
			editing = new EditingState();
		const screen = await render(StageSectionTest, { workspace: ws, editing, withGantt: true });
		await userEvent.click(
			screen.container.querySelector('tr[data-task-id="b"] [data-testid="task-title"]')!
		);
		const focusedField = document.activeElement;
		expect(focusedField?.closest('tr')?.dataset.taskId).toBe('b');
		expect(editing.routeId).toBe('b');
		// Remove only the chart. A button click would move the row's focus.
		await screen.rerender({ withGantt: false });
		expect(document.activeElement).toBe(focusedField);
		expect(screen.container.querySelector('[data-testid="gantt-row"]')).toBeNull();
		expect(editing.routeId).toBe('b');
		await userEvent.hover(screen.container.querySelector('tr[data-task-id="other"]')!);
		await expect.poll(() => editing.routeId).toBe('other');
		await userEvent.hover(screen.getByTestId('outside-row'));
		await expect.poll(() => editing.routeId).toBe('b');
		// End the title edit before the pointer click. Refer to spec 5.2.
		await userEvent.keyboard('{Escape}');
		await expect
			.poll(() =>
				screen.container.querySelector('tr[data-task-id="b"] [data-testid="task-title-input"]')
			)
			.toBeNull();
		await expect.poll(() => document.activeElement?.closest('tr')?.dataset.taskId).toBe('b');
		expect(editing.routeId).toBe('b');
		const trigger = screen.container.querySelector(
			'tr[data-task-id="b"] [data-testid="owner-field"]'
		)!;
		await userEvent.click(trigger);
		await expect.poll(() => document.querySelector('[data-testid="owner-input"]')).not.toBeNull();
		const content = document.querySelector('[data-slot="popover-content"]')!;
		await expect.poll(() => content.contains(document.activeElement)).toBe(true);
		await expect.poll(() => content.getAnimations().length).toBe(0);
		await userEvent.hover(screen.getByTestId('outside-row'));
		await new Promise((resolve) =>
			setTimeout(resolve, HOVER_GRACE_MS + HOVER_SCHEDULING_MARGIN_MS)
		);
		expect(editing.routeId).toBe('b');
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => content.isConnected).toBe(false);
		await expect.poll(() => document.activeElement).toBe(trigger);
		expect(editing.routeId).toBe('b');
		await userEvent.click(screen.getByTestId('outside-row'));
		await expect.poll(() => editing.routeId).toBeNull();
		editing.routeFocus.toggleTouch('a', 'touch-a');
		expect(editing.routeId).toBe('a');
		await userEvent.keyboard('{Escape}');
		expect(editing.routeId).toBeNull();
		editing.routeFocus.toggleTouch('a', 'touch-a');
		expect(editing.routeId).toBe('a');
		touchClick(screen.getByTestId('outside-row').element());
		expect(editing.routeId).toBeNull();
	});

	function controlledFloating(container: Element) {
		const trigger = document.createElement('button');
		trigger.textContent = 'Controlled row content';
		trigger.setAttribute('aria-controls', 'controlled-route-content');
		trigger.setAttribute('aria-expanded', 'true');
		container.querySelector('tr[data-task-id="b"] td')!.append(trigger);
		const content = document.createElement('div');
		content.id = 'controlled-route-content';
		const field = document.createElement('input');
		field.setAttribute('aria-label', 'Controlled floating field');
		content.append(field);
		document.body.append(content);
		return { trigger, content, field };
	}

	it('clears floating row focus when focus leaves its content without a Gantt', async () => {
		const ws = workspace(),
			editing = new EditingState();
		const screen = await render(StageSectionTest, { workspace: ws, editing });
		const { trigger, content, field } = controlledFloating(screen.container);
		try {
			await userEvent.click(trigger);
			field.focus();
			expect(document.activeElement).toBe(field);
			await expect.poll(() => editing.routeId).toBe('b');
			await userEvent.hover(screen.getByTestId('outside-row'));
			await new Promise((resolve) =>
				setTimeout(resolve, HOVER_GRACE_MS + HOVER_SCHEDULING_MARGIN_MS)
			);
			expect(editing.routeId).toBe('b');
			(screen.getByTestId('outside-row').element() as HTMLElement).focus();
			await expect.poll(() => editing.routeId).toBeNull();
		} finally {
			content.remove();
			trigger.remove();
		}
	});

	it('removes closed floating ownership when aria-controls remains and retains row focus return', async () => {
		const ws = workspace(),
			editing = new EditingState();
		const screen = await render(StageSectionTest, { workspace: ws, editing, withGantt: true });
		const { trigger, content, field } = controlledFloating(screen.container);
		try {
			await userEvent.click(trigger);
			field.focus();
			await expect.poll(() => editing.routeId).toBe('b');
			await userEvent.hover(screen.getByTestId('outside-row'));
			await new Promise((resolve) =>
				setTimeout(resolve, HOVER_GRACE_MS + HOVER_SCHEDULING_MARGIN_MS)
			);
			// Controlled content can stay mounted during its close animation.
			trigger.setAttribute('aria-expanded', 'false');
			trigger.focus();
			await expect.poll(() => document.activeElement).toBe(trigger);
			expect(trigger.getAttribute('aria-controls')).toBe(content.id);
			expect(content.isConnected).toBe(true);
			expect(editing.routeId).toBe('b');
			(screen.getByTestId('outside-row').element() as HTMLElement).focus();
			await expect.poll(() => editing.routeId).toBeNull();
			// Focus in the remaining closed root must not reclaim the row's route.
			field.focus();
			expect(document.activeElement).toBe(field);
			await expect.poll(() => editing.routeId).toBeNull();
		} finally {
			content.remove();
			trigger.remove();
		}
	});

	it('lights a row from pointer intent without waiting to set linked highlight', async () => {
		const ws = workspace(),
			editing = new EditingState();
		const screen = await render(StageSectionTest, { workspace: ws, editing, withGantt: true });
		const row = screen.container.querySelector('tr[data-task-id="a"]')!;
		// Keep the real pointer outside the synthetic hover target.
		await userEvent.hover(screen.getByTestId('outside-row'));
		row.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
		flushSync();
		expect(editing.highlightId).toBe('a');
		await expect.poll(() => chartRow(screen.container, 'b').getAttribute('data-route')).toBe('lit');
		expect(editing.routeId).toBe('a');
		row.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
		flushSync();
		await expect.poll(() => chartRow(screen.container, 'b').hasAttribute('data-route')).toBe(false);
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
		const other = screen.container.querySelector(
			'[data-task-id="other"] [data-testid="gantt-bar"]'
		)!;
		other.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
		await expect.poll(() => editing.routeId).toBe('other');
		other.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
		await expect.poll(() => editing.routeId).toBe('b');
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
		await new Promise((resolve) => setTimeout(resolve, HOVER_COLD_MS + HOVER_SCHEDULING_MARGIN_MS));
		expect(editing.routeId).toBe('b');
		expect(chartRow(screen.container, 'other').getAttribute('data-route')).toBe('off');
		other.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
		await userEvent.click(screen.getByTestId('outside-row'));
		// Clearing keyboard focus can reveal hover until its leave grace expires.
		await expect.poll(() => editing.routeId).toBeNull();
	});

	it.each([false, true])(
		'clears null-target blur outside the row with Gantt mounted: %s',
		async (withGantt) => {
			const ws = workspace(),
				editing = new EditingState();
			const screen = await render(StageSectionTest, { workspace: ws, editing, withGantt });
			editing.routeFocus.pointerInput('mouse');
			await userEvent.click(
				screen.container.querySelector('tr[data-task-id="b"] [data-testid="task-title"]')!
			);
			expect(editing.routeId).toBe('b');
			const input = document.activeElement as HTMLElement;
			expect(input.closest('tr')?.dataset.taskId).toBe('b');
			// A blur to non-focusable space has no related target and no following focusin.
			input.blur();
			expect(document.activeElement).toBe(document.body);
			await expect.poll(() => editing.routeId).toBeNull();
			const otherRow = screen.container.querySelector('tr[data-task-id="other"]')!;
			otherRow.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
			await expect.poll(() => editing.routeId).toBe('other');
		}
	);

	it('keeps the owner popover and nested menu attached to their row through focus return', async () => {
		const ws = workspace(),
			editing = new EditingState();
		const screen = await render(StageSectionTest, { workspace: ws, editing, withGantt: true });
		const trigger = screen.container.querySelector(
			'tr[data-task-id="b"] [data-testid="owner-field"]'
		)!;
		await userEvent.click(trigger);
		await expect.poll(() => document.querySelector('[data-testid="owner-input"]')).not.toBeNull();
		const input = document.querySelector<HTMLElement>('[data-testid="owner-input"]')!;
		const popover = input.closest('[data-slot="popover-content"]')!;
		await expect.poll(() => popover.contains(document.activeElement)).toBe(true);
		expect(popover.closest('tr')).toBeNull();
		await expect.poll(() => popover.getAnimations().length).toBe(0);
		// Remove incidental row hover. Ownership must survive after leave grace ends.
		await userEvent.hover(screen.getByTestId('outside-row'));
		await new Promise((resolve) =>
			setTimeout(resolve, HOVER_GRACE_MS + HOVER_SCHEDULING_MARGIN_MS)
		);
		expect(editing.routeId).toBe('b');
		expect(chartRow(screen.container, 'a').getAttribute('data-route')).toBe('lit');
		await userEvent.click(popover.querySelector('[data-slot="dropdown-menu-trigger"]')!);
		await expect.poll(() => document.querySelector('[role="menu"]')).not.toBeNull();
		const menu = document.querySelector('[role="menu"]')!;
		await expect.poll(() => menu.contains(document.activeElement)).toBe(true);
		expect(menu.closest('tr')).toBeNull();
		expect(popover.contains(menu)).toBe(false);
		expect(editing.routeId).toBe('b');
		expect(chartRow(screen.container, 'a').getAttribute('data-route')).toBe('lit');
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => document.querySelector('[role="menu"]')).toBeNull();
		await expect.poll(() => popover.contains(document.activeElement)).toBe(true);
		expect(editing.routeId).toBe('b');
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => document.querySelector('[data-testid="owner-input"]')).toBeNull();
		await expect.poll(() => document.activeElement).toBe(trigger);
		expect(editing.routeId).toBe('b');
		await userEvent.click(screen.getByTestId('outside-row'));
		await expect.poll(() => editing.routeId).toBeNull();
	});

	it('promotes pointer focus when ArrowRight moves to another calendar date', async () => {
		const ws = workspace(),
			editing = new EditingState();
		const screen = await render(StageSectionTest, { workspace: ws, editing, withGantt: true });
		await userEvent.click(
			screen.container.querySelector('tr[data-task-id="b"] [data-testid="task-target"]')!
		);
		await expect.poll(() => document.querySelector('[data-slot="popover-content"]')).not.toBeNull();
		const content = document.querySelector('[data-slot="popover-content"]')!;
		await expect.poll(() => content.getAnimations().length).toBe(0);
		const date = content.querySelector('[data-range-calendar-day][data-value="2027-01-12"]')!;
		await userEvent.click(date);
		await expect.poll(() => document.activeElement).toBe(date);
		await userEvent.keyboard('{ArrowRight}');
		await expect.poll(() => document.activeElement).not.toBe(date);
		expect(document.activeElement?.matches('[data-range-calendar-day]')).toBe(true);
		expect((document.activeElement as HTMLElement).dataset.value).toBe('2027-01-13');
		const other = screen.container.querySelector(
			'[data-task-id="other"] [data-testid="gantt-bar"]'
		)!;
		other.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
		await new Promise((resolve) => setTimeout(resolve, HOVER_COLD_MS + HOVER_SCHEDULING_MARGIN_MS));
		expect(editing.routeId).toBe('b');
		expect(chartRow(screen.container, 'other').getAttribute('data-route')).toBe('off');
		other.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
		// A real pointer move closes the bar Hint before Esc reaches the date picker.
		await userEvent.hover(screen.getByTestId('outside-row'));
		await expect.poll(() => document.querySelector('[data-slot="tooltip-content"]')).toBeNull();
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => content.isConnected).toBe(false);
		await expect.poll(() => document.activeElement?.closest('tr')?.dataset.taskId).toBe('b');
		expect(editing.routeId).toBe('b');
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
