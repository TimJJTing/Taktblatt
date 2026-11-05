<!--
	A date range editor in a popover: a calendar and two text fields.
	An ordinary close commits the change. Escape cancels the change. Either date can be empty.
-->
<script lang="ts">
	import { parseDate, type DateValue } from '@internationalized/date';
	import type { Snippet } from 'svelte';
	import { isComposing } from '#lib/browser/keyboard.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { RangeCalendar } from '#lib/components/ui/range-calendar/index.js';
	import { todayISO, type ISODate } from '#lib/domain/date.js';
	import { formatDate, formatRangeDisplay, readTypedDate } from '#lib/domain/format.js';
	import { uiIntl } from '#lib/domain/locale.js';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		start: ISODate | null;
		end: ISODate | null;
		label: string;
		/** Set to false for a range that must have both dates (for example the plan range). */
		allowEmpty?: boolean;
		onCommit: (range: { start: ISODate | null; end: ISODate | null }) => void;
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
	}

	let { start, end, label, allowEmpty = true, onCommit, trigger }: Props = $props();

	let open = $state(false);
	let draftStart = $state<ISODate | null>(null);
	let draftEnd = $state<ISODate | null>(null);
	let startText = $state('');
	let endText = $state('');
	let error = $state('');
	let placeholder = $state<DateValue | undefined>(undefined);

	const tag = uiIntl();
	const show = (d: ISODate | null) => (d ? formatDate(d, tag) : '');
	const example = $derived(formatDate(todayISO(), tag));
	// The accessible name of the trigger: "Label: value", or the bare label when both dates are empty.
	const name = $derived(
		start || end ? m.field_value({ label, value: formatRangeDisplay(start, end, tag) }) : label
	);

	const calendarValue = $derived(
		draftStart && draftEnd && draftStart <= draftEnd
			? { start: parseDate(draftStart), end: parseDate(draftEnd) }
			: { start: draftStart ? parseDate(draftStart) : undefined, end: undefined }
	);

	function reset() {
		draftStart = start;
		draftEnd = end;
		startText = show(start);
		endText = show(end);
		error = '';
		const anchor = start ?? end ?? todayISO();
		placeholder = parseDate(anchor);
	}

	function onOpenChange(next: boolean, cancel = false) {
		if (next) {
			reset();
			open = true;
			return;
		}
		if (!open) return;
		if (!cancel) {
			const validStart = readText('start');
			const validEnd = readText('end');
			if (validStart && validEnd) commit();
		}
		open = false;
		reset();
	}

	function onEscapeKeydown(event: KeyboardEvent) {
		event.preventDefault();
		if (isComposing(event)) return;
		event.stopPropagation();
		onOpenChange(false, true);
	}

	function commit() {
		if (error) return;
		if (!allowEmpty && (draftStart === null || draftEnd === null)) return;
		if (draftStart !== start || draftEnd !== end) onCommit({ start: draftStart, end: draftEnd });
	}

	function readText(which: 'start' | 'end') {
		if (!open) return false;
		const text = which === 'start' ? startText : endText;
		const current = which === 'start' ? draftStart : draftEnd;
		const year = Number((draftStart ?? draftEnd ?? todayISO()).slice(0, 4));
		const typed = readTypedDate(text, current, tag, year);
		if (typed.kind === 'same') return true;
		if (typed.kind === 'invalid') {
			error = m.date_invalid({ example });
			return false;
		}
		if (which === 'start') draftStart = typed.date;
		else draftEnd = typed.date;
		if (typed.date) placeholder = parseDate(typed.date);
		validate();
		if (which === 'start') startText = show(draftStart);
		else endText = show(draftEnd);
		return true;
	}

	function validate() {
		error = draftStart && draftEnd && draftStart > draftEnd ? m.date_order() : '';
	}

	function onCalendar(value: { start?: DateValue; end?: DateValue } | undefined) {
		draftStart = value?.start ? (value.start.toString() as ISODate) : null;
		draftEnd = value?.end ? (value.end.toString() as ISODate) : null;
		if (draftStart && !value?.end) draftEnd = null;
		startText = show(draftStart);
		endText = show(draftEnd);
		validate();
	}

	function clear() {
		draftStart = null;
		draftEnd = null;
		startText = '';
		endText = '';
		error = '';
	}
</script>

<Popover.Root {open} {onOpenChange}>
	<Popover.Trigger>
		{#snippet child({ props })}
			{@render trigger({ props: { ...props, 'aria-label': name } })}
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-auto p-0" align="start" {onEscapeKeydown}>
		<div class="flex flex-col gap-2 p-3 pb-0">
			<div class="grid grid-cols-2 gap-2">
				<label class="flex flex-col gap-1 text-xs text-muted-foreground">
					{m.date_start()}
					<Input
						bind:value={startText}
						onblur={() => readText('start')}
						onkeydown={(e) => !isComposing(e) && e.key === 'Enter' && readText('start')}
						class="h-8 text-sm text-foreground"
						data-testid="date-start"
					/>
				</label>
				<label class="flex flex-col gap-1 text-xs text-muted-foreground">
					{m.date_end()}
					<Input
						bind:value={endText}
						onblur={() => readText('end')}
						onkeydown={(e) => !isComposing(e) && e.key === 'Enter' && readText('end')}
						class="h-8 text-sm text-foreground"
						data-testid="date-end"
					/>
				</label>
			</div>
			{#if error}
				<p class="text-xs text-destructive" role="alert">{error}</p>
			{/if}
		</div>
		<RangeCalendar
			value={calendarValue as never}
			onValueChange={onCalendar}
			bind:placeholder
			locale={tag}
			weekStartsOn={1}
		/>
		<div class="flex justify-between gap-2 border-t p-2">
			{#if allowEmpty}
				<Button variant="ghost" size="sm" onclick={clear}>{m.date_clear()}</Button>
			{:else}
				<span></span>
			{/if}
			<Button
				size="sm"
				onclick={() => {
					onOpenChange(false);
				}}
				disabled={!!error}>{m.date_done()}</Button
			>
		</div>
	</Popover.Content>
</Popover.Root>
