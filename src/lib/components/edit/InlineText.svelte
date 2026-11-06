<!--
	Click-to-edit text. Click, Enter or F2 starts the edit. The edit selects all text.
	`startEdit({ caret: 'end' })` puts the caret at the end instead.
	Blur and Enter commit (Enter in a multi-line field adds a line; Cmd/Ctrl+Enter commits). Esc cancels.
	Backspace in an empty field ends the edit and calls onBackspaceEmpty.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { motionDuration } from '#lib/motion.ts';
	import { isComposing } from '#lib/browser/keyboard.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.ts';

	interface Props {
		value: string;
		/** The accessible name of the field. */
		label: string;
		placeholder?: string;
		multiline?: boolean;
		preserveWhitespace?: boolean;
		maxLength?: number;
		/** Start in edit mode, for example for a new row. */
		autoEdit?: boolean;
		disabled?: boolean;
		class?: string;
		inputClass?: string;
		/** Called with the new value when it is different. */
		onCommit: (value: string) => void;
		/** Called after an Enter commit, for spreadsheet navigation. `value` is the draft text. */
		onEnter?: (value: string) => void;
		/** Called when the edit ends: after a commit, a cancel or a blur. `value` is the final text. */
		onDone?: (value: string) => void;
		/** Called after a Backspace in an empty field. The edit ends without a commit. */
		onBackspaceEmpty?: () => void;
		/** Called after Esc cancels the edit. */
		onEscape?: () => void;
		testId?: string;
	}

	let {
		value,
		label,
		placeholder = '',
		multiline = false,
		preserveWhitespace = false,
		maxLength,
		autoEdit = false,
		disabled = false,
		class: className,
		inputClass,
		onCommit,
		onEnter,
		onDone,
		onBackspaceEmpty,
		onEscape,
		testId
	}: Props = $props();

	let editing = $state(false);
	let draft = $state('');
	let field = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let display = $state<HTMLButtonElement | null>(null);
	let cancelled = false;

	export async function startEdit(options: { caret?: 'select' | 'end' } = {}) {
		if (disabled) return;
		draft = value;
		cancelled = false;
		editing = true;
		await tick();
		field?.focus();
		if (options.caret === 'end') field?.setSelectionRange(draft.length, draft.length);
		else field?.select();
	}

	/** Puts the focus on the display button. Returns false during an edit, when there is no button. */
	export function focusDisplay(): boolean {
		if (!display) return false;
		display.focus();
		return true;
	}

	$effect(() => {
		if (autoEdit) startEdit();
	});

	function finish(focusDisplay: boolean) {
		if (!editing) return;
		const text = draft;
		editing = false;
		if (!cancelled && (preserveWhitespace ? text !== value : text.trim() !== value.trim()))
			onCommit(text);
		onDone?.(cancelled ? value : text);
		if (focusDisplay) tick().then(() => display?.focus());
	}

	function onKeydown(event: KeyboardEvent) {
		if (isComposing(event)) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			cancelled = true;
			finish(true);
			onEscape?.();
		} else if (event.key === 'Backspace' && onBackspaceEmpty && draft === '') {
			event.preventDefault();
			if (event.repeat) return;
			cancelled = true;
			finish(false);
			onBackspaceEmpty();
		} else if (event.key === 'Enter') {
			if (multiline && !(event.metaKey || event.ctrlKey)) return;
			event.preventDefault();
			const text = draft;
			finish(!onEnter);
			onEnter?.(text);
		}
	}

	function onDisplayKeydown(event: KeyboardEvent) {
		if (event.key === 'F2') {
			event.preventDefault();
			startEdit();
		}
	}
</script>

{#if editing}
	{#if multiline}
		<textarea
			bind:this={field}
			bind:value={draft}
			aria-label={label}
			{placeholder}
			maxlength={maxLength}
			rows="2"
			class={cn(
				'field-sizing-content w-full resize-none rounded-sm bg-background px-1.5 py-0.5 outline-2 outline-ring/60',
				inputClass
			)}
			onkeydown={onKeydown}
			onblur={() => finish(false)}
			data-testid={testId ? `${testId}-input` : undefined}></textarea>
	{:else}
		<input
			bind:this={field}
			bind:value={draft}
			aria-label={label}
			{placeholder}
			maxlength={maxLength}
			class={cn(
				'w-full min-w-0 rounded-sm bg-background px-1.5 py-0.5 outline-2 outline-ring/60',
				inputClass
			)}
			onkeydown={onKeydown}
			onblur={() => finish(false)}
			data-testid={testId ? `${testId}-input` : undefined}
		/>
	{/if}
{:else}
	<button
		bind:this={display}
		type="button"
		{disabled}
		aria-label={value ? m.field_value({ label, value }) : label}
		class={cn(
			'block w-full min-w-0 cursor-text rounded-sm px-1.5 py-0.5 text-left transition-colors outline-none hover:bg-accent/70 focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default disabled:hover:bg-transparent',
			multiline ? 'whitespace-pre-wrap' : 'truncate',
			className
		)}
		style:transition-duration={`${motionDuration(150)}ms`}
		onclick={() => startEdit()}
		onkeydown={onDisplayKeydown}
		data-testid={testId}
	>
		{#if value}{value}{:else}<span class="text-muted-foreground/70">{placeholder}</span>{/if}
	</button>
{/if}
