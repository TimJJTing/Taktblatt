import { makeTask } from '#lib/domain/test-helpers.ts';
import type { Plan, Task } from '#lib/domain/schema.ts';

const verificationTask = (input: Partial<Task> & { id: string }) =>
	makeTask({ ...input, createdAt: '2026-01-01T00:00:00.000Z' });

// Plan used to verify paper branches across crowded panels.
export const verificationPlan: Plan = {
	id: 'verify-plan',
	heading: 'Slice 8b verification',
	subheading: '',
	range: {
		start: '2026-03-01',
		end: '2026-04-30'
	},
	objective: '',
	paper: 'a4',
	footer: {
		note: '',
		version: '',
		date: null,
		right: ''
	},
	stages: [
		{
			id: 's1',
			title: 'Discovery',
			description: '',
			color: 'blue'
		},
		{
			id: 's2',
			title: 'Empty stage with no tasks',
			description: '',
			color: 'amber'
		},
		{
			id: 's3',
			title: 'Integration, regional rollout and cross-team acceptance validation',
			description: '',
			color: 'violet'
		},
		{
			id: 's4',
			title: 'Wrap-up',
			description: '',
			color: 'teal'
		}
	],
	tasks: [
		verificationTask({
			id: 't1',
			title: 'Interview stakeholders',
			start: '2026-03-01',
			end: '2026-03-04',
			owners: ['Ana', 'Ben'],
			status: 'done'
		}),
		verificationTask({
			id: 't2',
			title: 'Draft requirements',
			start: '2026-03-03',
			end: '2026-03-09',
			owners: ['Ana'],
			status: 'in_progress',
			dependsOn: ['t1']
		}),
		verificationTask({
			id: 't3',
			title:
				'Review requirements with the whole committee and agree on a final wording for every item',
			start: '2026-03-10',
			end: '2026-03-13',
			dependsOn: ['t2']
		}),
		verificationTask({
			id: 't4',
			title: 'Pick tooling',
			start: '2026-03-02',
			end: '2026-03-05',
			owners: ['Cy']
		}),
		verificationTask({
			id: 't5',
			title: 'Prototype',
			start: '2026-03-05',
			end: '2026-03-15',
			owners: ['Dee']
		}),
		verificationTask({
			id: 't6',
			parentId: 't5',
			title: 'Wireframes',
			start: '2026-03-05',
			end: '2026-03-07'
		}),
		verificationTask({
			id: 't7',
			parentId: 't5',
			title: 'Clickable mock',
			start: '2026-03-08',
			end: '2026-03-11'
		}),
		verificationTask({
			id: 't8',
			parentId: 't5',
			title: 'Usability test',
			start: '2026-03-12',
			end: '2026-03-15',
			status: 'canceled'
		}),
		verificationTask({
			id: 't9',
			title: 'Research topic 1',
			start: '2026-03-01',
			end: '2026-03-03'
		}),
		verificationTask({
			id: 't10',
			title: 'Research topic 2',
			start: '2026-03-02',
			end: '2026-03-04',
			owners: ['Eli'],
			status: 'in_progress'
		}),
		verificationTask({
			id: 't11',
			title: 'Research topic 3',
			start: '2026-03-03',
			end: '2026-03-05',
			status: 'done'
		}),
		verificationTask({
			id: 't12',
			title: 'Research topic 4',
			start: '2026-03-04',
			end: '2026-03-06',
			owners: ['Eli']
		}),
		verificationTask({
			id: 't13',
			title: 'Research topic 5',
			start: '2026-03-05',
			end: '2026-03-07'
		}),
		verificationTask({
			id: 't14',
			title: 'Research topic 6',
			start: '2026-03-06',
			end: '2026-03-08',
			owners: ['Eli'],
			status: 'done'
		}),
		verificationTask({
			id: 't15',
			title: 'Research topic 7',
			start: '2026-03-07',
			end: '2026-03-09',
			status: 'in_progress'
		}),
		verificationTask({
			id: 't16',
			title: 'Research topic 8',
			start: '2026-03-08',
			end: '2026-03-10',
			owners: ['Eli']
		}),
		verificationTask({
			id: 't17',
			title: 'Research topic 9',
			start: '2026-03-09',
			end: '2026-03-11'
		}),
		verificationTask({
			id: 't18',
			stageId: 's3',
			title: 'Regional rollout',
			start: '2026-03-11',
			end: '2026-03-26',
			owners: ['Fay', 'Gus']
		}),
		verificationTask({
			id: 't19',
			stageId: 's3',
			parentId: 't18',
			title: 'Region north',
			start: '2026-03-11',
			end: '2026-03-16',
			status: 'in_progress'
		}),
		verificationTask({
			id: 't20',
			stageId: 's3',
			parentId: 't18',
			title: 'Region south',
			start: '2026-03-15',
			end: '2026-03-19',
			dependsOn: ['t19']
		}),
		verificationTask({
			id: 't21',
			stageId: 's3',
			parentId: 't18',
			title: 'Region east',
			start: '2026-03-17',
			end: '2026-03-21'
		}),
		verificationTask({
			id: 't22',
			stageId: 's3',
			parentId: 't18',
			title: 'Region west',
			start: '2026-03-11',
			end: '2026-03-13',
			status: 'done'
		}),
		verificationTask({
			id: 't23',
			stageId: 's3',
			title: 'Acceptance',
			start: '2026-03-21',
			end: '2026-03-29',
			dependsOn: ['t3']
		}),
		verificationTask({
			id: 't24',
			stageId: 's3',
			parentId: 't23',
			title: 'Test plan',
			start: '2026-03-21',
			end: '2026-03-23'
		}),
		verificationTask({
			id: 't25',
			stageId: 's3',
			parentId: 't23',
			title: 'Sign-off',
			start: '2026-03-24',
			end: '2026-03-29'
		}),
		verificationTask({
			id: 't26',
			stageId: 's3',
			title: 'Integration check 1',
			start: '2026-03-13',
			end: '2026-03-15',
			dependsOn: ['t1']
		}),
		verificationTask({
			id: 't27',
			stageId: 's3',
			title: 'Integration check 2',
			start: '2026-03-14',
			end: '2026-03-16',
			status: 'in_progress'
		}),
		verificationTask({
			id: 't28',
			stageId: 's3',
			title: 'Integration check 3',
			start: '2026-03-15',
			end: '2026-03-17',
			status: 'done'
		}),
		verificationTask({
			id: 't29',
			stageId: 's3',
			title: 'Integration check 4',
			start: '2026-03-16',
			end: '2026-03-18'
		}),
		verificationTask({
			id: 't30',
			stageId: 's3',
			title: 'Integration check 5',
			start: '2026-03-17',
			end: '2026-03-19'
		}),
		verificationTask({
			id: 't31',
			stageId: 's3',
			title: 'Integration check 6',
			start: '2026-03-18',
			end: '2026-03-20',
			status: 'in_progress'
		}),
		verificationTask({
			id: 't32',
			stageId: 's3',
			title: 'Integration check 7',
			start: '2026-03-19',
			end: '2026-03-21',
			status: 'done'
		}),
		verificationTask({
			id: 't33',
			stageId: 's3',
			title: 'Integration check 8',
			start: '2026-03-20',
			end: '2026-03-22'
		}),
		verificationTask({
			id: 't34',
			stageId: 's4',
			title: 'Retrospective',
			start: '2026-03-29',
			end: '2026-03-30',
			dependsOn: ['t23']
		}),
		verificationTask({
			id: 't35',
			stageId: 's4',
			title: 'Archive',
			start: '2026-03-30',
			end: '2026-03-30'
		})
	],
	milestones: [],
	bands: [],
	remarks: [],
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z'
};
