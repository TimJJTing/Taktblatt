<!--
	The "+" line: a thin rule with a round "+" button. The button is always at the horizontal center
	of the container, so lines with different indents keep their buttons on one axis.
	The parent controls the visibility with `class` (hover or focus-within of a scope).
-->
<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { cn } from '#lib/utils.js';

	interface Props {
		label: string;
		/** Where the line starts, in px from the left edge. */
		indent?: number;
		onAdd: () => void;
		class?: string;
		testId?: string;
	}

	let { label, indent = 0, onAdd, class: className, testId }: Props = $props();
</script>

<div
	class={cn(
		'add-line relative h-5 transition-opacity duration-200 [@media(hover:none)]:opacity-100',
		className
	)}
>
	<div
		class="absolute top-1/2 right-0 h-px bg-border"
		style:left="{indent}px"
		aria-hidden="true"
	></div>
	<button
		type="button"
		aria-label={label}
		title={label}
		class="absolute top-0.5 left-1/2 flex size-4.5 -translate-x-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-xs transition hover:scale-110 hover:border-foreground/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
		onclick={onAdd}
		data-testid={testId}
	>
		<PlusIcon class="size-3" aria-hidden="true" />
	</button>
</div>
