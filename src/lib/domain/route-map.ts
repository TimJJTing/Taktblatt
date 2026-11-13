const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

import { dependencyWarnings, type DependencyEdge, type DependencyWarning } from './dependencies.ts';
import { effectiveDependencies, indexTasks, stageProgress } from './derive.ts';
import { lineKey } from './route.ts';
import type { Plan, TaskStatus } from './schema.ts';

export interface RouteMapNode {
	id: string;
	stageId: string;
	parentId: string | null;
	title: string;
	status: TaskStatus;
	start: string | null;
	createdAt: string;
}
export interface RouteMapEdge {
	key: string;
	from: string;
	to: string;
	cycle: boolean;
	stored: readonly DependencyEdge[];
}
export interface RouteMapModel {
	nodes: readonly RouteMapNode[];
	groups: readonly { id: string; taskIds: readonly string[] }[];
	stages: readonly { id: string; toGo: number }[];
	effectivePairs: readonly { from: string; to: string }[];
	edges: readonly RouteMapEdge[];
	warnings: readonly DependencyWarning[];
}

export function routeMapModel(plan: Plan, expanded: ReadonlySet<string>): RouteMapModel {
	const index = indexTasks(plan.tasks);
	const tasks = [...plan.tasks].sort((a, b) => compareIds(a.id, b.id));
	const visible = tasks.filter((t) => t.parentId === null || expanded.has(t.parentId));
	const ids = new Set(visible.map((t) => t.id));
	const proxy = (id: string) => (ids.has(id) ? id : (index.byId.get(id)?.parentId ?? id));
	const nodes = visible.map((t) => {
		const state = index.state.get(t.id)!;
		return {
			id: t.id,
			stageId: t.stageId,
			parentId: t.parentId,
			title: t.title,
			status: state.eff.status,
			start: state.eff.start,
			createdAt: t.createdAt
		};
	});
	const groups = tasks
		.filter((t) => t.parentId === null)
		.map((t) => ({
			id: t.id,
			taskIds: [t.id, ...tasks.filter((c) => c.parentId === t.id).map((c) => c.id)]
		}));
	const stages = plan.stages.map((s) => {
		const p = stageProgress(index, s.id);
		return { id: s.id, toGo: p.total - p.done };
	});
	const warnings = dependencyWarnings(index);
	const effectivePairs = tasks
		.flatMap((t) => [...effectiveDependencies(index, t.id)].map((from) => ({ from, to: t.id })))
		.sort((a, b) => compareIds(a.from, b.from) || compareIds(a.to, b.to));
	const edges = new Map<
		string,
		{ key: string; from: string; to: string; cycle: boolean; stored: DependencyEdge[] }
	>();
	for (const task of visible)
		for (const dep of [...new Set(task.dependsOn)].sort()) {
			if (!index.byId.has(dep)) continue;
			const from = proxy(dep),
				to = task.id,
				key = lineKey(from, to);
			const edge = edges.get(key) ?? { key, from, to, cycle: false, stored: [] };
			edge.stored.push({ taskId: task.id, dependencyId: dep });
			edge.cycle ||= warnings.some(
				(w) => w.kind === 'cycle' && w.taskId === task.id && w.dependencyId === dep
			);
			edges.set(key, edge);
		}
	return {
		nodes,
		groups,
		stages,
		effectivePairs,
		edges: [...edges.values()].sort((a, b) => compareIds(a.key, b.key)),
		warnings
	};
}
