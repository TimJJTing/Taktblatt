import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { taskStatusLabel } from '#lib/components/task/task-status.ts';
import '../../../routes/layout.css';
import StatusKey from './StatusKey.svelte';

describe('StatusKey', () => {
	it('lists the four status labels and icons before the readiness explanation', async () => {
		const screen = await render(StatusKey);
		const list = screen.getByRole('list', { name: 'Status' });
		await expect.element(list).toBeVisible();
		const items = [...list.element().querySelectorAll('li')];
		expect(items.map((item) => item.textContent?.trim())).toEqual([
			'Todo',
			'In progress',
			'Done',
			'Canceled'
		]);
		expect(items.map((item) => item.textContent?.trim())).toEqual(
			(['todo', 'in_progress', 'done', 'canceled'] as const).map(taskStatusLabel)
		);
		for (const item of items) expect(item.querySelectorAll('svg')).toHaveLength(1);
		const readiness = screen.getByText(
			'Ready: all dependencies are finished. Blocked: a dependency is not finished.'
		);
		await expect.element(readiness).toBeVisible();
		expect(
			items[items.length - 1].compareDocumentPosition(readiness.element()) &
				Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
	});

	it('renders 16 pixel screen icons and 12 pixel paper icons', async () => {
		const screen = await render(StatusKey);
		const list = screen.getByRole('list', { name: 'Status' });
		await expect.element(list).toBeVisible();
		for (const icon of list.element().querySelectorAll('li svg')) {
			const box = icon.getBoundingClientRect();
			expect(box.width).toBe(16);
			expect(box.height).toBe(16);
		}
		expect(list.element().querySelectorAll('li svg')).toHaveLength(4);
		await screen.rerender({ still: true });
		for (const icon of list.element().querySelectorAll('li svg')) {
			const box = icon.getBoundingClientRect();
			expect(box.width).toBe(12);
			expect(box.height).toBe(12);
		}
		expect(list.element().querySelectorAll('li svg')).toHaveLength(4);
	});
});
