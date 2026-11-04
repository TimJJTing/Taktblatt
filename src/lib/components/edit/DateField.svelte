<!--
	A single date editor in a popover: a calendar and a text field.
	An ordinary close commits the change. Escape cancels the change. The date can be empty.
	It has the same structure as DateRangeField.
-->
<script lang="ts">
	import { parseDate, type DateValue } from '@internationalized/date';
	import type { Snippet } from 'svelte';
	import { isComposing } from '#lib/browser/keyboard.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { Calendar } from '#lib/components/ui/calendar/index.js';
	import { todayISO, type ISODate } from '#lib/domain/date.js';
	import { formatDate, intlLocale, parseUserDate } from '#lib/domain/format.js';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		date: ISODate | null;
		/** The document language. It controls the date format. */
		locale: string;
		label: string;
		/** Set to false for a date that must have a value (for example a milestone date). */
		allowEmpty?: boolean;
		onCommit: (date: ISODate | null) => void;
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
	}

	let { date, locale, label, allowEmpty = true, onCommit, trigger }: Props = $props();

	let open = $state(false);
	let draft = $state<ISODate | null>(null);
	let text = $state('');
	let error = $state('');
	let placeholder = $state<DateValue | undefined>(undefined);

	const tag = $derived(intlLocale(locale));
	const show = (d: ISODate | null) => (d ? formatDate(d, tag) : '');
	const example = $derived(formatDate(todayISO(), tag));

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
		const value = text.trim();
		// The field shows the formatted value. Do not parse it again.
		if (value === show(draft)) return true;
		const year = Number((draft ?? todayISO()).slice(0, 4));
		const parsed = value === '' ? null : parseUserDate(value, tag, year);
		if (value !== '' && parsed === null) {
			error = m.date_invalid({ example });
			return false;
		}
		draft = parsed;
		if (parsed) placeholder = parseDate(parsed);
		error = '';
		text = show(draft);
		return true;
	}

	function onCalendar(value: DateValue | undefined) {
		draft = value ? (value.toString() as ISODate) : null;
		text = show(draft);
		error = '';
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
			{@render trigger({ props: { ...props, 'aria-label': label } })}
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-auto p-0" align="start" {onEscapeKeydown}>
		<div class="flex flex-col gap-2 p-3 pb-0">
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
