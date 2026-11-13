/** Dependency routes use the effective graph, including inherited parent dependencies. */
import { effectiveDependencies, type TaskIndex } from './derive.ts';

interface EffectiveDependencyGraph {
	upstream: ReadonlyMap<string, ReadonlySet<string>>;
	downstream: ReadonlyMap<string, ReadonlySet<string>>;
	pairs: readonly (readonly [string, string])[];
}

/** The stable key of a drawn dependency line. */
export function lineKey(from: string, to: string): string {
	return `${from}->${to}`;
}

/** Build once for an index. Pointer input reuses these maps and pairs. */
export function effectiveDependencyGraph(index: TaskIndex): EffectiveDependencyGraph {
	const upstream = new Map<string, Set<string>>();
	const downstream = new Map<string, Set<string>>();
	const pairs: [string, string][] = [];
	for (const id of index.byId.keys()) downstream.set(id, new Set());
	for (const id of index.byId.keys()) {
		const dependencies = effectiveDependencies(index, id);
		upstream.set(id, dependencies);
		for (const dependency of dependencies) {
			downstream.get(dependency)?.add(id);
			pairs.push([dependency, id]);
		}
	}
	return { upstream, downstream, pairs };
}

/** Project separate focus routes onto existing rows and connectors. */
export function routeFocusModel(
	graph: EffectiveDependencyGraph,
	index: TaskIndex,
	rows: readonly { id: string; isParent: boolean; expanded: boolean }[],
	lines: readonly { key: string }[],
	focusId: string | null
): { active: boolean; onRouteRowIds: Set<string>; litLineKeys: Set<string> } {
	const model = { active: false, onRouteRowIds: new Set<string>(), litLineKeys: new Set<string>() };
	if (focusId === null || !index.byId.has(focusId)) return model;
	const visible = new Map(rows.map((row) => [row.id, row]));
	const focusRow = visible.get(focusId);
	const focuses = [focusId];
	if (focusRow?.isParent && !focusRow.expanded) {
		focuses.push(...(index.children.get(focusId) ?? []).map((task) => task.id));
	}
	const routes = focuses.map((focus) => ({ focus, route: graphDependencyRoute(graph, focus) }));
	model.active = true;
	const visibleId = (id: string): string | undefined => {
		if (visible.has(id)) return id;
		const parent = index.byId.get(id)?.parentId;
		return parent && visible.has(parent) ? parent : undefined;
	};
	for (const { focus, route } of routes) {
		for (const id of [focus, ...route.upstream, ...route.downstream]) {
			const rowId = visibleId(id);
			if (rowId) model.onRouteRowIds.add(rowId);
		}
	}
	const drawn = new Set(lines.map((line) => line.key));
	for (const [from, to] of graph.pairs) {
		if (!routes.some(({ focus, route }) => isLitEdge(route, focus, from, to))) continue;
		const fromRow = visibleId(from);
		const toRow = visibleId(to);
		if (!fromRow || !toRow || fromRow === toRow) continue;
		const key = lineKey(fromRow, toRow);
		if (drawn.has(key)) model.litLineKeys.add(key);
	}
	return model;
}

interface DependencyRoute {
	upstream: Set<string>;
	downstream: Set<string>;
}

function reachable(graph: ReadonlyMap<string, ReadonlySet<string>>, focus: string): Set<string> {
	const seen = new Set([focus]);
	const stack = [focus];
	while (stack.length) {
		for (const id of graph.get(stack.pop()!) ?? []) {
			if (seen.has(id)) continue;
			seen.add(id);
			stack.push(id);
		}
	}
	seen.delete(focus);
	return seen;
}

/** Find all predecessors and dependents. Each walk stops at tasks it has already visited. */
export function dependencyRoute(index: TaskIndex, focus: string): DependencyRoute {
	return graphDependencyRoute(effectiveDependencyGraph(index), focus);
}

/** Walk each side independently so a shortcut cannot join opposite sides. */
function graphDependencyRoute(graph: EffectiveDependencyGraph, focus: string): DependencyRoute {
	return {
		upstream: reachable(graph.upstream, focus),
		downstream: reachable(graph.downstream, focus)
	};
}

/** Light edges on either side of the focus. Exclude shortcuts between the two sides. */
export function isLitEdge(
	route: DependencyRoute,
	focus: string,
	from: string,
	to: string
): boolean {
	return [route.upstream, route.downstream].some(
		(side) => (from === focus || side.has(from)) && (to === focus || side.has(to))
	);
}
