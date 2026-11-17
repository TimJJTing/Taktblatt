<script lang="ts">
	import { Dialog as SheetPrimitive } from 'bits-ui';
	import { motionDuration } from '#lib/motion.js';
	import { cn } from '#lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		style,
		...restProps
	}: SheetPrimitive.OverlayProps = $props();

	// The open and close motion follows motionDuration (reduced motion: no motion).
	const motionStyle = $derived(
		`animation-duration: ${motionDuration(100)}ms; transition-duration: ${motionDuration(100)}ms;${style ? ` ${style}` : ''}`
	);
</script>

<SheetPrimitive.Overlay
	bind:ref
	data-slot="sheet-overlay"
	class={cn(
		'fixed inset-0 z-50 bg-black/10 duration-100 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 supports-backdrop-filter:backdrop-blur-xs',
		className
	)}
	{...restProps}
	style={motionStyle}
/>
