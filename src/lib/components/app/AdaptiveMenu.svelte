<!--
	Use a bottom sheet for a coarse primary pointer. Use a dropdown otherwise.
	Actions close the menu first. A reopen settles the pending action.
	The snippets are triggerButton(props), sheet({ act, run }) and dropdown({ act, run }).
	The run function uses actSync when the action has sync set. Otherwise, it uses act.
	The caller must bind the trigger element and pass it as trigger.
	This element is needed for focus return and action handoff.
-->
<script lang="ts">
	import { mergeProps } from 'bits-ui';
	import { onDestroy, untrack, type Snippet } from 'svelte';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { coarsePointer } from './app-layout.svelte.ts';
	import BottomSheet from './BottomSheet.svelte';
	import Hint from './Hint.svelte';
	import { createMenuHandoff } from './menu-handoff.ts';
	import type { MenuAction, MenuActions } from './menu-action.ts';

	let {
		title,
		subtitle,
		testId,
		hint,
		trigger,
		triggerButton,
		sheet,
		dropdown,
		align = 'end',
		contentClass = 'min-w-64 p-1.5'
	}: {
		title: string;
		subtitle?: string;
		testId: string;
		hint?: string;
		trigger: HTMLButtonElement | null;
		triggerButton: Snippet<[Record<string, unknown>]>;
		sheet: Snippet<[MenuActions]>;
		dropdown: Snippet<[MenuActions]>;
		align?: 'start' | 'end';
		contentClass?: string;
	} = $props();

	let open = $state(false);
	let handoff = $state(false);
	const menuHandoff = createMenuHandoff({
		close: () => (open = false),
		focus: () => trigger?.focus(),
		setActive: (active) => (handoff = active)
	});
	onDestroy(menuHandoff.destroy);

	let previousCoarse = coarsePointer.current;
	$effect.pre(() => {
		const coarse = coarsePointer.current;
		if (coarse === previousCoarse) return;
		previousCoarse = coarse;
		// The old root cannot report close completion after its branch is removed.
		untrack(() => menuHandoff.complete(false));
	});

	const actions: MenuActions = {
		act: menuHandoff.act,
		run: (action: MenuAction) =>
			(action.sync ? menuHandoff.actSync : menuHandoff.act)(action.handler)
	};

	function complete(value: boolean) {
		if (!open) menuHandoff.complete(value);
	}
</script>

{#if coarsePointer.current}
	<Hint text={hint}>
		{#snippet child({ props })}
			{@render triggerButton(
				mergeProps(props, {
					'aria-haspopup': 'dialog',
					'aria-expanded': open,
					onclick: () => {
						menuHandoff.reopen();
						open = true;
					}
				})
			)}
		{/snippet}
	</Hint>
	<BottomSheet
		bind:open
		{trigger}
		{handoff}
		{title}
		{subtitle}
		{testId}
		onOpenChangeComplete={complete}
	>
		{@render sheet(actions)}
	</BottomSheet>
{:else}
	<DropdownMenu.Root
		bind:open
		onOpenChangeComplete={complete}
		onOpenChange={(value) => {
			if (value) menuHandoff.reopen();
		}}
	>
		<Hint text={hint}>
			{#snippet child({ props: hintProps })}
				<DropdownMenu.Trigger>
					{#snippet child({ props: menuProps })}
						{@render triggerButton(mergeProps(hintProps, menuProps))}
					{/snippet}
				</DropdownMenu.Trigger>
			{/snippet}
		</Hint>
		<DropdownMenu.Content
			{align}
			class={contentClass}
			style="animation-duration: {motionDuration(100)}ms; transition-duration: {motionDuration(
				100
			)}ms"
			onCloseAutoFocus={(event) => {
				if (handoff) event.preventDefault();
			}}
		>
			{@render dropdown(actions)}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}
