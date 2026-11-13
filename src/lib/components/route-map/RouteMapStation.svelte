<script lang="ts">
	import { mergeProps } from 'bits-ui';
	import { untrack } from 'svelte';
	import type { Action } from 'svelte/action';
	import Hint from '#lib/components/app/Hint.svelte';
	import ReadyDot from '#lib/components/edit/ReadyDot.svelte';
	import StationDot from '#lib/components/diagram/StationDot.svelte';
	import { GeometryTween } from '#lib/components/diagram/geometry-tween.svelte.ts';
	import { stageColorVar, type RoutePaint } from '#lib/components/plan/colors.ts';
	import { readyLight } from '#lib/domain/derive.ts';
	import { joinSentences } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import type { RouteMapNode } from '#lib/domain/route-map.ts';
	import type { Stage } from '#lib/domain/schema.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import type { RouteMapStation } from '#lib/scene/route-map-layout.ts';
	import { getEditing } from '#lib/state/editing.svelte.ts';
	import { getViewer } from '#lib/state/viewer.svelte.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';

	let {
		node,
		station,
		stage,
		routeTarget,
		route,
		hasChildren,
		expanded,
		controls,
		description
	}: {
		node: RouteMapNode;
		station: RouteMapStation;
		stage: Stage;
		routeTarget: Action<HTMLElement, string>;
		route: RoutePaint;
		hasChildren: boolean;
		expanded: boolean;
		controls: string;
		description: string;
	} = $props();
	const ws = getWorkspace();
	const viewer = getViewer();
	const editing = getEditing();
	let button: HTMLButtonElement;
	const geom = new GeometryTween(
		untrack(() => ({ hitBox: station.hitBox, labelBox: station.labelBox }))
	);
	$effect(() => geom.set({ hitBox: station.hitBox, labelBox: station.labelBox }));
	const title = $derived(node.title || m.route_map_untitled_task());
	const status = $derived(
		{
			todo: m.task_status_todo,
			in_progress: m.task_status_in_progress,
			done: m.task_status_done,
			canceled: m.task_status_canceled
		}[node.status]()
	);
	const name = $derived(m.route_map_station_name({ task: title, stage: stage.title, status }));
	const readiness = $derived(readyLight(ws.index.state.get(node.id)!.readiness));
	const fullDescription = $derived(
		joinSentences(
			[
				description,
				readiness
					? readiness.via === 'subtasks'
						? m.ready_label_subtasks({ count: readiness.count })
						: readiness.count
							? m.ready_label({ count: readiness.count })
							: m.ready_label_plain()
					: ''
			].filter(Boolean),
			uiIntl()
		)
	);
	const descriptionId = $props.id();
	function click(event: MouseEvent) {
		if (editing.routeFocus.lastPointerType === 'touch')
			editing.routeFocus.toggleTouch(
				node.id,
				editing.routeFocus.tokenFor(event.currentTarget as Element)
			);
		else editing.openDetails(node.id, button);
	}
	function hover(event: PointerEvent, enter: boolean) {
		const token = editing.routeFocus.tokenFor(event.currentTarget as Element);
		if (enter) editing.routeFocus.hoverEnter(node.id, token, event.pointerType);
		else editing.routeFocus.hoverLeave(token, event.pointerType);
	}
</script>

<div class="contents">
	<div
		class="contents"
		role="group"
		data-route-map-task={node.id}
		data-route-map-parent={node.parentId ?? undefined}
		data-route-target={node.id}
		use:routeTarget={node.id}
		onpointerenter={(e) => hover(e, true)}
		onpointerleave={(e) => hover(e, false)}
	>
		{#if fullDescription}<span id={descriptionId} class="sr-only">{fullDescription}</span>{/if}
		<Hint text={name}>
			{#snippet child({ props })}
				<button
					{...mergeProps(props, { onclick: click })}
					bind:this={button}
					type="button"
					class="absolute z-10 flex items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					style:left="{geom.current.hitBox.x}px"
					style:top="{geom.current.hitBox.y}px"
					style:width="{geom.current.hitBox.w}px"
					style:height="{geom.current.hitBox.h}px"
					aria-label={name}
					aria-describedby={fullDescription ? descriptionId : undefined}
					data-route-target={node.id}
					data-route-focus="keyboard"
					data-route-touch
					use:routeTarget={node.id}
					data-diagram-task={node.id}
					data-diagram-parent={node.parentId ?? undefined}
					data-route={route ?? undefined}
				>
					<span data-diagram-station={node.id} class="flex"
						><StationDot
							status={node.status}
							color={stageColorVar(stage.color)}
							size={hasChildren ? 16 : 12}
							{route}
						/></span
					>
				</button>
			{/snippet}
		</Hint>
		<Hint text={title} side="bottom">
			{#snippet child({ props })}
				<button
					{...mergeProps(props, { onclick: () => editing.openDetails(node.id, button) })}
					type="button"
					class="absolute z-10 rounded-sm text-center text-xs focus-visible:outline-2 focus-visible:outline-ring"
					style:left="{geom.current.labelBox.x}px"
					style:top="{geom.current.labelBox.y}px"
					style:width="{geom.current.labelBox.w}px"
					style:max-height="{geom.current.labelBox.h}px"
					data-route-target={node.id}
					use:routeTarget={node.id}
					aria-label={title}
					aria-describedby={fullDescription ? descriptionId : undefined}
					data-diagram-label={node.id}
					><span class="inline-flex items-baseline gap-1"
						><ReadyDot readiness={ws.index.state.get(node.id)!.readiness} /><span
							class="line-clamp-2">{title}</span
						></span
					></button
				>
			{/snippet}
		</Hint>
		{#if hasChildren}
			<button
				type="button"
				class="absolute z-10 flex size-6 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
				style:left="{geom.current.labelBox.x}px"
				style:top="{geom.current.hitBox.y - 24}px"
				data-route-target={node.id}
				use:routeTarget={node.id}
				aria-label={expanded
					? m.route_map_hide_subtasks({ task: title })
					: m.route_map_show_subtasks({ task: title })}
				aria-expanded={expanded}
				aria-controls={controls}
				onclick={() => viewer.toggleExpanded(ws.plan.id, node.id)}
			>
				<span
					aria-hidden="true"
					style:transition-duration={`${motionDuration(200)}ms`}
					class:rotate-90={expanded}
					class="transition-transform">›</span
				>
			</button>
			<span
				class="pointer-events-none absolute truncate text-xs text-muted-foreground"
				style:left="{geom.current.labelBox.x + 24}px"
				style:width="{geom.current.labelBox.w - 24}px"
				style:top="{geom.current.hitBox.y - 19}px"
				>{m.route_map_subtask_count({ count: ws.index.children.get(node.id)?.length ?? 0 })}</span
			>
		{/if}
	</div>
</div>
