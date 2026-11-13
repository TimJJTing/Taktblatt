/**
 * The diagram view registry. Refer to ADR 20.
 *
 * Each view registers through its own `src/lib/components/<folder>/diagram-view.ts` module.
 * Vite discovers these modules at build time. A new view needs no edit of this file.
 * Test builds can add fixture views through `virtual:diagram-view-fixtures` (see vite.config.ts).
 * A normal build exports an empty fixture list and contains no fixture code.
 */
import { getContext, setContext } from 'svelte';
import { fixtures } from 'virtual:diagram-view-fixtures';
import {
	GANTT_VIEW_ID,
	type DiagramViewDefinition,
	type DiagramViewId,
	type DiagramViewModule
} from './view-contract.ts';

export interface ViewRegistry {
	/** The views in display and print order. */
	readonly views: readonly DiagramViewDefinition[];
	/** The view ids in display and print order. */
	readonly ids: readonly DiagramViewId[];
	get(id: DiagramViewId): DiagramViewDefinition | undefined;
	has(id: DiagramViewId): boolean;
	/** The view with this id, else Gantt. */
	resolve(id: DiagramViewId): DiagramViewDefinition;
}

/**
 * Validates and orders view definitions. Production and tests use this same function.
 * It throws on a duplicate id or when Gantt is missing.
 */
export function createViewRegistry(definitions: readonly DiagramViewDefinition[]): ViewRegistry {
	const byId = new Map<DiagramViewId, DiagramViewDefinition>();
	for (const definition of definitions) {
		if (byId.has(definition.id)) {
			throw new Error(`Duplicate diagram view id: ${definition.id}`);
		}
		byId.set(definition.id, definition);
	}
	const gantt = byId.get(GANTT_VIEW_ID);
	if (!gantt) throw new Error('The Gantt diagram view is not registered');
	const views = [...byId.values()].sort(
		(a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
	);
	const ids = views.map((view) => view.id);
	return {
		views,
		ids,
		get: (id) => byId.get(id),
		has: (id) => byId.has(id),
		resolve: (id) => byId.get(id) ?? gantt
	};
}

/** The real registration modules and the build-time fixtures, if the build has them. */
export function discoverViews(): DiagramViewDefinition[] {
	const modules = import.meta.glob<DiagramViewModule>('/src/lib/components/**/diagram-view.ts', {
		eager: true
	});
	return [...Object.values(modules).map((module) => module.view), ...fixtures];
}

let app: ViewRegistry | undefined;

/** The registry of the app. It is created one time. */
export function appViewRegistry(): ViewRegistry {
	app ??= createViewRegistry(discoverViews());
	return app;
}

const CONTEXT = Symbol('view-registry');

export function setViewRegistry(registry: ViewRegistry): ViewRegistry {
	return setContext(CONTEXT, registry);
}

/** The registry in context. Without one, the registry of the app. */
export function getViewRegistry(): ViewRegistry {
	return getContext<ViewRegistry | undefined>(CONTEXT) ?? appViewRegistry();
}
