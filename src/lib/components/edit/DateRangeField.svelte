<!--
	A date range editor in a popover: a calendar and two text fields.
	The change commits when the popover closes. Either date can be empty.
-->
<script lang="ts">
	import { parseDate, type DateValue } from '@internationalized/date';
	import type { Snippet } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { RangeCalendar } from '#lib/components/ui/range-calendar/index.js';
	import { todayISO, type ISODate } from '#lib/domain/date.js';
	import { formatDate, intlLocale, parseUserDate } from '#lib/domain/format.js';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		start: ISODate | null;
		end: ISODate | null;
		/** The document language. It controls the date format. */
		locale: string;
		label: string;
		/** Set to false for a range that must have both dates (for example the project range). */
		allowEmpty?: boolean;
		onCommit: (range: { start: ISODate | null; end: ISODate | null }) => void;
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
	}

	let { start, end, locale, label, allowEmpty = true, onCommit, trigger }: Props = $props();

	let open = $state(false);
	let draftStart = $state<ISODate | null>(null);
	let draftEnd = $state<ISODate | null>(null);
	let startText = $state('');
	let endText = $state('');
	let error = $state('');
	let placeholder = $state<DateValue | undefined>(undefined);

	const tag = $derived(intlLocale(locale));
	const show = (d: ISODate | null) => (d ? formatDate(d, tag) : '');
	const example = $derived(formatDate(todayISO(), tag));

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

	function onOpenChange(next: boolean) {
		if (next) {
			reset();
			return;
		}
		commit();
	}

	function commit() {
		if (error) return;
		if (!allowEmpty && (draftStart === null || draftEnd === null)) return;
		if (draftStart !== start || draftEnd !== end) onCommit({ start: draftStart, end: draftEnd });
	}

	function readText(which: 'start' | 'end') {
		const text = (which === 'start' ? startText : endText).trim();
		// The field shows the formatted value. Do not parse it again.
		if (text === show(which === 'start' ? draftStart : draftEnd)) return;
		const year = Number((draftStart ?? draftEnd ?? todayISO()).slice(0, 4));
		const parsed = text === '' ? null : parseUserDate(text, tag, year);
		if (text !== '' && parsed === null) {
			error = m.date_invalid({ example });
			return;
		}
		if (which === 'start') draftStart = parsed;
		else draftEnd = parsed;
		if (parsed) placeholder = parseDate(parsed);
		validate();
		if (which === 'start') startText = show(draftStart);
		else endText = show(draftEnd);
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

<Popover.Root bind:open {onOpenChange}>
	<Popover.Trigger>
		{#snippet child({ props })}
			{@render trigger({ props: { ...props, 'aria-label': label } })}
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-auto p-0" align="start">
		<div class="flex flex-col gap-2 p-3 pb-0">
			<div class="grid grid-cols-2 gap-2">
				<label class="flex flex-col gap-1 text-xs text-muted-foreground">
					{m.date_start()}
					<Input
						bind:value={startText}
						onblur={() => readText('start')}
						onkeydown={(e) => e.key === 'Enter' && readText('start')}
						class="h-8 text-sm text-foreground"
						data-testid="date-start"
					/>
				</label>
				<label class="flex flex-col gap-1 text-xs text-muted-foreground">
					{m.date_end()}
					<Input
						bind:value={endText}
						onblur={() => readText('end')}
						onkeydown={(e) => e.key === 'Enter' && readText('end')}
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
					commit();
					open = false;
				}}
				disabled={!!error}>{m.date_done()}</Button
			>
		</div>
	</Popover.Content>
</Popover.Root>
