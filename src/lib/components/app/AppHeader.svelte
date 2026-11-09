<script lang="ts">
	import EyeIcon from '@lucide/svelte/icons/eye';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import Redo2Icon from '@lucide/svelte/icons/redo-2';
	import Undo2Icon from '@lucide/svelte/icons/undo-2';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { getPreview } from '#lib/state/preview.svelte.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';
	import ExportMenu from './ExportMenu.svelte';
	import Hint from './Hint.svelte';
	import ImportButton from './ImportButton.svelte';
	import PlanSwitcher from './PlanSwitcher.svelte';
	import SettingsMenu from './SettingsMenu.svelte';

	const ws = getWorkspace();
	const preview = getPreview();
	const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
	const mod = isMac ? '⌘' : 'Ctrl+';
</script>

<header
	data-app-header
	class="sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b bg-background/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/75"
>
	<div class="flex h-12 w-full items-center gap-2">
		<span class="shrink-0 px-1 font-semibold tracking-tight max-sm:hidden">{m.app_name()}</span>
		<span class="shrink-0 text-muted-foreground max-sm:hidden" aria-hidden="true">/</span>
		<PlanSwitcher />

		<div class="ml-auto flex shrink-0 items-center gap-1">
			<Button
				variant="ghost"
				size="sm"
				class="max-sm:px-2"
				onclick={(event) => preview.show(event.currentTarget)}
				data-testid="preview-open"
			>
				<EyeIcon aria-hidden="true" /><span class="max-sm:sr-only">{m.action_preview()}</span>
			</Button>
			<Button
				variant="ghost"
				size="sm"
				class="max-sm:px-2"
				onclick={() => preview.print()}
				data-testid="print"
			>
				<PrinterIcon aria-hidden="true" /><span class="max-sm:sr-only">{m.action_print()}</span>
			</Button>
			<ImportButton />
			<ExportMenu />
			<Hint text={m.label_parenthetical({ name: m.action_undo(), qualifier: `${mod}Z` })}>
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
			</Hint>
			<Hint
				text={m.label_parenthetical({ name: m.action_redo(), qualifier: isMac ? '⇧⌘Z' : 'Ctrl+Y' })}
			>
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
			</Hint>
			<SettingsMenu />
		</div>
	</div>
</header>
