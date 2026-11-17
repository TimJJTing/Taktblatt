/**
 * The layer of one rendered view in the diagram stage. Refer to ADR 20.
 * An outgoing layer is not active. Its view gives no intended route ids, so its targets stop
 * taking route input before its DOM exits. Without a stage, a view is always active.
 */
import { getContext, onMount, setContext } from 'svelte';
import { getEditing } from '#lib/state/editing.svelte.ts';

export interface DiagramLayer {
	readonly active: boolean;
	/** Captures task identity now and resolves the dialog return target at close time. */
	readonly returnFocus?: (taskId: string, from: HTMLElement | null) => () => HTMLElement | null;
}

const CONTEXT = Symbol('diagram-layer');
const ALWAYS: DiagramLayer = { active: true };

export function setDiagramLayer(layer: DiagramLayer): DiagramLayer {
	const parent = getContext<DiagramLayer | undefined>(CONTEXT);
	return setContext(CONTEXT, {
		get active() {
			return layer.active;
		},
		returnFocus: layer.returnFocus ?? parent?.returnFocus
	});
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
