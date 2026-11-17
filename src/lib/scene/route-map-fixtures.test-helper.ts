import { createExamplePlan } from '#lib/domain/example.ts';
import { makePlan, makeTask } from '#lib/domain/test-helpers.ts';
import type { Plan, Task } from '#lib/domain/schema.ts';

export const task = (input: Partial<Task> & { id: string }) =>
	makeTask({ createdAt: '2027-01-01T00:00:00.000Z', ...input });

export function adr13Plan(): Plan {
	return makePlan([
		task({ id: 'P', dependsOn: ['X'] }),
		task({ id: 'S', parentId: 'P' }),
		task({ id: 'X', dependsOn: ['S'] })
	]);
}

export function groupingPlan(): Plan {
	return makePlan([
		task({ id: 'P', dependsOn: ['Q'] }),
		task({ id: 'S', parentId: 'P' }),
		task({ id: 'Q' }),
		task({ id: 'T', parentId: 'Q', dependsOn: ['X'] }),
		task({ id: 'X', dependsOn: ['S'] })
	]);
}

export function largePlan(): Plan {
	const tasks: Task[] = [];
	for (let s = 0; s < 4; s++) {
		for (let i = 0; i < 30; i++) {
			const dependsOn: string[] = [];
			if (i > 0) dependsOn.push(`T${s}-${i - 1}`);
			if (i >= 2 && i <= 20) dependsOn.push(`T${s}-${i - 2}`);
			if (i === 0) dependsOn.push(`T${s}-29`, `T${(s + 3) % 4}-29`);
			tasks.push(
				task({
					id: `T${s}-${i}`,
					stageId: `s${s}`,
					start: '2027-01-01',
					end: '2027-01-02',
					dependsOn
				})
			);
		}
	}
	return makePlan(tasks, ['s0', 's1', 's2', 's3']);
}

export function shuffled(plan: Plan): Plan {
	return {
		...plan,
		tasks: [...plan.tasks.filter((_, i) => i % 2), ...plan.tasks.filter((_, i) => !(i % 2))]
			.reverse()
			.map((t) => ({ ...t, dependsOn: [...t.dependsOn].reverse() }))
	};
}

/** The original six-edge sketch. This is not the application example plan. */
export function signsPlan(): Plan {
	const plan = makePlan(
		[
			task({ id: 'survey', title: 'Site survey', start: '2026-11-01', status: 'done' }),
			task({ id: 'soil', title: 'Soil preparation', start: '2026-11-02', dependsOn: ['survey'] }),
			task({
				id: 'test',
				title: 'Soil test',
				parentId: 'soil',
				start: '2026-11-02',
				status: 'done'
			}),
			task({
				id: 'compost',
				title: 'Add compost',
				parentId: 'soil',
				start: '2026-11-03',
				dependsOn: ['test'],
				status: 'in_progress'
			}),
			task({ id: 'seeds', title: 'Order seeds', start: '2026-11-04', dependsOn: ['survey'] }),
			task({ id: 'water', title: 'Watering rota', stageId: 's2', dependsOn: ['soil', 'seeds'] }),
			task({ id: 'stall', title: 'Neighbourhood stall', stageId: 's3', dependsOn: ['water'] })
		],
		['s1', 's2', 's3']
	);
	plan.stages.forEach((s, i) => {
		s.title = ['Prepare', 'Grow', 'Share'][i];
		s.color = ['green', 'amber', 'blue'][i] as typeof s.color;
	});
	return plan;
}

export function pinnedExamplePlan(): Plan {
	const plan = createExamplePlan('2026-11-14');
	const stages = new Map(plan.stages.map((stage, i) => [stage.id, `stage-${i}`]));
	const tasks = new Map(plan.tasks.map((task, i) => [task.id, `task-${i}`]));
	plan.stages = plan.stages.map((s) => ({ ...s, id: stages.get(s.id)! }));
	plan.tasks = plan.tasks.map((t, i) => ({
		...t,
		id: tasks.get(t.id)!,
		stageId: stages.get(t.stageId)!,
		parentId: t.parentId ? tasks.get(t.parentId)! : null,
		dependsOn: t.dependsOn.map((id) => tasks.get(id)!),
		note: t.note.replace(/@\[task:([^\]]+)\]/g, (_, id) => `@[task:${tasks.get(id)!}]`),
		createdAt: new Date(Date.parse('2026-11-14T00:00:00.000Z') + i).toISOString()
	}));
	return plan;
}

export function longNamePlan(): Plan {
	const plan = pinnedExamplePlan();
	const title = 'Garden tasks need careful planning for every growing season!';
	return { ...plan, tasks: plan.tasks.map((item) => ({ ...item, title })) };
}

export function densePlan(): Plan {
	const tasks: Task[] = [];
	for (let i = 0; i < 3; i++) {
		const stageId = `s${i}`;
		const id = (suffix: string) => `${i}${suffix}`;
		tasks.push(
			task({ id: id('A'), stageId, dependsOn: i === 0 ? ['2E'] : [] }),
			task({ id: id('B'), stageId, dependsOn: [id('A'), ...(i === 1 ? ['0x'] : [])] }),
			task({ id: id('C'), stageId, dependsOn: [id('A'), ...(i === 2 ? ['1B'] : [])] }),
			task({ id: id('D'), stageId, dependsOn: [id('B'), id('C'), ...(i === 1 ? ['0B'] : [])] }),
			task({ id: id('E'), stageId, dependsOn: i === 2 ? ['0A'] : [] })
		);
	}
	tasks.push(
		task({ id: 'parent', stageId: 's0' }),
		task({ id: '0x', stageId: 's0', parentId: 'parent', dependsOn: ['2B'] }),
		task({ id: '0y', stageId: 's0', parentId: 'parent', dependsOn: ['0x', '1C'] }),
		task({ id: '0z', stageId: 's0', parentId: 'parent' })
	);
	return makePlan(tasks, ['s0', 's1', 's2']);
}
