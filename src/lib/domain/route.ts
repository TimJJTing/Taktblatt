/** Dependency routes use the effective graph, including inherited parent dependencies. */
import { effectiveDependencies, type TaskIndex } from './derive.ts';
import type { DependencyLine, GanttRow } from './gantt.ts';

// Stub: slice 4 implementation pending.
export interface EffectiveDependencyGraph {
	upstream: ReadonlyMap<string, ReadonlySet<string>>;
	downstream: ReadonlyMap<string, ReadonlySet<string>>;
	pairs: readonly (readonly [string, string])[];
}

// Stub: slice 4 implementation pending.
export function effectiveDependencyGraph(_index: TaskIndex): EffectiveDependencyGraph {
	void _index;
	return { upstream: new Map(), downstream: new Map(), pairs: [] };
}

// Stub: slice 4 implementation pending.
export function routeFocusModel(
	_graph: EffectiveDependencyGraph,
	_index: TaskIndex,
	_rows: readonly GanttRow[],
	_lines: readonly DependencyLine[],
	_focusId: string | null
): { active: boolean; onRouteRowIds: Set<string>; litLineKeys: Set<string> } {
	void [_graph, _index, _rows, _lines, _focusId];
	return { active: false, onRouteRowIds: new Set(), litLineKeys: new Set() };
}

export interface DependencyRoute {
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
	const upstream = new Map<string, Set<string>>();
	const downstream = new Map<string, Set<string>>();
	for (const id of index.byId.keys()) downstream.set(id, new Set());
	for (const id of index.byId.keys()) {
		const dependencies = effectiveDependencies(index, id);
		upstream.set(id, dependencies);
		for (const dependency of dependencies) downstream.get(dependency)?.add(id);
	}
	return { upstream: reachable(upstream, focus), downstream: reachable(downstream, focus) };
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
