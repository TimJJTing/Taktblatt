<!--
	A single date editor in a popover: a calendar and a text field.
	An ordinary close commits the change. Escape cancels the change. The date can be empty.
	An optional Today button puts the current date in the field.
	It has the same structure as DateRangeField.
-->
<script lang="ts">
	import { parseDate, type DateValue } from '@internationalized/date';
	import type { Snippet } from 'svelte';
	import { isComposing } from '#lib/browser/keyboard.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import * as Popover from '#lib/components/ui/popover/index.ts';
	import { Calendar } from '#lib/components/ui/calendar/index.ts';
	import { todayISO, type ISODate } from '#lib/domain/date.ts';
	import { formatDate, readTypedDate } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		date: ISODate | null;
		label: string;
		/** Set to false for a date that must have a value (for example a milestone date). */
		allowEmpty?: boolean;
		/** Show a Today button. It puts the current date in the field. */
		showToday?: boolean;
		onCommit: (date: ISODate | null) => void;
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
	}

	let { date, label, allowEmpty = true, showToday = false, onCommit, trigger }: Props = $props();

	let open = $state(false);
	let draft = $state<ISODate | null>(null);
	let text = $state('');
	let error = $state('');
	let placeholder = $state<DateValue | undefined>(undefined);

	const tag = uiIntl();
	const show = (d: ISODate | null) => (d ? formatDate(d, tag) : '');
	const example = $derived(formatDate(todayISO(), tag));
	// The accessible name of the trigger: "Label: value", or the bare label when the date is empty.
	const name = $derived(date ? m.field_value({ label, value: formatDate(date, tag) }) : label);

	const calendarValue = $derived(draft ? parseDate(draft) : undefined);

	function reset() {
		draft = date;
		text = show(date);
		error = '';
		placeholder = parseDate(date ?? todayISO());
	}

	function onOpenChange(next: boolean, cancel = false) {
		if (next) {
			reset();
			open = true;
			return;
		}
		if (!open) return;
		if (!cancel && readText()) commit();
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
		if (!allowEmpty && draft === null) return;
		if (draft !== date) onCommit(draft);
	}

	function readText() {
		if (!open) return false;
		const year = Number((draft ?? todayISO()).slice(0, 4));
		const typed = readTypedDate(text, draft, tag, year);
		if (typed.kind === 'same') return true;
		if (typed.kind === 'invalid') {
			error = m.date_invalid({ example });
			return false;
		}
		draft = typed.date;
		if (typed.date) placeholder = parseDate(typed.date);
		error = '';
		text = show(draft);
		return true;
	}

	function onCalendar(value: DateValue | undefined) {
		draft = value ? (value.toString() as ISODate) : null;
		text = show(draft);
		error = '';
	}

	function setToday() {
		const today = todayISO();
		onCalendar(parseDate(today));
		placeholder = parseDate(today);
	}

	function clear() {
		draft = null;
		text = '';
		error = '';
	}
</script>

<Popover.Root {open} {onOpenChange}>
	<Popover.Trigger>
		{#snippet child({ props })}
			{@render trigger({ props: { ...props, 'aria-label': name } })}
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-auto gap-0 p-0" align="start" {onEscapeKeydown}>
		<!-- w-0 min-w-full: the calendar sets the width; the field and texts follow it. -->
		<div class="flex w-0 min-w-full flex-col gap-2 p-3 pb-0">
			<label class="flex flex-col gap-1 text-xs text-muted-foreground">
				{label}
				<Input
					bind:value={text}
					onblur={() => readText()}
					onkeydown={(e) => !isComposing(e) && e.key === 'Enter' && readText()}
					class="h-8 text-sm text-foreground"
					data-testid="date-value"
				/>
			</label>
			{#if error}
				<p class="text-xs text-destructive" role="alert">{error}</p>
			{/if}
		</div>
		<Calendar
			type="single"
			value={calendarValue as never}
			onValueChange={onCalendar}
			bind:placeholder
			locale={tag}
			weekStartsOn={1}
			class="[--cell-size:--spacing(9)]"
		/>
		<div class="flex justify-between gap-2 border-t p-2">
			<span class="flex gap-1">
				{#if allowEmpty}
					<Button variant="ghost" size="sm" onclick={clear}>{m.date_clear()}</Button>
				{/if}
				{#if showToday}
					<Button variant="ghost" size="sm" onclick={setToday} data-testid="date-today"
						>{m.date_today()}</Button
					>
				{/if}
			</span>
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
