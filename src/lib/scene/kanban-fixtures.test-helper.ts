/** Shared plans for the Kanban regression tests. */
import type { Plan, Task } from '#lib/domain/schema.ts';
import { makePlan, makeTask } from '#lib/domain/test-helpers.ts';

export function kanbanTask(id: string, patch: Partial<Task> = {}): Task {
	return makeTask({ id, createdAt: '2027-01-01T00:00:00.000Z', ...patch });
}

export function isolatedParent(withChildEdge = false): Plan {
	return makePlan([
		kanbanTask('P'),
		kanbanTask('C1', { parentId: 'P' }),
		kanbanTask('C2', { parentId: 'P', dependsOn: withChildEdge ? ['C1'] : [] }),
		kanbanTask('U')
	]);
}

export function unrelatedCycle(): Plan {
	return makePlan([
		kanbanTask('A'),
		kanbanTask('B', { dependsOn: ['A'] }),
		kanbanTask('X', { dependsOn: ['Y'] }),
		kanbanTask('Y', { dependsOn: ['X'] })
	]);
}

export function done300(unbrokenTitle = false): Plan {
	return makePlan(
		Array.from({ length: 300 }, (_, i) => {
			const id = `D${String(i + 1).padStart(3, '0')}`;
			return kanbanTask(id, {
				status: 'done',
				title: unbrokenTitle && id === 'D150' ? 'W'.repeat(512) : id,
				createdAt: new Date(Date.UTC(2027, 0, 1, 0, 0, i)).toISOString()
			});
		})
	);
}

export function mixedBoard(): Plan {
	const plan = makePlan(
		[
			kanbanTask('open'),
			kanbanTask('finished', { status: 'done' }),
			kanbanTask('canceled', { status: 'canceled' }),
			kanbanTask('P', { title: 'Parent', dependsOn: ['open'] }),
			kanbanTask('child', {
				parentId: 'P',
				title: 'Child',
				owners: ['Ada', 'Lin'],
				start: '2027-01-03',
				end: '2027-01-04'
			}),
			kanbanTask('ready', { dependsOn: ['finished', 'canceled'] }),
			kanbanTask('working', { status: 'in_progress', dependsOn: ['open'] }),
			kanbanTask('derived', { status: 'todo' }),
			kanbanTask('derived-child', { parentId: 'derived', status: 'done' }),
			kanbanTask('after-derived', { dependsOn: ['derived'] }),
			kanbanTask('canceled-parent'),
			kanbanTask('canceled-child', { parentId: 'canceled-parent', status: 'canceled' }),
			kanbanTask('stage-two', { stageId: 's2', status: 'done' })
		],
		['s1', 's2']
	);
	plan.stages[0].title = 'Design';
	plan.stages[1].title = 'Delivery';
	return plan;
}
