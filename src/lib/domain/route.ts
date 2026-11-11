/** Dependency routes use the effective graph, including inherited parent dependencies. */
import { effectiveDependencies, type TaskIndex } from './derive.ts';

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
