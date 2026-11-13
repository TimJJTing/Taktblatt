/**
 * Test-only diagram views (ADR 20). Only the fixture build imports this module (vite.config.ts).
 * They prove that a view registers screen and paper renderers without changes to shared files.
 * `test-list` prints portrait; `test-board` prints landscape. The orders put them between the
 * known views: after Gantt, around Route map.
 */
import type { DiagramViewDefinition } from '#lib/components/diagram/view-contract.ts';
import { fixtureView } from '#lib/components/diagram/fixture-views.test-helper.ts';

export const FIXTURE_ORDER = { list: 15, board: 25 } as const;

export const fixtures: DiagramViewDefinition[] = [
	fixtureView('test-list', {
		order: FIXTURE_ORDER.list,
		label: 'Test list',
		motion: { routerId: 'gantt-orthogonal', connectorSchema: 'gantt-orthogonal-v1' }
	}),
	fixtureView('test-board', {
		order: FIXTURE_ORDER.board,
		label: 'Test board',
		layout: 'board',
		orientation: 'landscape',
		motion: { routerId: 'test-board', connectorSchema: 'none' }
	})
];
