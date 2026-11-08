import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { ISODate } from '#lib/domain/date.ts';
import { formatDate } from '#lib/domain/format.ts';
import { m } from '#lib/paraglide/messages.js';
import { uiIntl } from '#lib/ui-language.ts';
import DateRangeFieldTest from './DateRangeField.test.svelte';

const initialFloor = {
	start: '2027-01-02',
	end: '2027-01-04',
	first: '2027-01-02',
	last: '2027-01-04'
} satisfies Record<'start' | 'end' | 'first' | 'last', ISODate | null>;

async function typeDraft() {
	// The popover content has no dialog role. Its fields have test ids.
	const popover = page;
	const start = popover.getByTestId('date-start');
	const end = popover.getByTestId('date-end');
	await start.fill('2027-01-01');
	await end.fill('2027-01-05');
	// Blur the end field without closing the popover or committing the draft.
	await start.click();
	return popover;
}

describe('DateRangeField floor changes while open', () => {
	it.each([
		{
			name: 'the required end moves past the draft',
			floor: { ...initialFloor, end: '2027-01-06', last: '2027-01-06' }
		},
		{
			name: 'a start-only subtask moves past the closed draft',
			floor: { ...initialFloor, last: '2027-03-01' }
		}
	] as const)('shows an error when $name', async ({ floor }) => {
		const onCommit = vi.fn();
		const screen = await render(DateRangeFieldTest, {
			start: '2027-01-02',
			end: '2027-01-04',
			floor: initialFloor,
			onCommit
		});
		await screen.getByRole('button').click();
		const popover = await typeDraft();
		const done = popover.getByRole('button', { name: m.date_done(), exact: true });
		await expect.element(done).toBeEnabled();
		await expect.element(popover.getByRole('alert')).not.toBeInTheDocument();

		await screen.rerender({ floor });

		await expect.element(popover.getByRole('alert')).toBeVisible();
		await expect.element(done).toBeDisabled();
		await expect
			.element(popover.getByTestId('date-start'))
			.toHaveValue(formatDate('2027-01-01', uiIntl()));
		await expect
			.element(popover.getByTestId('date-end'))
			.toHaveValue(formatDate('2027-01-05', uiIntl()));
		expect(onCommit).not.toHaveBeenCalled();
	});

	it('clears a floor error when the updated floor permits the unchanged draft', async () => {
		const onCommit = vi.fn();
		const screen = await render(DateRangeFieldTest, {
			start: '2027-01-02',
			end: '2027-01-06',
			floor: { ...initialFloor, end: '2027-01-06', last: '2027-01-06' },
			onCommit
		});
		await screen.getByRole('button').click();
		const popover = await typeDraft();
		const done = popover.getByRole('button', { name: m.date_done(), exact: true });
		await expect.element(popover.getByRole('alert')).toBeVisible();
		await expect.element(done).toBeDisabled();

		await screen.rerender({ floor: initialFloor });

		await expect.element(popover.getByRole('alert')).not.toBeInTheDocument();
		await expect.element(done).toBeEnabled();
		expect(onCommit).not.toHaveBeenCalled();
		await done.click();
		expect(onCommit).toHaveBeenCalledExactlyOnceWith({ start: '2027-01-01', end: '2027-01-05' });
	});
});
