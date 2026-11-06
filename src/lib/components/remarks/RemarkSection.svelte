<!--
	One remark section: an editable title, a list of bullets and a "+" line to add a bullet.
	A new bullet is not in the plan until it has text. The plan never keeps an empty bullet.
	Each bullet edit is one commit.
-->
<script lang="ts">
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import { tick } from 'svelte';
	import { dragHandle } from 'svelte-dnd-action';
	import AddLine from '#lib/components/edit/AddLine.svelte';
	import InlineText from '#lib/components/edit/InlineText.svelte';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { buttonVariants } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import type { RemarkSection } from '#lib/domain/schema.js';
	import { motionDuration } from '#lib/motion.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		discardNewRemarkSection,
		moveRemarkSection,
		removeRemarkSection,
		updateRemarkSection
	} from '#lib/state/commands.js';
	import { getEditing } from '#lib/state/editing.svelte.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	import { reconcileKeys } from './bullet-keys.js';

	interface Props {
		section: RemarkSection;
		/** Called when the section was new and empty, and the app removed it. */
		onDiscarded?: () => void;
	}

	let { section, onDiscarded }: Props = $props();

	const ws = getWorkspace();
	const editing = getEditing();

	const position = $derived(ws.plan.remarks.findIndex((r) => r.id === section.id));
	const name = $derived(section.title || m.remark_untitled());
	const isNew = $derived(editing.newRemarkSectionId === section.id);

	/** The new bullet that waits for text: the key of the bullet before it and a token that keys the field. */
	let pending = $state<{ after: string | null; token: number } | null>(null);
	let tokenCount = 0;
	let sectionElement = $state<HTMLElement | null>(null);
	let titleField = $state<ReturnType<typeof InlineText> | null>(null);
	let fields = $state<Record<string, ReturnType<typeof InlineText> | null>>({});
	let confirmDelete = $state(false);

	// Each bullet has a stable key. A change from outside moves the keys with the bullets.
	let known = { texts: [] as string[], keys: [] as string[] };
	const keys = $derived.by(() => {
		const next = reconcileKeys(known.texts, known.keys, section.bullets);
		known = { texts: [...section.bullets], keys: next };
		return next;
	});

	type Row =
		{ kind: 'bullet'; key: string; index: number } | { kind: 'new'; token: number; at: number };
	const rows = $derived.by(() => {
		const list: Row[] = section.bullets.map((_, index) => ({
			kind: 'bullet',
			key: keys[index],
			index
		}));
		if (pending) {
			const found = pending.after === null ? -1 : keys.indexOf(pending.after);
			const at = pending.after === null ? 0 : found < 0 ? keys.length : found + 1;
			list.splice(at, 0, { kind: 'new', token: pending.token, at });
		}
		return list;
	});

	const setBullets = (bullets: string[]) => updateRemarkSection(ws, section.id, { bullets });

	function addPendingAt(at: number) {
		pending = { after: at > 0 ? (keys[at - 1] ?? null) : null, token: ++tokenCount };
	}

	/** Starts the edit of the bullet at `index`. The caret goes to the end, so that nothing is selected. */
	async function focusBullet(index: number) {
		await tick();
		fields[keys[index]]?.startEdit({ caret: 'end' });
	}

	/**
	 * Moves the focus after a bullet went away at `at`.
	 * Order: the bullet before, the bullet after, the section title, the "+" line.
	 */
	async function focusAround(at: number) {
		await tick();
		const targets = [fields[keys[at - 1]], fields[keys[at]], titleField];
		for (const target of targets) if (target?.focusDisplay()) return;
		sectionElement?.querySelector<HTMLElement>('[data-testid="add-remark-bullet"]')?.focus();
	}

	function commitBullet(key: string, fallback: number, text: string) {
		const bullets = [...section.bullets];
		const at = keys.indexOf(key);
		// The bullet is gone (a change from outside): insert the text instead of a hit on another bullet.
		if (at >= 0) bullets[at] = text;
		else bullets.splice(Math.min(fallback, bullets.length), 0, text);
		setBullets(bullets);
	}

	function commitNew(at: number, text: string) {
		const bullets = [...section.bullets];
		bullets.splice(at, 0, text);
		setBullets(bullets);
	}

	/** Enter at a bullet: the next bullet starts, unless the bullet is empty. */
	function enterBullet(text: string, next: number, gone: number) {
		if (text.trim()) addPendingAt(next);
		else focusAround(gone);
	}

	function backspaceBullet(index: number) {
		setBullets(section.bullets.filter((_, i) => i !== index));
		if (index > 0) focusBullet(index - 1);
		else focusAround(0);
	}

	function titleDone() {
		if (!isNew) return;
		editing.newRemarkSectionId = null;
		discardNewRemarkSection(ws, section.id);
		if (ws.plan.remarks.some((r) => r.id === section.id)) return;
		onDiscarded?.();
	}

	function askDelete() {
		if (section.title || section.bullets.length > 0) confirmDelete = true;
		else removeRemarkSection(ws, section.id);
	}
