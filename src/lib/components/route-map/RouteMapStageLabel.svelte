<script lang="ts">
	import { untrack } from 'svelte';
	import Hint from '#lib/components/app/Hint.svelte';
	import StageBadge from '#lib/components/diagram/StageBadge.svelte';
	import { GeometryTween } from '#lib/components/diagram/geometry-tween.svelte.ts';
	import type { Stage } from '#lib/domain/schema.ts';
	import type { RouteMapStageLabel } from '#lib/scene/route-map-layout.ts';
	import { m } from '#lib/paraglide/messages.js';
	let {
		label,
		stage,
		index,
		still = false
	}: {
		label: RouteMapStageLabel;
		stage: Stage;
		index: number;
		still?: boolean;
	} = $props();
	const geom = new GeometryTween(untrack(() => label.box));
	$effect(() => geom.set(label.box, { still }));
</script>

<div
	class="absolute text-center text-xs"
	style:left="{geom.current.x}px"
	style:top="{geom.current.y}px"
	style:width="{geom.current.w}px"
	data-testid="route-map-stage-label"
	data-stage={stage.id}
	data-host={label.hostId ?? undefined}
	data-role={label.role}
>
	<div class="flex h-5 items-center justify-center gap-1" data-stage-title>
		{#if still}
			<StageBadge color={stage.color} label={m.stage_badge({ n: index + 1 })} still />
		{:else}
			<Hint text={stage.title}
				>{#snippet child({ props })}<span {...props}>
						<StageBadge color={stage.color} label={m.stage_badge({ n: index + 1 })} />
					</span>{/snippet}</Hint
			>
		{/if}
	</div>
</div>
