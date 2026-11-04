/**
 * The example plan for "Load example". The content is neutral and new.
 * It does not use the data of the design artifact.
 * All dates are relative to `today`, so the example is always current.
 */
import { dayNumber, isoFromDayNumber, todayISO, type ISODate } from './date';
import { createId } from './ids';
import type { Locale, Plan, Task } from './schema';

function addDays(date: ISODate, days: number): ISODate {
	return isoFromDayNumber(dayNumber(date) + days);
}

export function createExamplePlan(locale: Locale, today: ISODate = todayISO()): Plan {
	const at = (days: number) => addDays(today, days);
	const now = new Date().toISOString();
	const stage = { prepare: createId(), grow: createId(), share: createId() };
	let order = 0;
	const task = (
		stageId: string,
		title: string,
		deliverable: string,
		start: number | null,
		end: number | null,
		owners: string[],
		extra: Partial<Task> = {}
	): Task => ({
		id: createId(),
		stageId,
		parentId: null,
		title,
		deliverable,
		start: start === null ? null : at(start),
		end: end === null ? null : at(end),
		owners,
		done: false,
		note: '',
		dependsOn: [],
		createdAt: new Date(Date.parse(now) + order++).toISOString(),
		...extra
	});

	const survey = task(stage.prepare, 'Site survey', 'Bed layout sketch', -14, -7, ['Noor'], {
		done: true
	});
	const soil = task(stage.prepare, 'Soil preparation', 'Ready beds', null, null, []);
	const soilTest = task(stage.prepare, 'Soil test', 'Test results', -6, -2, ['Kai'], {
		parentId: soil.id,
		done: true
	});
	const compost = task(stage.prepare, 'Add compost', 'Amended beds', -1, 6, ['Kai', 'Rosa'], {
		parentId: soil.id,
		dependsOn: [soilTest.id]
	});
	const seeds = task(stage.prepare, 'Order seeds', 'Seed stock', -5, 3, ['Rosa'], {
		dependsOn: [survey.id]
	});
	const sowing = task(stage.grow, 'Sowing', 'Planted beds', 8, 20, ['Noor', 'Kai'], {
		dependsOn: [soil.id, seeds.id],
		note: `Start after the soil work. Refer to @[task:${compost.id}].`
	});
	const watering = task(stage.grow, 'Watering rota', 'Weekly schedule', 10, 60, ['Rosa']);
	const harvest = task(stage.share, 'First harvest', 'Harvest log', 55, 70, ['Noor'], {
		dependsOn: [sowing.id]
	});
	const market = task(stage.share, 'Neighbourhood stall', 'Stall day', 72, 72, ['Kai']);

	return {
		id: createId(),
		heading: 'Community Garden — Spring Season',
		subheading: 'Example plan',
		range: { start: at(-21), end: at(80) },
		objective:
			'Turn the empty lot into six productive beds and share the first harvest with the neighbourhood.',
		locale,
		paper: 'a4',
		footer: { note: 'Example', version: 'v1', date: today, right: 'Garden volunteers' },
		stages: [
			{
				id: stage.prepare,
				title: 'Prepare',
				description: 'Survey the site and get the beds and seeds ready.',
				color: 'green'
			},
			{
				id: stage.grow,
				title: 'Grow',
				description: 'Sow, water and look after the beds.',
				color: 'amber'
			},
			{
				id: stage.share,
				title: 'Share',
				description: 'Harvest and share the produce.',
				color: 'blue'
			}
		],
		tasks: [survey, soil, soilTest, compost, seeds, sowing, watering, harvest, market],
		milestones: [
			{
				id: createId(),
				title: 'Beds ready',
				description: 'All six beds can take seeds.',
				date: at(6),
				symbol: 'diamond'
			},
			{
				id: createId(),
				title: 'Open day',
				description: 'Neighbours visit the garden.',
				date: at(72),
				symbol: 'star'
			}
		],
		bands: [{ id: createId(), title: 'Frost risk', start: at(-21), end: at(4), color: 'blue' }],
		remarks: [
			{
				id: createId(),
				title: 'How we work',
				bullets: ['Volunteers meet every Saturday morning.', 'Tools stay in the shed by the gate.']
			},
			{
				id: createId(),
				title: 'Assumptions',
				bullets: ['The water connection is ready before sowing.', 'Six volunteers join each week.']
			}
		],
		createdAt: now,
		updatedAt: now
	};
}
