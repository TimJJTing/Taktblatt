/**
 * The layer of one rendered view in the diagram stage. Refer to ADR 20.
 * An outgoing layer is not active. Its view gives no intended route ids, so its targets stop
 * taking route input before its DOM exits. Without a stage, a view is always active.
 */
import { getContext, onMount, setContext } from 'svelte';
import { getEditing } from '#lib/state/editing.svelte.ts';

export interface DiagramLayer {
	readonly active: boolean;
}

const CONTEXT = Symbol('diagram-layer');
const ALWAYS: DiagramLayer = { active: true };

export function setDiagramLayer(layer: DiagramLayer): DiagramLayer {
	return setContext(CONTEXT, layer);
}

export function getDiagramLayer(): DiagramLayer {
	return getContext<DiagramLayer | undefined>(CONTEXT) ?? ALWAYS;
}

/**
 * The route targets of a diagram view. Call it during component setup.
 * It registers the view with the route-focus owner on mount. The intended ids are `ids` while
 * the layer is active and none while it leaves, so an outgoing view takes no route input.
 * Use `target` on each task node.
 */
export function diagramRouteTargets(ids: () => Iterable<string>) {
	const layer = getDiagramLayer();
	const targets = getEditing().routeFocus.view(() => new Set(layer.active ? ids() : []));
	onMount(targets.register);
	return targets;
}
