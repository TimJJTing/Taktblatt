<script lang="ts">
	import TaskMark from './TaskMark.svelte';
	import DiagramRing from './DiagramRing.svelte';
	import TaskTap from './TaskTap.svelte';
	import type { TaskStatus } from '#lib/domain/schema.ts';
	import type { GanttMarkGeom } from '#lib/scene/gantt-scene.ts';
	import type { Junction } from '#lib/scene/types.ts';
	let {
		still = false,
		status = 'todo',
		offRoute = true,
		route = 'off'
	}: {
		still?: boolean;
		status?: TaskStatus;
		offRoute?: boolean;
		route?: 'lit' | 'off' | null;
	} = $props();
	const geom: GanttMarkGeom = {
		id: 'child',
		mark: { kind: 'bar', x0: 0, x1: 1, clipStart: false, clipEnd: false },
		line: { x0: 10, x1: 110, y: 20, height: 6 },
		stations: [
			{ x: 13, y: 20, r: 3, inset: 1 },
			{ x: 107, y: 20, r: 3, inset: 1 }
		]
	};
	const junction: Junction = {
		key: 'ring',
		trunk: 'trunk',
		kind: 'junction',
		point: { x: { f: 0, px: 150 }, y: { f: 0, px: 20 } },
		edges: ['a->b']
	};
	const tap: Junction = { ...junction, key: 'tap', kind: 'tap', source: 'child' };
</script>

<div
	style="--background:#ffffff;--foreground:#111111;--muted-foreground:#555555;color:#555555;background:#ffffff;position:relative;width:300px;height:50px"
>
	<div data-testid="paint-mark" style="position:absolute;left:10px;top:20px;width:100px;height:6px">
		<TaskMark
			{geom}
			box={{ x0: 10, x1: 110 }}
			{status}
			color="#cc0000"
			width={300}
			subtask
			{offRoute}
			{still}
		/>
	</div>
	<svg aria-hidden="true" width="300" height="50"
		><DiagramRing {junction} width={300} {route} {still} /></svg
	>
	<TaskTap {tap} width={300} left={0} {route} {still} />
</div>
