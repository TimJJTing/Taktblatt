/**
 * Test-only diagram view definitions for component tests (ADR 20).
 * Tests give them to `createViewRegistry` with the real Gantt definition.
 * This module is outside the discovery pattern, so the app never registers these views.
 */
import type { Component } from 'svelte';
import type { DiagramOrientation, PrintModelInput, Segment } from '#lib/domain/print-model.ts';
import DiagramTestPaper from './DiagramTestPaper.svelte';
import DiagramTestView from './DiagramTestView.svelte';
import type { DiagramViewDefinition, DiagramViewProps } from './view-contract.ts';

interface TestViewOptions {
	order: number;
	label: string;
	layout?: 'column' | 'row';
	/** Task ids that the screen renderer does not show. */
	omit?: readonly string[];
	orientation?: DiagramOrientation;
}

export function testView(id: string, options: TestViewOptions): DiagramViewDefinition {
	const { layout = 'column', omit = [], orientation = 'portrait' } = options;
	// A Svelte 5 component is a function. This one gives fixed layout props to the test view.
	const component: Component<DiagramViewProps> = (internals, props) =>
		DiagramTestView(internals, { ...props, layout, omit });
	return {
		id,
		order: options.order,
		label: () => options.label,
		component,
		paper: {
			orientation,
			segments: ({ plan }: PrintModelInput): Segment[] => [
				{
					kind: 'scene',
					id: `${id}-scene`,
					diagram: id,
					items: plan.tasks,
					keep: 1,
					gap: 16,
					breakBefore: false
				}
			],
			component: DiagramTestPaper
		},
		motion: { routerId: `${id}-router`, connectorSchema: `${id}-v1` }
	};
}
