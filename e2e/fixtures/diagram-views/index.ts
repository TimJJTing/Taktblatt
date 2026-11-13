/**
 * Test-only diagram views (ADR 20). Only a build with TAKTBLATT_DIAGRAM_FIXTURES=1 imports this
 * module (vite.config.ts). They prove that a view registers screen and paper renderers without
 * changes to shared files. `test-list` prints portrait; `test-board` prints landscape.
 */
import type { DiagramViewDefinition } from '#lib/components/diagram/view-contract.ts';
import type { PrintModelInput, Segment } from '#lib/domain/print-model.ts';
import FixtureBoard from './FixtureBoard.svelte';
import FixtureList from './FixtureList.svelte';
import FixturePaper from './FixturePaper.svelte';
import { fixtureTasks } from './tasks.ts';

const segments =
	(diagram: string, title: string) =>
	({ plan }: PrintModelInput): Segment[] => [
		{
			kind: 'scene',
			id: `${diagram}-scene`,
			diagram,
			items: fixtureTasks(plan),
			data: { title },
			keep: 1,
			gap: 16,
			breakBefore: false
		}
	];

export const fixtures: DiagramViewDefinition[] = [
	{
		id: 'test-list',
		order: 15,
		label: () => 'Test list',
		component: FixtureList,
		paper: {
			orientation: 'portrait',
			segments: segments('test-list', 'Test list'),
			component: FixturePaper
		},
		motion: { routerId: 'gantt-orthogonal', connectorSchema: 'gantt-orthogonal-v1' }
	},
	{
		id: 'test-board',
		order: 25,
		label: () => 'Test board',
		component: FixtureBoard,
		paper: {
			orientation: 'landscape',
			segments: segments('test-board', 'Test board'),
			component: FixturePaper
		},
		motion: { routerId: 'test-board', connectorSchema: 'none' }
	}
];
