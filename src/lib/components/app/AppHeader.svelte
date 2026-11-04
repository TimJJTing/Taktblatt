<script lang="ts">
	import EyeIcon from '@lucide/svelte/icons/eye';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import Redo2Icon from '@lucide/svelte/icons/redo-2';
	import Undo2Icon from '@lucide/svelte/icons/undo-2';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getPreview } from '#lib/state/preview.svelte.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';
	import { appHeader } from './app-layout.svelte.js';
	import LanguageMenu from './LanguageMenu.svelte';
	import PlanSwitcher from './PlanSwitcher.svelte';
	import { SECTIONS } from './sections.js';

	const ws = getWorkspace();
	const preview = getPreview();
	const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
	const mod = isMac ? '⌘' : 'Ctrl+';

	let element = $state<HTMLElement | null>(null);

	// Share the header height. Anchor jumps and the pinned Gantt use it.
	$effect(() => {
		if (!element) return;
		const header = element;
		const root = document.documentElement;
		const measure = () => {
			appHeader.height = header.offsetHeight;
			root.style.setProperty('--app-header-h', `${header.offsetHeight}px`);
		};
		const observer = new ResizeObserver(measure);
		observer.observe(header);
		measure();
		return () => {
			observer.disconnect();
			root.style.removeProperty('--app-header-h');
		};
	});
</script>

<header
	bind:this={element}
	data-app-header
	class="sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b bg-background/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 print:hidden"
>
	<div class="flex h-12 w-full items-center gap-2">
		<span class="px-1 font-semibold tracking-tight">{m.app_name()}</span>
		<span class="text-muted-foreground" aria-hidden="true">/</span>
		<PlanSwitcher />

		<div class="ml-auto flex items-center gap-1">
			<Button
				variant="ghost"
				size="sm"
				onclick={(event) => preview.show(event.currentTarget)}
				data-testid="preview-open"
			>
				<EyeIcon aria-hidden="true" /><span class="max-sm:sr-only">{m.action_preview()}</span>
			</Button>
			<Button variant="ghost" size="sm" onclick={() => window.print()} data-testid="print">
				<PrinterIcon aria-hidden="true" /><span class="max-sm:sr-only">{m.action_print()}</span>
			</Button>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							aria-label={m.action_undo()}
							disabled={!ws.history.canUndo}
							onclick={() => ws.undo()}
						>
							<Undo2Icon aria-hidden="true" />
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>{m.action_undo()} ({mod}Z)</Tooltip.Content>
			</Tooltip.Root>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							aria-label={m.action_redo()}
							disabled={!ws.history.canRedo}
							onclick={() => ws.redo()}
						>
							<Redo2Icon aria-hidden="true" />
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>{m.action_redo()} ({isMac ? '⇧⌘Z' : 'Ctrl+Y'})</Tooltip.Content>
			</Tooltip.Root>
			<LanguageMenu />
		</div>
	</div>
	<nav aria-label={m.section_navigation()} class="flex w-full gap-1 overflow-x-auto pb-2 text-xs">
		{#each SECTIONS as section (section.id)}
			<a
				href="#{section.id}"
				class="shrink-0 rounded px-3 py-1.5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
				>{section.label()}</a
			>
		{/each}
	</nav>
</header>
