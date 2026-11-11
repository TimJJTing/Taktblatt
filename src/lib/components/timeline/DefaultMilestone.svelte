<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';

	let { class: className, ...rest }: SVGAttributes<SVGSVGElement> = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width="14"
	height="14"
	viewBox="0 0 14 14"
	class={className}
	{...rest}
>
	<circle cx="7" cy="7" r="5.75" fill="none" stroke="currentColor" stroke-width="2.5" />
</svg>

<style>
	@media (forced-colors: active) {
		circle {
			stroke: CanvasText;
		}
	}
</style>
