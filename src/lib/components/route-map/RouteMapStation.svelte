<script lang="ts">
	import { mergeProps } from 'bits-ui';
	import { untrack } from 'svelte';
	import type { Action } from 'svelte/action';
	import Hint from '#lib/components/app/Hint.svelte';
	import ReadyDot from '#lib/components/edit/ReadyDot.svelte';
	import RouteMapStationGlyph from './RouteMapStationGlyph.svelte';
	import TaskStatusIcon from '#lib/components/task/TaskStatusIcon.svelte';
	import { taskStatusLabel } from '#lib/components/task/task-status.ts';
	import { GeometryTween } from '#lib/components/diagram/geometry-tween.svelte.ts';
	import { stageColorVar, type RoutePaint } from '#lib/components/plan/colors.ts';
	import { readyLight } from '#lib/domain/derive.ts';
	import { formatRangeDisplay, joinSentences } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import type { RouteMapNode } from '#lib/domain/route-map.ts';
	import type { Stage } from '#lib/domain/schema.ts';
	import { motionDuration } from '#lib/motion.ts';
	import { m } from '#lib/paraglide/messages.js';
	import type { RouteMapSign, RouteMapStation } from '#lib/scene/route-map-layout.ts';
	import { getEditing } from '#lib/state/editing.svelte.ts';
	import { getViewer } from '#lib/state/viewer.svelte.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';

	import RouteMapTerminus from './RouteMapTerminus.svelte';
	import RouteMapInterchange from './RouteMapInterchange.svelte';

	let {
		sign,
		stages,
		node,
		station,
		stage,
		routeTarget,
		route,
		hasChildren,
		expanded,
		controls,
		description,
		onTitleHeight
	}: {
		sign?: RouteMapSign;
		stages: ReadonlyMap<string, Stage>;
		node: RouteMapNode;
		station: RouteMapStation;
		stage: Stage;
		routeTarget: Action<HTMLElement, string>;
		route: RoutePaint;
		hasChildren: boolean;
		expanded: boolean;
		controls: string;
		description: string;
		onTitleHeight?: (id: string, height: number) => void;
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
	const dateHint = $derived(
		m.gantt_bar({
			task: title,
			dates: formatRangeDisplay(
				ws.index.state.get(node.id)?.eff.start ?? null,
				ws.index.state.get(node.id)?.eff.end ?? null,
				uiIntl()
			)
		})
	);
	let titleContent: HTMLSpanElement;
	$effect(() => {
		const element = titleContent;
		if (!element) return;
		const update = () =>
			onTitleHeight?.(
				node.id,
				Math.max(16, Math.min(32, Math.ceil(element.getBoundingClientRect().height)))
			);
		const observer = new ResizeObserver(update);
		observer.observe(element);
		update();
		return () => observer.disconnect();
	});
	const readiness = $derived(readyLight(ws.index.state.get(node.id)!.readiness));
	const fullDescription = $derived(
		joinSentences(
			[
				description,
				hasChildren
					? m.route_map_subtask_count({ count: ws.index.children.get(node.id)?.length ?? 0 })
					: '',
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
		<Hint text={dateHint}>
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
					aria-describedby={[props['aria-describedby'], fullDescription ? descriptionId : undefined]
						.filter(Boolean)
						.join(' ') || undefined}
					data-route-target={node.id}
					data-route-focus="keyboard"
					data-route-touch
					use:routeTarget={node.id}
					data-diagram-task={node.id}
					data-column={station.column}
					data-diagram-parent={node.parentId ?? undefined}
					data-route={route ?? undefined}
				>
					{#if sign?.kind === 'terminus'}<RouteMapTerminus
							{sign}
						/>{:else if sign}<RouteMapInterchange {sign} {stages} />{/if}
					<span data-diagram-station={node.id} class="relative flex"
						><RouteMapStationGlyph
							color={stageColorVar(stage.color)}
							size={node.parentId ? 6 : hasChildren ? 10 : 8}
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
					class="absolute z-10 rounded-sm text-center text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring"
					style:left="{geom.current.labelBox.x}px"
					style:top="{geom.current.labelBox.y}px"
					style:width="{geom.current.labelBox.w}px"
					style:max-height="{geom.current.labelBox.h - (hasChildren ? 24 : 0)}px"
					data-route-target={node.id}
					use:routeTarget={node.id}
					aria-label={title}
					aria-describedby={[props['aria-describedby'], fullDescription ? descriptionId : undefined]
						.filter(Boolean)
						.join(' ') || undefined}
					data-diagram-label={node.id}
				>
					<span class="inline-flex max-w-full items-start justify-center gap-1">
						<Hint text={taskStatusLabel(node.status)} focusable={false}>
							{#snippet child({ props })}<span
									{...props}
									data-route-map-status={node.status}
									role="img"
									aria-label={taskStatusLabel(node.status)}
									class="mt-0.5 flex shrink-0"
									><TaskStatusIcon status={node.status} class="size-3" /></span
								>{/snippet}
						</Hint>
						<ReadyDot readiness={ws.index.state.get(node.id)!.readiness} />
						<span bind:this={titleContent} class="line-clamp-2 min-w-0 leading-4">{title}</span>
					</span>
				</button>
			{/snippet}
		</Hint>
		{#if hasChildren}
			<div
				data-route-map-controls={node.id}
				class="absolute z-10 flex h-6 items-center justify-center gap-0 text-xs text-muted-foreground"
				style:left="{geom.current.labelBox.x}px"
				style:top="{geom.current.labelBox.y + geom.current.labelBox.h - 24}px"
				style:width="{geom.current.labelBox.w}px"
			>
				<span class="pointer-events-none w-4 text-center"
					>{ws.index.children.get(node.id)?.length ?? 0}</span
				>
				<button
					type="button"
					class="flex size-6 shrink-0 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
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
			</div>
		{/if}
	</div>
</div>
