<!--
	The "+" line: a thin rule with a round "+" button. The button is always at the horizontal center
	of the container, so lines with different indents keep their buttons on one axis.
	In a container that scrolls sideways, set `pinned`. The button then stays at the center of the visible
	width. The scroll container must be a `@container` (the button uses `cqw` units).
	The parent controls the visibility with `class` (hover or focus-within of a scope).
-->
<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { motionDuration } from '#lib/motion.js';
	import { cn } from '#lib/utils.js';

	interface Props {
		label: string;
		/** Where the line starts, in px from the left edge. */
		indent?: number;
		/** Keep the button at the center of the visible width of a sideways scrolling container. */
		pinned?: boolean;
		onAdd: () => void;
		class?: string;
		testId?: string;
	}

	let { label, indent = 0, pinned = false, onAdd, class: className, testId }: Props = $props();
</script>

<div
	class={cn('add-line relative h-5 transition-opacity [@media(hover:none)]:opacity-100', className)}
	style:transition-duration={`${motionDuration(200)}ms`}
>
	<div
		class="absolute top-1/2 right-0 h-px bg-border"
		style:left="{indent}px"
		aria-hidden="true"
	></div>
	<div class={cn('h-full', pinned && 'sticky left-0 w-[100cqw]')}>
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
</div>
