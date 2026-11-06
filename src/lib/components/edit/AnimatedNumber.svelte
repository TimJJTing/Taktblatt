<!-- A number that tweens to its new value, so the eye can follow the change. -->
<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import { Tween } from 'svelte/motion';
	import { motionDuration } from '#lib/motion.ts';

	let { value }: { value: number } = $props();

	const tween = Tween.of(() => value, {
		duration: () => motionDuration(300),
		easing: cubicOut
	});
</script>

<span class="tabular-nums">{Math.round(tween.current)}</span>
