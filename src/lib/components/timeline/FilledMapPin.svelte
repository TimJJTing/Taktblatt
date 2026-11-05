<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';

	let { class: className, ...rest }: SVGAttributes<SVGSVGElement> = $props();
</script>

<!-- Keep the pin centre open when the milestone uses a fill. -->
<svg
	xmlns="http://www.w3.org/2000/svg"
	width="24"
	height="24"
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={['lucide', 'lucide-map-pin', className]}
	{...rest}
>
	<path
		fill-rule="evenodd"
		d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0Z M16 10a4 4 0 1 0-8 0 4 4 0 1 0 8 0Z"
	/>
</svg>
