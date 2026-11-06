<!--
	The note of a task. Plain text with mentions. Type "@" and words to find a task. Enter inserts it.
	The stored note keeps ids, so a renamed task shows its new title everywhere.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { isComposing } from '#lib/browser/keyboard.js';
	import {
		fromEditorText,
		matchesWords,
		noteSegments,
		replaceEditorText,
		type EditorMention,
		toEditorText
	} from '#lib/domain/mentions.js';
	import type { Task } from '#lib/domain/schema.js';
	import { motionDuration } from '#lib/motion.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';

	interface Props {
		note: string;
		tasks: readonly Task[];
		/** The task of this note. It is not a mention candidate. */
		selfId: string;
		onCommit: (note: string) => void;
	}

	let { note, tasks, selfId, onCommit }: Props = $props();

	const id = $props.id();
	let display = $state<HTMLButtonElement | null>(null);
	let editing = $state(false);
	let text = $state('');
	// Each mention keeps its id at its text range.
	let mentions: EditorMention[] = [];
	let selection = { start: 0, end: 0 };
	let area = $state<HTMLTextAreaElement | null>(null);
	let query = $state<string | null>(null);
	let active = $state(0);

	const titleOf = (id: string) => tasks.find((t) => t.id === id)?.title;
	const segments = $derived(noteSegments(note));
	const candidates = $derived(
		query === null
			? []
			: tasks
					.filter((t) => t.id !== selfId && t.title !== '' && matchesWords(t.title, query ?? ''))
					.slice(0, 6)
	);

	const listOpen = $derived(query !== null && candidates.length > 0);
	const activeIndex = $derived(Math.min(active, candidates.length - 1));

	async function start() {
		const converted = toEditorText(note, (id) => titleOf(id) || undefined);
		text = converted.text;
		mentions = converted.mentions;
		editing = true;
		await tick();
		area?.focus();
	}

	function finish(cancel: boolean, focusDisplay: boolean) {
		if (!editing) return;
		editing = false;
		query = null;
		if (!cancel) {
			const next = fromEditorText(text, mentions, tasks).trim();
			if (next !== note) onCommit(next);
		} else {
			const stored = toEditorText(note, (id) => titleOf(id) || undefined);
			text = stored.text;
			mentions = stored.mentions;
		}
		if (focusDisplay) tick().then(() => display?.focus());
	}

	function beforeInput() {
		if (area) selection = { start: area.selectionStart, end: area.selectionEnd };
	}

	function onInput() {
		if (!area) return;
		const next = area.value;
		if (next === text) {
			readQuery();
			return;
		}
		// The caret bounds keep equal text on each side of a deletion in the correct place.
		let start = 0;
		const limit = Math.min(selection.start, area.selectionStart);
		while (start < limit && text[start] === next[start]) start++;
		let suffix = 0;
		const suffixLimit = Math.min(text.length - selection.end, next.length - area.selectionEnd);
		while (
			suffix < suffixLimit &&
			text[text.length - suffix - 1] === next[next.length - suffix - 1]
		)
			suffix++;
		const updated = replaceEditorText(
			{ text, mentions },
			start,
			text.length - suffix,
			next.slice(start, next.length - suffix)
		);
		text = updated.text;
		mentions = updated.mentions;
		readQuery();
	}

	/** Finds an "@query" that ends at the caret. */
	function readQuery() {
		if (!area) return;
		const before = text.slice(0, area.selectionStart);
		const match = before.match(/(?:^|\s)@([^@\n[\]]{0,40})$/);
		query = match ? match[1] : null;
		active = 0;
	}

	async function insert(task: Task) {
		if (!area || query === null) return;
		const caret = area.selectionStart;
		const start = caret - query.length - 1;
		const mention = `@[${task.title}] `;
		const updated = replaceEditorText({ text, mentions }, start, caret, mention, task);
		text = updated.text;
		mentions = updated.mentions;
		query = null;
		await tick();
		area.selectionStart = area.selectionEnd = start + mention.length;
		area.focus();
	}

	function onKeydown(event: KeyboardEvent) {
		if (isComposing(event)) return;
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			finish(false, true);
			return;
		}
		if (listOpen) {
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				const step = event.key === 'ArrowDown' ? 1 : -1;
				active = (active + step + candidates.length) % candidates.length;
				return;
			}
			if (event.key === 'Enter' || event.key === 'Tab') {
				event.preventDefault();
				insert(candidates[activeIndex]);
				return;
			}
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			if (listOpen) query = null;
			else finish(true, true);
		}
	}
</script>

{#if editing}
	<div class="relative">
		<textarea
			bind:this={area}
			value={text}
			aria-label={m.field_note()}
			role="combobox"
			aria-autocomplete="list"
			aria-expanded={listOpen}
			aria-controls={listOpen ? `${id}-options` : undefined}
			aria-activedescendant={listOpen ? `${id}-option-${activeIndex}` : undefined}
			placeholder={m.field_note_placeholder()}
			class="field-sizing-content min-h-20 w-full resize-none rounded-md border bg-background px-2.5 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
			onbeforeinput={beforeInput}
			oninput={onInput}
			onclick={readQuery}
			onkeydown={onKeydown}
			onblur={() => finish(false, false)}
			data-testid="note-input"></textarea>
		{#if listOpen}
			<div
				class="absolute inset-x-0 top-full z-50 mt-1 rounded-md border bg-popover p-1 text-sm shadow-md"
				role="listbox"
				id={`${id}-options`}
				aria-label={m.dependency_search()}
			>
				{#each candidates as task, i (task.id)}
					<button
						type="button"
						role="option"
						id={`${id}-option-${i}`}
						tabindex="-1"
						aria-selected={i === activeIndex}
						class={cn(
							'block w-full truncate rounded-sm px-2 py-1 text-left',
							i === activeIndex && 'bg-accent'
						)}
						onmousedown={(e) => {
							e.preventDefault();
							insert(task);
						}}
					>
						{task.title}
					</button>
				{/each}
				<p class="px-2 pt-1 text-xs text-muted-foreground">{m.mention_hint()}</p>
			</div>
		{/if}
	</div>
{:else}
	<button
		bind:this={display}
		type="button"
		class="min-h-20 w-full rounded-md border border-transparent px-2.5 py-2 text-left text-sm whitespace-pre-wrap transition-colors hover:border-border hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
		style:transition-duration={`${motionDuration(150)}ms`}
		onclick={start}
		data-testid="note-display"
	>
		{#if note}
			{#each segments as segment, i (i)}
				{#if segment.kind === 'text'}{segment.text}{:else}<span
						class="rounded bg-accent px-1 font-medium text-accent-foreground"
						>@{titleOf(segment.id) || '?'}</span
					>{/if}
			{/each}
		{:else}
			<span class="text-muted-foreground">{m.field_note_placeholder()}</span>
		{/if}
	</button>
{/if}
