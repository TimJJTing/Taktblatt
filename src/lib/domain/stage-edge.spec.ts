import { describe, expect, it } from 'vitest';
import { indexTasks } from './derive.ts';
import { makePlan, makeTask } from './test-helpers.ts';
import { stageEdgeSegments } from './stage-edge.ts';

const range = { start: '2027-01-01', end: '2027-01-10' };
function edge(today = '2027-01-05') {
	const plan = makePlan(
		[
			makeTask({ id: 'a', stageId: 'early', start: '2026-12-25', end: '2027-01-06' }),
			makeTask({ id: 'b', stageId: 'later', start: '2027-01-05', end: '2027-01-20' }),
			makeTask({ id: 'c', stageId: 'empty', start: null, end: null })
		],
		['early', 'later', 'empty']
	);
	plan.range = range;
	return stageEdgeSegments(indexTasks(plan.tasks), plan.stages, range, today);
}

describe('collapsed Timeline stage edge', () => {
	it('clips dated spans, omits undated stages and orders segments by stage', () => {
		expect(edge().segments).toEqual([
			{ stageId: 'early', left: 0, width: 0.6 },
			{ stageId: 'later', left: 0.4, width: 0.6 }
		]);
	});
	it('places today at the center of its day and omits it outside the range', () => {
		expect(edge().today).toBeCloseTo(0.45);
		expect(edge('2026-12-31').today).toBeNull();
		expect(edge('2027-01-11').today).toBeNull();
	});
});
