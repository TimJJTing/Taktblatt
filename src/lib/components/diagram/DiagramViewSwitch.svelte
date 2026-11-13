<!--
	The diagram view switch in the Timeline heading. Refer to docs/spec.md, section 5.13.
	One radio group. Only the selected choice is in the Tab order. Arrows wrap; Home and End go
	to the first and last choice. The switch is absent when only Gantt is registered.
-->
<script lang="ts">
	import { isComposing } from '#lib/browser/keyboard.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { getViewer } from '#lib/state/viewer.svelte.ts';
	import { cn } from '#lib/utils.ts';
	import { getViewRegistry } from './view-registry.ts';

	interface Props {
		/** The id of the diagram region that the choices control. */
		controls: string;
	}

	let { controls }: Props = $props();

	const viewer = getViewer();
	const registry = getViewRegistry();
	const views = registry.views;

	let group = $state<HTMLDivElement | null>(null);

	function select(index: number, focus: boolean) {
		viewer.setDiagramView(views[index].id);
		if (focus) group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
	}

	function onKeydown(event: KeyboardEvent, index: number) {
		if (isComposing(event)) return;
		const last = views.length - 1;
		let next: number;
		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				next = index === last ? 0 : index + 1;
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				next = index === 0 ? last : index - 1;
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = last;
				break;
			default:
				return;
		}
		event.preventDefault();
		select(next, true);
	}
</script>

{#if views.length > 1}
	<div
		bind:this={group}
		role="radiogroup"
		aria-label={m.diagram_view_switch()}
		class="flex min-w-0 flex-wrap items-center gap-0.5 rounded-md border p-0.5"
		data-testid="diagram-view-switch"
	>
		{#each views as view, index (view.id)}
			{@const selected = viewer.diagramView === view.id}
			<button
				type="button"
				role="radio"
				aria-checked={selected}
				aria-controls={controls}
				tabindex={selected ? 0 : -1}
				class={cn(
					'min-h-6 rounded px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring forced-colors:border forced-colors:border-transparent',
					selected
						? 'bg-primary text-primary-foreground forced-colors:border-[Highlight]'
						: 'text-muted-foreground hover:bg-accent hover:text-foreground'
				)}
				onclick={() => select(index, false)}
				onkeydown={(event) => onKeydown(event, index)}
				data-testid="diagram-view-{view.id}"
			>
				{view.label()}
			</button>
		{/each}
	</div>
{/if}
