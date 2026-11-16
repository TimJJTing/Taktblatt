const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

import { dependencyWarnings, type DependencyEdge, type DependencyWarning } from './dependencies.ts';
import { effectiveDependencies, stageProgress, type TaskIndex } from './derive.ts';
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
	crossStage: boolean;
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

/** Use an index built from this plan's current tasks. */
export function routeMapModel(
	plan: Plan,
	expanded: ReadonlySet<string>,
	index: TaskIndex
): RouteMapModel {
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
	const warnings = dependencyWarnings(index).sort(
		(a, b) =>
			compareIds(a.kind, b.kind) ||
			compareIds(a.taskId, b.taskId) ||
			compareIds(a.dependencyId, b.dependencyId)
	);
	const effectivePairs = tasks
		.flatMap((t) => [...effectiveDependencies(index, t.id)].map((from) => ({ from, to: t.id })))
		.sort((a, b) => compareIds(a.from, b.from) || compareIds(a.to, b.to));
	type MutableEdge = Omit<RouteMapEdge, 'stored'> & { stored: DependencyEdge[] };
	const projected = new Map<string, MutableEdge>();
	const merge = (edges: Map<string, MutableEdge>, incoming: RouteMapEdge) => {
		if (incoming.from === incoming.to) return;
		const key = lineKey(incoming.from, incoming.to);
		const edge = edges.get(key) ?? { ...incoming, key, stored: [] };
		edge.cycle ||= incoming.cycle;
		edge.crossStage ||= incoming.crossStage;
		edge.stored.push(...incoming.stored);
		edges.set(key, edge);
	};
	const cycles = new Set(
		warnings
			.filter((warning) => warning.kind === 'cycle')
			.map((w) => lineKey(w.dependencyId, w.taskId))
	);
	for (const task of tasks)
		for (const dep of [...new Set(task.dependsOn)].sort()) {
			const source = index.byId.get(dep);
			if (!source) continue;
			const from = proxy(dep),
				to = proxy(task.id),
				key = lineKey(from, to);
			merge(projected, {
				key,
				from,
				to,
				cycle: cycles.has(lineKey(dep, task.id)),
				crossStage: source.stageId !== task.stageId,
				stored: [{ taskId: task.id, dependencyId: dep }]
			});
		}
	const edges = new Map<string, MutableEdge>();
	// Merge visible paths first so an aggregate warning keeps its exact visible endpoints.
	for (const edge of projected.values()) {
		if (edge.cycle || edge.crossStage) {
			merge(edges, edge);
			continue;
		}
		for (const stored of edge.stored) {
			const source = index.byId.get(stored.dependencyId)!;
			const target = index.byId.get(stored.taskId)!;
			const siblings = source.parentId !== null && source.parentId === target.parentId;
			// External child dependencies keep the parent rail in both expand states.
			merge(edges, {
				...edge,
				from: siblings ? edge.from : (source.parentId ?? source.id),
				to: siblings ? edge.to : (target.parentId ?? target.id),
				stored: [stored]
			});
		}
	}
	for (const edge of edges.values())
		edge.stored.sort(
			(a, b) => compareIds(a.taskId, b.taskId) || compareIds(a.dependencyId, b.dependencyId)
		);
	return {
		nodes,
		groups,
		stages,
		effectivePairs,
		edges: [...edges.values()].sort((a, b) => compareIds(a.key, b.key)),
		warnings
	};
}
