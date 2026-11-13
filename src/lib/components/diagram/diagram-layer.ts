/**
 * The layer of one rendered view in the diagram stage. Refer to ADR 20.
 * An outgoing layer is not active. Its view gives no intended route ids, so its targets stop
 * taking route input before its DOM exits. Without a stage, a view is always active.
 */
import { getContext, setContext } from 'svelte';

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
