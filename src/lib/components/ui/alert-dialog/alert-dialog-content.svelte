<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from 'bits-ui';
	import { motionDuration } from '#lib/motion.js';
	import { cn, type WithoutChild, type WithoutChildrenOrChild } from '#lib/utils.js';
	import AlertDialogOverlay from './alert-dialog-overlay.svelte';
	import AlertDialogPortal from './alert-dialog-portal.svelte';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		style,
		size = 'default',
		portalProps,
		overlayClass,
		...restProps
	}: WithoutChild<AlertDialogPrimitive.ContentProps> & {
		size?: 'default' | 'sm';
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof AlertDialogPortal>>;
		/** Classes for the overlay, for example a higher z-index above another dialog. */
		overlayClass?: string;
	} = $props();

	// The open and close motion follows motionDuration (reduced motion: no motion).
	const motionStyle = $derived(
		`animation-duration: ${motionDuration(100)}ms; transition-duration: ${motionDuration(100)}ms;${style ? ` ${style}` : ''}`
	);
</script>

<AlertDialogPortal {...portalProps}>
	<AlertDialogOverlay class={overlayClass} />
	<AlertDialogPrimitive.Content
		bind:ref
		data-slot="alert-dialog-content"
		data-size={size}
		class={cn(
			'group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 gap-6 rounded-xl bg-popover p-6 text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-lg',
			className
		)}
		{...restProps}
		style={motionStyle}
	/>
</AlertDialogPortal>
