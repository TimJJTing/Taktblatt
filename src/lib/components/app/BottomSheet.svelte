<!-- A modal scope menu. The heading stays visible above the scrollable actions. -->
<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { untrack, type Snippet } from 'svelte';
	import { motionDuration } from '#lib/motion.ts';

	let {
		open = $bindable(false),
		title,
		subtitle,
		testId,
		trigger,
		handoff = false,
		onOpenChangeComplete,
		ref = $bindable(null),
		children
	}: {
		open?: boolean;
		title: string;
		subtitle?: string;
		testId: string;
		trigger: HTMLButtonElement | null;
		handoff?: boolean;
		onOpenChangeComplete: (open: boolean) => void;
		ref?: HTMLDivElement | null;
		children: Snippet;
	} = $props();

	let session = $state(0);
	let wasOpen = false;
	$effect.pre(() => {
		// An interrupted exit needs fresh modal layers, even while the old sheet is mounted.
		if (open && !wasOpen) untrack(() => (session += 1));
		wasOpen = open;
	});
</script>

{#key session}
	<Dialog.Root bind:open {onOpenChangeComplete}>
		<Dialog.Portal>
			<Dialog.Overlay
				class="fixed inset-0 z-50 bg-black/30 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0"
				style="animation-duration: {motionDuration(180)}ms"
			/>
			<Dialog.Content
				bind:ref
				data-testid={testId}
				class="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl bg-popover text-popover-foreground shadow-xl outline-none data-closed:animate-out data-closed:slide-out-to-bottom-full data-open:animate-in data-open:slide-in-from-bottom-full"
				style="animation-duration: {motionDuration(
					180
				)}ms; padding-bottom: env(safe-area-inset-bottom); padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right)"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					// Focus now so the first Tab starts inside the sheet, before the next frame.
					ref?.focus({ preventScroll: true });
				}}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					if (!open && !handoff) trigger?.focus();
				}}
			>
				<header class="shrink-0 px-5 pt-3 pb-4">
					<div
						aria-hidden="true"
						class="mx-auto mb-4 h-1 w-9 rounded-full bg-muted-foreground/30"
					></div>
					<Dialog.Title class="text-lg font-semibold">{title}</Dialog.Title>
					<Dialog.Description
						class={subtitle ? 'truncate text-sm text-muted-foreground' : 'sr-only'}
					>
						{subtitle ?? title}
					</Dialog.Description>
				</header>
				<div class="min-h-0 overflow-y-auto overscroll-contain px-5 pb-5">
					{@render children()}
				</div>
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
{/key}
