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
	import { m } from '#lib/paraglide/messages.js';
	import {
		discardNewRemarkSection,
		moveRemarkSection,
		removeRemarkSection,
		updateRemarkSection
	} from '#lib/state/commands.js';
	import { getEditing } from '#lib/state/editing.svelte.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';

	let { section }: { section: RemarkSection } = $props();

	const ws = getWorkspace();
	const editing = getEditing();

	const position = $derived(ws.plan.remarks.findIndex((r) => r.id === section.id));
	const name = $derived(section.title || m.remark_untitled());
	const isNew = $derived(editing.newRemarkId === section.id);

	/** The new bullet that waits for text: its place in the list and a token that keys the field. */
	let pending = $state<{ at: number; token: number } | null>(null);
	let tokenCount = 0;
	let fields = $state<(ReturnType<typeof InlineText> | null)[]>([]);
	let confirmDelete = $state(false);

	type Row = { kind: 'bullet'; index: number } | { kind: 'new'; token: number; at: number };
	const rows = $derived.by(() => {
		const list: Row[] = section.bullets.map((_, index) => ({ kind: 'bullet', index }));
		if (pending) list.splice(pending.at, 0, { kind: 'new', token: pending.token, at: pending.at });
		return list;
	});

	const setBullets = (bullets: string[]) => updateRemarkSection(ws, section.id, { bullets });

	function addPending(at: number) {
		pending = { at, token: ++tokenCount };
	}

	async function focusBullet(index: number) {
		await tick();
		fields[index]?.startEdit();
	}

	function commitBullet(index: number, text: string) {
		const bullets = [...section.bullets];
		bullets[index] = text;
		setBullets(bullets);
	}

	function commitNew(at: number, text: string) {
		const bullets = [...section.bullets];
		bullets.splice(at, 0, text);
		setBullets(bullets);
	}

	/** Enter at a bullet: the next bullet starts, unless the bullet is empty. */
	function enterBullet(index: number, text: string) {
		if (text.trim()) addPending(index + 1);
	}

	function backspaceBullet(index: number) {
		setBullets(section.bullets.filter((_, i) => i !== index));
		if (index > 0) focusBullet(index - 1);
	}

	function titleDone(title: string) {
		if (!isNew) return;
		editing.newRemarkId = null;
		if (!title.trim() && section.bullets.length === 0) discardNewRemarkSection(ws, section.id);
	}

	function askDelete() {
		if (section.title.trim() || section.bullets.length > 0) confirmDelete = true;
		else removeRemarkSection(ws, section.id);
	}

	let lastDone = '';
</script>

<section
	class="group/remark flex h-full flex-col rounded-lg border p-3"
	aria-label={name}
	data-testid="remark-section"
	data-remark-id={section.id}
>
	<header class="flex items-center gap-1 pb-2">
		<button
			type="button"
			use:dragHandle
			class="-ml-5 flex size-5 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity group-focus-within/remark:opacity-100 group-hover/remark:opacity-100 focus-visible:opacity-100 active:cursor-grabbing print:hidden [@media(hover:none)]:opacity-100"
			aria-label={m.remark_drag()}
		>
			<GripVerticalIcon class="size-4" aria-hidden="true" />
		</button>
		<h3 class="min-w-0 flex-1 text-sm font-semibold">
			<InlineText
				value={section.title}
				label={m.remark_title_label()}
				placeholder={m.remark_title_placeholder()}
				autoEdit={isNew}
				onCommit={(title) => updateRemarkSection(ws, section.id, { title })}
				onDone={titleDone}
				testId="remark-title"
			/>
		</h3>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class={buttonVariants({ variant: 'ghost', size: 'icon-sm' }) + ' print:hidden'}
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
					{m.stage_move_up()}
				</DropdownMenu.Item>
				<DropdownMenu.Item
					disabled={position === ws.plan.remarks.length - 1}
					onSelect={() => moveRemarkSection(ws, section.id, 1)}
				>
					{m.stage_move_down()}
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item variant="destructive" onSelect={askDelete}>
					{m.remark_delete()}
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</header>

	<ul class="flex flex-col gap-0.5 text-sm">
		{#each rows as row (row.kind === 'bullet' ? `b${row.index}` : `n${row.token}`)}
			<li class="flex items-baseline gap-1">
				<span class="shrink-0 pl-1 text-muted-foreground" aria-hidden="true">•</span>
				<div class="min-w-0 flex-1">
					{#if row.kind === 'bullet'}
						<InlineText
							bind:this={fields[row.index]}
							value={section.bullets[row.index]}
							label={m.remark_bullet_label()}
							placeholder={m.remark_bullet_placeholder()}
							class="whitespace-normal"
							onCommit={(text) => commitBullet(row.index, text)}
							onDone={(text) => (lastDone = text)}
							onEnter={() => enterBullet(row.index, lastDone)}
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
							onDone={(text) => {
								lastDone = text;
								pending = null;
							}}
							onEnter={() => enterBullet(row.at, lastDone)}
							onBackspaceEmpty={() => {
								if (row.at > 0) focusBullet(row.at - 1);
							}}
							testId="remark-bullet"
						/>
					{/if}
				</div>
			</li>
		{/each}
	</ul>

	<div class="mt-auto pt-2 print:hidden">
		<AddLine
			label={m.remark_bullet_add({ section: name })}
			onAdd={() => addPending(section.bullets.length)}
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
