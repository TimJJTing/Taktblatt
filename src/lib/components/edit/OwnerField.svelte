<!--
	The owner editor: chips with remove buttons, a name field and suggestions.
	Each chip has "Rename everywhere", which renames the owner in all tasks of the plan.
-->
<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import XIcon from '@lucide/svelte/icons/x';
	import { isComposing } from '#lib/browser/keyboard.ts';
	import Hint from '#lib/components/app/Hint.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import * as Dialog from '#lib/components/ui/dialog/index.ts';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import * as Popover from '#lib/components/ui/popover/index.ts';
	import { joinList } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import { ownerKey } from '#lib/domain/owners.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import OwnerChips, { ownerListHint } from './OwnerChips.svelte';

	interface Props {
		owners: readonly string[];
		locked?: readonly string[];
		/** All owners of the plan, for suggestions. */
		suggestions: readonly string[];
		label: string;
		onChange: (owners: string[]) => void;
		onRename: (from: string, to: string) => void;
	}

	let { owners, locked = [], suggestions, label, onChange, onRename }: Props = $props();

	let open = $state(false);
	let text = $state('');
	let renameFrom = $state<string | null>(null);
	let renameTo = $state('');

	const lockedKeys = $derived(new Set(locked.map(ownerKey)));

	const filtered = $derived.by(() => {
		const used = new Set(owners.map(ownerKey));
		const query = ownerKey(text);
		return suggestions
			.filter((s) => !used.has(ownerKey(s)) && ownerKey(s).includes(query))
			.slice(0, 6);
	});

	const showSuggestions = $derived(filtered.length > 0);

	function onOpenChange(next: boolean, cancel = false) {
		if (!next && open) {
			if (!cancel) add(text);
			text = '';
		}
		open = next;
	}

	function onEscapeKeydown(event: KeyboardEvent) {
		event.preventDefault();
		if (isComposing(event)) return;
		event.stopPropagation();
		// The suggestions are part of the popover, not a separate list. Esc closes the popover and discards the typed name.
		onOpenChange(false, true);
	}

	function guardSubmit(event: KeyboardEvent) {
		if (event.key === 'Enter' && isComposing(event)) event.preventDefault();
	}

	function add(name: string) {
		const value = name.trim();
		text = '';
		if (!value || owners.some((o) => ownerKey(o) === ownerKey(value))) return;
		onChange([...owners, value]);
	}

	function remove(name: string) {
		if (lockedKeys.has(ownerKey(name))) return;
		onChange(owners.filter((o) => o !== name));
	}

	function startRename(name: string) {
		renameFrom = name;
		renameTo = name;
	}

	function confirmRename(event: SubmitEvent) {
		event.preventDefault();
		if (renameFrom && renameTo.trim()) onRename(renameFrom, renameTo);
		renameFrom = null;
	}
</script>

<Popover.Root {open} {onOpenChange}>
	<Hint text={ownerListHint(owners)}>
		{#snippet child({ props })}
			<Popover.Trigger
				{...props}
				class="flex min-h-6 w-full items-center rounded-sm px-1.5 py-0.5 text-left transition-colors outline-none hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring/50"
				style="transition-duration: {motionDuration(150)}ms"
				aria-label={owners.length
					? m.field_value({ label, value: joinList(owners, uiIntl()) })
					: label}
				data-testid="owner-field"
			>
				{#if owners.length}
					<OwnerChips {owners} />
				{:else}
					<span class="truncate text-sm whitespace-nowrap text-muted-foreground/70"
						>{m.owner_empty()}</span
					>
				{/if}
			</Popover.Trigger>
		{/snippet}
	</Hint>
	<Popover.Content class="w-64 p-2" align="start" {onEscapeKeydown}>
		{#if owners.length}
			<ul class="mb-2 flex flex-wrap gap-1">
				{#each owners as owner (owner)}
					<li class="flex items-center rounded-full bg-muted pl-2 text-xs">
						<span class="max-w-32 truncate">{owner}</span>
						<DropdownMenu.Root>
							<DropdownMenu.Trigger
								class="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
								aria-label={m.owner_rename_title({ name: owner })}
							>
								<EllipsisIcon class="size-3" aria-hidden="true" />
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="start">
								<DropdownMenu.Item onSelect={() => startRename(owner)}>
									{m.owner_rename()}
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
						{#if !lockedKeys.has(ownerKey(owner))}
							<button
								type="button"
								class="mr-0.5 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
								aria-label={m.owner_remove({ name: owner })}
								onclick={() => remove(owner)}
							>
								<XIcon class="size-3" aria-hidden="true" />
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		<form
			onsubmit={(e) => {
				e.preventDefault();
				add(text);
			}}
		>
			<Input
				bind:value={text}
				onkeydown={guardSubmit}
				placeholder={m.owner_input()}
				aria-label={m.owner_input()}
				class="h-8"
				data-testid="owner-input"
			/>
		</form>
		{#if showSuggestions}
			<p class="mt-2 mb-1 px-1 text-xs text-muted-foreground">{m.owner_suggestions()}</p>
			<ul>
				{#each filtered as name (name)}
					<li>
						<button
							type="button"
							class="w-full rounded-sm px-2 py-1 text-left text-sm hover:bg-accent"
							onclick={() => add(name)}
						>
							{name}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</Popover.Content>
</Popover.Root>

<Dialog.Root open={renameFrom !== null} onOpenChange={(o) => !o && (renameFrom = null)}>
	<Dialog.Content class="sm:max-w-sm">
		<form onsubmit={confirmRename} class="flex flex-col gap-4">
			<Dialog.Header>
				<Dialog.Title>{m.owner_rename_title({ name: renameFrom ?? '' })}</Dialog.Title>
				<Dialog.Description>{m.owner_rename_body({ name: renameFrom ?? '' })}</Dialog.Description>
			</Dialog.Header>
			<Input onkeydown={guardSubmit} bind:value={renameTo} aria-label={m.owner_input()} />
			<Dialog.Footer>
				<Button type="button" variant="ghost" onclick={() => (renameFrom = null)}>
					{m.action_cancel()}
				</Button>
				<Button type="submit" disabled={!renameTo.trim()}>{m.action_rename()}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
