<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.ts';

	let {
		expanded,
		task,
		onToggle,
		controls,
		large,
		testid,
		class: className,
		...rest
	}: HTMLButtonAttributes & {
		expanded: boolean;
		task: string;
		onToggle: (event: MouseEvent) => void;
		controls?: string;
		large?: boolean;
		testid?: string;
	} = $props();
</script>

<button
	{...rest}
	type="button"
	class={cn(
		'flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
		large && 'box-content border-2 border-transparent bg-clip-padding',
		className
	)}
	aria-expanded={expanded}
	aria-label={expanded ? m.task_collapse({ task }) : m.task_expand({ task })}
	aria-controls={controls}
	onclick={onToggle}
	data-testid={testid}
>
	<span
		class={cn('flex transition-transform', expanded && 'rotate-90')}
		style:transition-duration={`${motionDuration(200)}ms`}
		aria-hidden="true"><ChevronRightIcon class="size-3.5" /></span
	>
</button>
