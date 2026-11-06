<!--
	Shows a hint in a Tooltip on hover and on keyboard focus. Refer to docs/spec.md, section 5.10.
	Use it for every hint. Do not use the native `title` attribute.
	The child snippet gets the trigger props. Spread them on the target element. When the target
	also is a Popover or DropdownMenu trigger, or has its own handlers, merge them with `mergeProps`
	from bits-ui.
	When `text` is empty, the child gets empty props and no tooltip opens. The target element stays
	mounted, so that its focus and its popover anchor do not change.
	Print sheets do not use hints.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';

	interface Props {
		/** The hint text. Empty or undefined shows no tooltip. */
		text?: string;
		/** The side of the target where the tooltip opens. */
		side?: 'top' | 'right' | 'bottom' | 'left';
		/**
		 * Set `false` for a target that is not a control, for example a status mark.
		 * The target then gets no tab stop, and the hint shows on hover only.
		 */
		focusable?: boolean;
		/** Renders the target element. Spread or merge `props` on it. */
		child: Snippet<[{ props: Record<string, unknown> }]>;
	}

	let { text, side, focusable = true, child: target }: Props = $props();

	function triggerProps(props: Record<string, unknown>): Record<string, unknown> {
		if (!text) return {};
		if (focusable) return props;
		// Remove the button attributes of the trigger. They do not apply to a status mark.
		// Svelte does not render an attribute with the value undefined.
		return { ...props, tabindex: undefined, type: undefined, disabled: undefined };
	}
</script>

<Tooltip.Root disabled={!text}>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			{@render target({ props: triggerProps(props) })}
		{/snippet}
	</Tooltip.Trigger>
	{#if text}
		<Tooltip.Content {side}>{text}</Tooltip.Content>
	{/if}
</Tooltip.Root>
