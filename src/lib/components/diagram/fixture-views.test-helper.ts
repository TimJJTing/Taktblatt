/**
 * The factory of the test-only diagram views (ADR 20). The fixture build
 * (e2e/fixtures/diagram-views/index.ts) and the component tests use it. A view has a screen
 * renderer with a fixed layout and a paper adapter with one scene segment of all tasks.
 * This module is outside the discovery pattern, so the app never registers these views.
 */
import type { Component } from 'svelte';
import type { DiagramSegment, PrintModelInput } from '#lib/domain/print-model.ts';
import type { Plan, TaskStatus } from '#lib/domain/schema.ts';
import FixturePaper from './FixturePaper.test.svelte';
import FixtureView from './FixtureView.test.svelte';
import type {
	DiagramMotionInfo,
	DiagramOrientation,
	DiagramViewDefinition,
	DiagramViewProps
} from './view-contract.ts';

/** The layouts of the test-only screen renderer. */
export type FixtureLayout = 'list' | 'row' | 'board';

export interface FixtureTask {
	id: string;
	title: string;
	status: TaskStatus;
	parentId: string | null;
}

/** All tasks and subtasks of a plan, in plan order. */
export function fixtureTasks(plan: Plan): FixtureTask[] {
	return plan.tasks.map((task) => ({
		id: task.id,
		title: task.title,
		status: task.status,
		parentId: task.parentId ?? null
	}));
}

export interface FixtureViewOptions {
	order: number;
	label: string;
	layout?: FixtureLayout;
	/** Task ids that the screen renderer does not show. */
	omit?: readonly string[];
	orientation?: DiagramOrientation;
	motion?: DiagramMotionInfo;
}

export function fixtureView(id: string, options: FixtureViewOptions): DiagramViewDefinition {
	const { layout = 'list', omit = [], orientation = 'portrait', label } = options;
	// A Svelte 5 component is a function. This one gives the fixed layout props to the view.
	const component: Component<DiagramViewProps> = (internals, props) =>
		FixtureView(internals, { ...props, layout, omit });
	return {
		id,
		order: options.order,
		label: () => label,
		component,
		paper: {
			orientation,
			segments: ({ plan }: PrintModelInput): DiagramSegment[] => [
				{
					kind: 'scene',
					id: `${id}-scene`,
					diagram: id,
					items: fixtureTasks(plan),
					data: { title: label },
					keep: 1,
					gap: 16,
					breakBefore: false
				}
			],
			component: FixturePaper
		},
		motion: options.motion ?? { routerId: `${id}-router`, connectorSchema: `${id}-v1` }
	};
}
