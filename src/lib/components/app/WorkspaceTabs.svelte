<script lang="ts">
	import { getViewer } from '#lib/state/viewer.svelte.ts';
	import { m } from '#lib/paraglide/messages.js';

	const viewer = getViewer();
	const tabs = ['plan', 'work-plan'] as const;

	function onKey(event: KeyboardEvent, index: number) {
		const next = {
			ArrowLeft: 1 - index,
			ArrowRight: 1 - index,
			Home: 0,
			End: 1
		}[event.key];
		if (next === undefined) return;
		event.preventDefault();
		viewer.setNarrowTab(tabs[next]);
		document.getElementById(`workspace-tab-${tabs[next]}`)?.focus();
	}
</script>

<div class="w-full pb-2 lg:hidden">
	<div
		role="tablist"
		aria-label={m.workspace_view()}
		class="flex h-9 w-full rounded-md bg-muted p-0.5 sm:w-fit"
	>
		{#each tabs as tab, index (tab)}
			<button
				type="button"
				role="tab"
				id="workspace-tab-{tab}"
				aria-controls={tab === 'plan' ? 'plan-pane' : 'work-pane'}
				aria-selected={viewer.narrowTab === tab}
				tabindex={viewer.narrowTab === tab ? 0 : -1}
				class="flex-1 rounded border border-transparent px-4 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-ring aria-selected:border-border aria-selected:bg-background aria-selected:shadow-xs"
				onclick={() => viewer.setNarrowTab(tab)}
				onfocus={() => {
					if (viewer.narrowTab !== tab) viewer.setNarrowTab(tab);
				}}
				onkeydown={(event) => onKey(event, index)}
			>
				{tab === 'plan' ? m.workspace_plan() : m.section_work_plan()}
			</button>
		{/each}
	</div>
</div>
