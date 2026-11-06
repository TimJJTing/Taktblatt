<!--
	The "+" line: a thin rule with a round "+" button. The button is always at the horizontal center
	of the container, so lines with different indents keep their buttons on one axis.
	In a container that scrolls sideways, set `pinned`. The button then stays at the center of the visible
	width. An ancestor that has the width of the scroll container must be a `@container` (the button uses `cqw` units).
	`size` sets the size of the button: "sm" for the lowest level (subtask), "md" (default) for the middle
	level (task, remark), "lg" for the top level (stage, remark section). All sizes are centered on the rule.
	The line itself lets pointer events through, so an invisible line never blocks the content below it.
	The parent controls the visibility with `class` (hover or focus-within of a scope).
-->
<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { mergeProps } from 'bits-ui';
	import Hint from '#lib/components/app/Hint.svelte';
	import { motionDuration } from '#lib/motion.js';
	import { cn } from '#lib/utils.js';

	type Size = 'sm' | 'md' | 'lg';

	/** Button and icon classes of each size. */
	const sizes: Record<Size, { button: string; icon: string }> = {
		sm: { button: 'size-3.5', icon: 'size-2.5' },
		md: { button: 'size-4.5', icon: 'size-3' },
		lg: { button: 'size-6', icon: 'size-3.5' }
	};

	interface Props {
		label: string;
		/** Where the line starts, in px from the left edge. */
		indent?: number;
		/** Keep the button at the center of the visible width of a sideways scrolling container. */
		pinned?: boolean;
		/** The level of the line in the hierarchy. */
		size?: Size;
		onAdd: () => void;
		class?: string;
		testId?: string;
	}

	let {
		label,
		indent = 0,
		pinned = false,
		size = 'md',
		onAdd,
		class: className,
		testId
	}: Props = $props();
</script>

<div
	class={cn(
		'add-line pointer-events-none relative h-5 transition-opacity [@media(hover:none)]:opacity-100',
		className
	)}
	style:transition-duration={`${motionDuration(200)}ms`}
>
	<div
		class="absolute top-1/2 right-0 h-px bg-border"
		style:left="{indent}px"
		aria-hidden="true"
	></div>
	<div class={cn('h-full', pinned && 'sticky left-0 w-[100cqw]')}>
		<Hint text={label}>
			{#snippet child({ props })}
				<button
					{...mergeProps(props, { onclick: onAdd })}
					type="button"
					aria-label={label}
					class={cn(
						"pointer-events-auto absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-xs transition after:absolute after:-inset-0.5 after:content-[''] hover:scale-110 hover:border-foreground/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
						sizes[size].button
					)}
					style:transition-duration={`${motionDuration(150)}ms`}
					data-testid={testId}
				>
					<PlusIcon class={sizes[size].icon} aria-hidden="true" />
				</button>
			{/snippet}
		</Hint>
	</div>
</div>
