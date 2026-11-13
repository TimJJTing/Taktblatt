<!--
	The diagram view switch in the Timeline heading. Refer to docs/spec.md, section 5.13.
	One radio group. Only the selected choice is in the Tab order. Arrows wrap; Home and End go
	to the first and last choice. The switch is absent when only Gantt is registered.
	The frame and the focus ring are inset outlines. They add no height to the heading row
	(section 4.4), and the next row cannot cover them.
-->
<script lang="ts" module>
	import { focusRadio, radioGroupIndex } from '#lib/browser/keyboard.ts';

	/** Focuses the selected choice of the switch that controls the region `controls`. */
	export function focusSelectedChoice(controls: string): void {
		document
			.querySelector<HTMLElement>(
				`[role="radio"][aria-controls="${CSS.escape(controls)}"][aria-checked="true"]`
			)
			?.focus();
	}
</script>

<script lang="ts">
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

	function onKeydown(event: KeyboardEvent, index: number) {
		const next = radioGroupIndex(event, index, views.length);
		if (next === null) return;
		event.preventDefault();
		viewer.setDiagramView(views[next].id);
		focusRadio(group, next);
	}
</script>

{#if views.length > 1}
	<div
		bind:this={group}
		role="radiogroup"
		aria-label={m.diagram_view_switch()}
		class="flex min-w-0 flex-wrap items-center gap-0.5 rounded-md outline outline-1 -outline-offset-1 outline-border"
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
					'min-h-6 rounded px-2 text-xs focus-visible:outline-2 focus-visible:-outline-offset-4 forced-colors:border forced-colors:border-transparent',
					selected
						? 'bg-primary text-primary-foreground focus-visible:outline-primary-foreground forced-colors:border-[Highlight] forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:forced-color-adjust-none forced-colors:focus-visible:outline-[HighlightText]'
						: 'text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-ring'
				)}
				onclick={() => viewer.setDiagramView(view.id)}
				onkeydown={(event) => onKeydown(event, index)}
				data-testid="diagram-view-{view.id}"
			>
				{view.label()}
			</button>
		{/each}
	</div>
{/if}