</script>

<section
	bind:this={sectionElement}
	class="group/remark flex h-full flex-col rounded-lg border p-3"
	aria-label={name}
	data-testid="remark-section"
	data-remark-id={section.id}
>
	<header class="flex items-center gap-1 pb-2">
		<!-- Not a <button>: svelte-dnd-action ignores keyboard drag on elements with a "disabled" property. -->
		<div
			use:dragHandle
			role="button"
			tabindex="0"
			class="-ml-5 flex size-5 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity group-focus-within/remark:opacity-100 group-hover/remark:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing [@media(hover:none)]:opacity-100"
			style:transition-duration={`${motionDuration(150)}ms`}
			aria-label={m.remark_drag()}
		>
			<GripVerticalIcon class="size-4" aria-hidden="true" />
		</div>
		<h3 class="min-w-0 flex-1 text-sm font-semibold">
			<InlineText
				bind:this={titleField}
				value={section.title}
				label={m.remark_title_label()}
				placeholder={m.remark_title_label()}
				autoEdit={isNew}
				onCommit={(title) => updateRemarkSection(ws, section.id, { title })}
				onDone={titleDone}
				testId="remark-title"
			/>
		</h3>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
				aria-label={m.remark_menu()}
				data-testid="remark-menu"
			>
				<EllipsisVerticalIcon aria-hidden="true" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Item
					disabled={position === 0}
					onSelect={() => moveRemarkSection(ws, section.id, -1)}
				>
					{m.action_move_up()}
				</DropdownMenu.Item>
				<DropdownMenu.Item
					disabled={position === ws.plan.remarks.length - 1}
					onSelect={() => moveRemarkSection(ws, section.id, 1)}
				>
					{m.action_move_down()}
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item variant="destructive" onSelect={askDelete}>
					{m.remark_delete()}
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</header>

	<ul class="flex flex-col gap-0.5 text-sm">
		{#each rows as row (row.kind === 'bullet' ? row.key : `n${row.token}`)}
			<li class="flex items-baseline gap-1">
				<span class="shrink-0 pl-1 text-muted-foreground" aria-hidden="true">•</span>
				<div class="min-w-0 flex-1">
					{#if row.kind === 'bullet'}
						<InlineText
							bind:this={fields[row.key]}
							value={section.bullets[row.index]}
							label={m.remark_bullet_label()}
							placeholder={m.remark_bullet_placeholder()}
							class="whitespace-normal"
							onCommit={(text) => commitBullet(row.key, row.index, text)}
							onEnter={(text) => enterBullet(text, row.index + 1, row.index)}
							onBackspaceEmpty={() => backspaceBullet(row.index)}
							testId="remark-bullet"
						/>
					{:else}
						<InlineText
							value=""
							label={m.remark_bullet_label()}
							placeholder={m.remark_bullet_placeholder()}
							class="whitespace-normal"
							autoEdit
							onCommit={(text) => commitNew(row.at, text)}
							onDone={() => (pending = null)}
							onEnter={(text) => enterBullet(text, row.at + 1, row.at)}
							onEscape={() => focusAround(row.at)}
							onBackspaceEmpty={() => (row.at > 0 ? focusBullet(row.at - 1) : focusAround(0))}
							testId="remark-bullet"
						/>
					{/if}
				</div>
			</li>
		{/each}
	</ul>

	<div class="mt-auto pt-2">
		<AddLine
			label={m.remark_bullet_add({ section: name })}
			onAdd={() => addPendingAt(section.bullets.length)}
			class="opacity-0 group-focus-within/remark:opacity-100 group-hover/remark:opacity-100 [@media(hover:none)]:opacity-100"
			testId="add-remark-bullet"
		/>
	</div>
</section>

<AlertDialog.Root bind:open={confirmDelete}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.remark_delete_title()}</AlertDialog.Title>
			<AlertDialog.Description>
				{name}. {m.remark_delete_body({ bullets: section.bullets.length })}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.action_cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action
				class={buttonVariants({ variant: 'destructive' })}
				onclick={() => {
					confirmDelete = false;
					removeRemarkSection(ws, section.id);
				}}
			>
				{m.action_delete()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
