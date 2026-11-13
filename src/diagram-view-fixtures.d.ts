// The build-time fixture views (vite.config.ts). The list is empty unless the build sets
// TAKTBLATT_DIAGRAM_FIXTURES=1. Refer to ADR 20.
declare module 'virtual:diagram-view-fixtures' {
	import type { DiagramViewDefinition } from '#lib/components/diagram/view-contract.ts';
	export const fixtures: DiagramViewDefinition[];
}
