<!--
	Click-to-edit text. Click, Enter or F2 starts the edit.
	Blur and Enter commit (Enter in a multi-line field adds a line; Cmd/Ctrl+Enter commits). Esc cancels.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { cn } from '#lib/utils.js';

	interface Props {
		value: string;
		/** The accessible name of the field. */
		label: string;
		placeholder?: string;
		multiline?: boolean;
		maxLength?: number;
		/** Start in edit mode, for example for a new row. */
		autoEdit?: boolean;
		disabled?: boolean;
		class?: string;
		inputClass?: string;
		/** Called with the new value when it is different. */
		onCommit: (value: string) => void;
		/** Called after an Enter commit, for spreadsheet navigation. */
		onEnter?: () => void;
		/** Called when the edit ends: after a commit, a cancel or a blur. `value` is the final text. */
		onDone?: (value: string) => void;
		testId?: string;
	}

	let {
		value,
		label,
		placeholder = '',
		multiline = false,
		maxLength,
		autoEdit = false,
		disabled = false,
		class: className,
		inputClass,
		onCommit,
		onEnter,
		onDone,
		testId
	}: Props = $props();

	let editing = $state(false);
	let draft = $state('');
	let field = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let display = $state<HTMLButtonElement | null>(null);
	let cancelled = false;

	export async function startEdit() {
		if (disabled) return;
		draft = value;
		cancelled = false;
		editing = true;
		await tick();
		field?.focus();
		field?.select();
	}

	$effect(() => {
		if (autoEdit) startEdit();
	});

	function finish(focusDisplay: boolean) {
		const text = draft;
		editing = false;
		if (!cancelled && text.trim() !== value.trim()) onCommit(text);
		onDone?.(cancelled ? value : text);
		if (focusDisplay) tick().then(() => display?.focus());
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			cancelled = true;
			finish(true);
		} else if (event.key === 'Enter' && !event.isComposing) {
			if (multiline && !(event.metaKey || event.ctrlKey)) return;
			event.preventDefault();
			finish(!onEnter);
			onEnter?.();
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
		aria-label={value ? `${label}: ${value}` : label}
		class={cn(
			'block w-full min-w-0 cursor-text rounded-sm px-1.5 py-0.5 text-left transition-colors outline-none hover:bg-accent/70 focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default disabled:hover:bg-transparent',
			multiline ? 'whitespace-pre-wrap' : 'truncate',
			className
		)}
		onclick={startEdit}
		onkeydown={onDisplayKeydown}
		data-testid={testId}
	>
		{#if value}{value}{:else}<span class="text-muted-foreground/70">{placeholder}</span>{/if}
	</button>
{/if}
