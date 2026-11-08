<!--
	A date range editor in a popover: a calendar and two text fields.
	An ordinary close commits the change. Escape cancels the change. Either date can be empty.
-->
<script lang="ts">
	import { parseDate, type DateValue } from '@internationalized/date';
	import { untrack, type Snippet } from 'svelte';
	import { isComposing } from '#lib/browser/keyboard.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import * as Popover from '#lib/components/ui/popover/index.ts';
	import { Day, RangeCalendar } from '#lib/components/ui/range-calendar/index.ts';
	import { todayISO, type ISODate } from '#lib/domain/date.ts';
	import { breaksSubtaskFloor, type SubtaskFloor } from '#lib/domain/derive.ts';
	import { formatDate, formatRangeDisplay, readTypedDate } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		start: ISODate | null;
		end: ISODate | null;
		label: string;
		/** Set to false for a range that must have both dates (for example the plan range). */
		allowEmpty?: boolean;
		floor?: SubtaskFloor;
		onCommit: (range: { start: ISODate | null; end: ISODate | null }) => void;
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
	}

	let { start, end, label, allowEmpty = true, floor, onCommit, trigger }: Props = $props();

	let open = $state(false);
	let draftStart = $state<ISODate | null>(null);
	let draftEnd = $state<ISODate | null>(null);
	let startText = $state('');
	let endText = $state('');
	let error = $state('');
	let placeholder = $state<DateValue | undefined>(undefined);
	// True after a start-only calendar pick, until the end pick or a typed change.
	let pickingEnd = $state(false);

	const tag = uiIntl();
	const legendId = $props.id();
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

	// True while the draft breaks the subtask limits. Done stays disabled until the range meets them.
	const breaksFloor = $derived(
		!!floor && breaksSubtaskFloor({ start: draftStart, end: draftEnd }, floor)
	);
	// The subtask range that the calendar marks: from the earliest to the latest subtask date.
	const span = $derived(
		floor?.first && floor.last ? { first: floor.first, last: floor.last } : null
	);

	$effect(() => {
		void [floor?.start, floor?.end, floor?.first, floor?.last];
		if (open) {
			untrack(() => {
				if (error !== m.date_invalid({ example })) validate();
			});
		}
	});

	function reset() {
		draftStart = start;
		draftEnd = end;
		startText = show(start);
		endText = show(end);
		error = '';
		pickingEnd = false;
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
		if (error || breaksFloor) return;
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
		pickingEnd = false;
		if (typed.date) placeholder = parseDate(typed.date);
		validate();
		if (which === 'start') startText = show(draftStart);
		else endText = show(draftEnd);
		return true;
	}

	function validate() {
		const required = floor ? formatRangeDisplay(floor.first, floor.last, tag) : '';
		// A start-only calendar pick waits for the end. It shows an alert only when the start is
		// after the earliest subtask date, because then no end can make a valid range.
		if (pickingEnd) {
			error =
				floor?.first && draftStart && draftStart > floor.first
					? m.date_subtask_floor({ range: required })
					: '';
			return;
		}
		error =
			draftStart && draftEnd && draftStart > draftEnd
				? m.date_order()
				: floor && breaksSubtaskFloor({ start: draftStart, end: draftEnd }, floor)
					? m.date_subtask_floor({ range: required })
					: '';
	}

	function onCalendar(value: { start?: DateValue; end?: DateValue } | undefined) {
		draftStart = value?.start ? (value.start.toString() as ISODate) : null;
		draftEnd = value?.end ? (value.end.toString() as ISODate) : null;
		if (draftStart && !value?.end) draftEnd = null;
		startText = show(draftStart);
		endText = show(draftEnd);
		pickingEnd = !!draftStart && !draftEnd;
		validate();
	}

	function clear() {
		draftStart = null;
		draftEnd = null;
		startText = '';
		endText = '';
		pickingEnd = false;
		validate();
	}
</script>

<Popover.Root {open} {onOpenChange}>
	<Popover.Trigger>
		{#snippet child({ props })}
			{@render trigger({ props: { ...props, 'aria-label': name } })}
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-auto gap-0 p-0" align="start" {onEscapeKeydown}>
		<!-- w-0 min-w-full: the calendar sets the width; the fields and texts follow it. -->
		<div class="flex w-0 min-w-full flex-col gap-2 p-3 pb-0">
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
			aria-describedby={span ? legendId : undefined}
			locale={tag}
			weekStartsOn={1}
			class="[--cell-size:--spacing(9)]"
		>
			{#snippet day({ day })}
				{@const iso = day.toString()}
				{@const inSpan = !!span && span.first <= iso && iso <= span.last}
				<Day
					data-subtask-span={inSpan ? '' : undefined}
					data-span-start={inSpan && iso === span?.first ? '' : undefined}
					data-span-end={inSpan && iso === span?.last ? '' : undefined}
					class={[
						'relative',
						// The subtask range: a bar with round ends in the gap below the days. It stays
						// outside the day fill, so selection, range, today and hover fills do not hide it.
						'data-subtask-span:after:absolute data-subtask-span:after:inset-x-0 data-subtask-span:after:-bottom-1 data-subtask-span:after:h-0.5 data-subtask-span:after:bg-primary/55',
						'data-span-end:after:right-2 data-span-end:after:rounded-e-full data-span-start:after:left-2 data-span-start:after:rounded-s-full'
					]}
				/>
			{/snippet}
		</RangeCalendar>
		{#if span}
			<p
				class="-mt-1 flex w-0 min-w-full items-center gap-2 px-3 pb-3 text-xs text-muted-foreground"
				id={legendId}
				data-testid="date-subtask-span"
			>
				<span aria-hidden="true" class="h-0.5 w-4 shrink-0 rounded-full bg-primary/55"></span>
				{m.date_subtask_span({ range: formatRangeDisplay(span.first, span.last, tag) })}
			</p>
		{/if}
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
				disabled={!!error || breaksFloor}>{m.date_done()}</Button
			>
		</div>
	</Popover.Content>
</Popover.Root>
