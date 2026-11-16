<script lang="ts">
	import { mergeProps } from 'bits-ui';
	import { untrack } from 'svelte';
	import type { Action } from 'svelte/action';
	import { createAttachmentKey, fromAction } from 'svelte/attachments';
	import Hint from '#lib/components/app/Hint.svelte';
	import { familySummaryText } from '#lib/components/diagram/family-summary.ts';
	import RouteMapStationGlyph from './RouteMapStationGlyph.svelte';
	import ExpandToggle from '#lib/components/task/ExpandToggle.svelte';
	import TaskStatusIcon from '#lib/components/task/TaskStatusIcon.svelte';
	import { taskStatusLabel } from '#lib/components/task/task-status.ts';
	import { GeometryTween } from '#lib/components/diagram/geometry-tween.svelte.ts';
	import type { DiagramLayer } from '#lib/components/diagram/diagram-layer.ts';
	import { stageColorVar, type RoutePaint } from '#lib/components/plan/colors.ts';
	import { familySummary, readyLight } from '#lib/domain/derive.ts';
	import { formatRangeDisplay, joinSentences } from '#lib/domain/format.ts';
	import { uiIntl } from '#lib/ui-language.ts';
	import type { RouteMapNode } from '#lib/domain/route-map.ts';
	import type { Stage } from '#lib/domain/schema.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { RouteMapSign, RouteMapStation } from '#lib/scene/route-map-layout.ts';
	import { getEditing } from '#lib/state/editing.svelte.ts';
	import { getViewer } from '#lib/state/viewer.svelte.ts';
	import { getWorkspace } from '#lib/state/workspace.svelte.ts';

	import RouteMapInterchange from './RouteMapInterchange.svelte';

	let {
		sign,
		node,
		station,
		measured,
		stage,
		routeTarget,
		route,
		hasChildren,
		expanded,
		controls,
		description,
		onTitleHeight,
		onControlsHeight,
		returnFocus
	}: {
		sign?: RouteMapSign;
		node: RouteMapNode;
		station: RouteMapStation;
		measured: boolean;
		stage: Stage;
		routeTarget: Action<HTMLElement, string>;
		route: RoutePaint;
		hasChildren: boolean;
		expanded: boolean;
		controls: string;
		description: string;
		onTitleHeight?: (id: string, height: number) => void;
		onControlsHeight?: (id: string, height: number) => void;
		returnFocus?: DiagramLayer['returnFocus'];
	} = $props();
	const ws = getWorkspace();
	const viewer = getViewer();
	const editing = getEditing();
	let button: HTMLButtonElement;
	const geom = new GeometryTween(
		untrack(() => ({
			hitBox: station.hitBox,
			labelBox: station.labelBox,
			controlsHeight: station.controlBoxes[0]?.h ?? 0
		}))
	);
	// Snap until this station's first measurements arrive. Later retargets keep moving.
	let initialized = $state(false);
	$effect(() => {
		geom.set(
			{
				hitBox: station.hitBox,
				labelBox: station.labelBox,
				controlsHeight: station.controlBoxes[0]?.h ?? 0
			},
			{ snap: !initialized }
		);
		initialized ||= measured;
	});
	const controlRouteTarget = {
		[createAttachmentKey()]: fromAction(
			(element: HTMLElement, id: string) => routeTarget(element, id),
			() => node.id
		)
	};
	const title = $derived(node.title || m.route_map_untitled_task());
	const summary = $derived(
		hasChildren ? familySummaryText(familySummary(ws.index, node.id), getLocale()) : ''
	);
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
	let controlsContent = $state<HTMLDivElement>();
	$effect(() => {
		const element = controlsContent;
		if (!element) return;
		const update = () =>
			onControlsHeight?.(
				node.id,
				Math.max(24, Math.min(320, Math.ceil(element.getBoundingClientRect().height)))
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
				summary,
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
		else openDetails(button);
	}
	function openDetails(from: HTMLElement) {
		editing.openDetails(node.id, from, returnFocus?.(node.id, from));
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
					<span data-diagram-station={node.id} class="relative flex"
						><RouteMapStationGlyph color={stageColorVar(stage.color)} size={8} {route} /></span
					>
					{#if sign}<RouteMapInterchange {sign} />{/if}
				</button>
			{/snippet}
		</Hint>
		<Hint text={title} side="bottom">
			{#snippet child({ props })}
				<button
					{...mergeProps(props, { onclick: () => openDetails(button) })}
					type="button"
					class="absolute z-10 rounded-sm text-center text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring"
					style:left="{geom.current.labelBox.x}px"
					style:top="{geom.current.labelBox.y}px"
					style:width="{geom.current.labelBox.w}px"
					style:max-height="{geom.current.labelBox.h - geom.current.controlsHeight}px"
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
									class="flex shrink-0"><TaskStatusIcon status={node.status} class="size-4" /></span
								>{/snippet}
						</Hint>
						<span bind:this={titleContent} class="line-clamp-2 min-w-0 leading-4 break-words"
							>{title}</span
						>
					</span>
				</button>
			{/snippet}
		</Hint>
		{#if hasChildren}
			<div
				bind:this={controlsContent}
				data-route-map-controls={node.id}
				class="absolute z-10 flex items-center justify-center gap-1 text-xs text-muted-foreground"
				style:left="{geom.current.labelBox.x}px"
				style:top="{geom.current.labelBox.y +
					geom.current.labelBox.h -
					geom.current.controlsHeight}px"
				style:width="{geom.current.labelBox.w}px"
			>
				<span class="min-w-0 text-center leading-4 wrap-anywhere">{summary}</span>
				<ExpandToggle
					{...controlRouteTarget}
					{expanded}
					task={title}
					large
					{controls}
					data-route-target={node.id}
					onToggle={() => viewer.toggleExpanded(ws.plan.id, node.id)}
				/>
			</div>
		{/if}
	</div>
</div>
