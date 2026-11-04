<!--
	The note of a task. Plain text with mentions. Type "@" and words to find a task. Enter inserts it.
	The stored note keeps ids, so a renamed task shows its new title everywhere.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import {
		fromEditorText,
		matchesWords,
		noteSegments,
		toEditorText
	} from '#lib/domain/mentions.js';
	import type { Task } from '#lib/domain/schema.js';
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

	let editing = $state(false);
	let text = $state('');
	// The title-to-id map of one edit. The UI does not read it, so it does not need reactivity.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	let ids = new Map<string, string>();
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

	async function start() {
		const converted = toEditorText(note, (id) => titleOf(id) || undefined);
		text = converted.text;
		ids = converted.ids;
		editing = true;
		await tick();
		area?.focus();
	}

	function save() {
		editing = false;
		query = null;
		const next = fromEditorText(text, ids, tasks).trim();
		if (next !== note) onCommit(next);
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
		ids.set(task.title, task.id);
		text = text.slice(0, start) + mention + text.slice(caret);
		query = null;
		await tick();
		area.selectionStart = area.selectionEnd = start + mention.length;
		area.focus();
	}

	function onKeydown(event: KeyboardEvent) {
		if (query !== null && candidates.length > 0) {
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				const step = event.key === 'ArrowDown' ? 1 : -1;
				active = (active + step + candidates.length) % candidates.length;
				return;
			}
			if (event.key === 'Enter' || event.key === 'Tab') {
				event.preventDefault();
				insert(candidates[active]);
				return;
			}
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			if (query !== null) query = null;
			else save();
		}
	}
</script>

{#if editing}
	<div class="relative">
		<textarea
			bind:this={area}
			bind:value={text}
			aria-label={m.field_note()}
			placeholder={m.field_note_placeholder()}
			class="field-sizing-content min-h-20 w-full resize-none rounded-md border bg-background px-2.5 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
			oninput={readQuery}
			onclick={readQuery}
			onkeydown={onKeydown}
			onblur={save}
			data-testid="note-input"></textarea>
		{#if query !== null && candidates.length > 0}
			<div
				class="absolute inset-x-0 top-full z-50 mt-1 rounded-md border bg-popover p-1 text-sm shadow-md"
				role="listbox"
				aria-label={m.dependency_search()}
			>
				{#each candidates as task, i (task.id)}
					<button
						type="button"
						role="option"
						aria-selected={i === active}
						class={cn(
							'block w-full truncate rounded-sm px-2 py-1 text-left',
							i === active && 'bg-accent'
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
		type="button"
		class="min-h-20 w-full rounded-md border border-transparent px-2.5 py-2 text-left text-sm whitespace-pre-wrap transition-colors hover:border-border hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
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
