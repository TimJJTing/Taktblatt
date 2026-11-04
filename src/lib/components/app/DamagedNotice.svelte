<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { Button } from '#lib/components/ui/button/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { downloadText } from '#lib/browser/download.js';
	import { getWorkspace } from '#lib/state/workspace.svelte.js';

	const ws = getWorkspace();

	function download() {
		const text = ws.damaged.map((d) => `${d.key}\n${d.raw}`).join('\n\n');
		downloadText('taktblatt-damaged-data.txt', text, 'text/plain');
	}
</script>

{#if ws.damaged.length > 0}
	<div
		role="alert"
		class="mx-auto mt-4 flex max-w-6xl items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
	>
		<TriangleAlertIcon class="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
		<div class="flex-1">
			<p class="font-medium">{m.damaged_title()}</p>
			<p class="text-sm text-muted-foreground">{m.damaged_body()}</p>
		</div>
		<Button size="sm" variant="outline" onclick={download}>{m.damaged_download()}</Button>
		<Button size="sm" variant="ghost" onclick={() => (ws.damaged = [])}
			>{m.damaged_dismiss()}</Button
		>
	</div>
{/if}
