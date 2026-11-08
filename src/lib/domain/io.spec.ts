import { describe, expect, it } from 'vitest';
import { createExamplePlan } from './example.ts';
import { createEmptyPlan } from './factory.ts';
import {
	backupFileName,
	exportFileName,
	limitErrors,
	parseFile,
	serializeFile,
	slugify,
	toBackupFile,
	toPlanFile,
	withNewIds
} from './io.ts';
import { makePlan, makeTask } from './test-helpers.ts';
import { MILESTONE_SYMBOLS, SCHEMA_VERSION } from './schema.ts';
import { parsePlan } from '#lib/state/storage.ts';
import type { ImportDiagnostic } from './import-diagnostics.ts';

describe('milestone symbol contract', () => {
	const symbols = [
		'diamond',
		'flag',
		'star',
		'circle',
		'triangle',
		'square',
		'hexagon',
		'pentagon',
		'pin',
		'bookmark',
		'heart'
	];
	const planWithSymbol = (symbol: string) => ({
		...makePlan([]),
		milestones: [{ id: 'm1', title: 'Review', description: '', date: '2027-01-10', symbol }]
	});

	it('lists exactly eleven symbols in the specified order', () => {
		expect(MILESTONE_SYMBOLS).toEqual(symbols);
	});

	it('keeps schema version 1', () => {
		expect(SCHEMA_VERSION).toBe(1);
	});

	it.each(symbols)('reads %s from a version 1 plan file', (symbol) => {
		const plan = planWithSymbol(symbol);
		const file = { schemaVersion: 1, kind: 'plan', plan };
		expect(parseFile(JSON.stringify(file))).toEqual({ ok: true, plans: [plan] });
	});

	it.each(symbols)('reads %s from a version 1 backup file', (symbol) => {
		const plan = planWithSymbol(symbol);
		const file = { schemaVersion: 1, kind: 'backup', plans: [plan] };
		expect(parseFile(JSON.stringify(file))).toEqual({ ok: true, plans: [plan] });
	});

	it.each(symbols)('reads %s from version 1 stored plan data', (symbol) => {
		const plan = planWithSymbol(symbol);
		expect(parsePlan(JSON.stringify({ schemaVersion: 1, plan }))).toEqual({
			ok: true,
			value: plan
		});
	});

	it('rejects an unknown rocket symbol at the milestone symbol field', () => {
		const plan = planWithSymbol('rocket');
		const result = parseFile(JSON.stringify({ schemaVersion: 1, kind: 'plan', plan }));
		expect(result.ok).toBe(false);
		if (!result.ok)
			expect(result.errors).toEqual([expect.stringContaining('plan.milestones.0.symbol')]);
	});
});

describe('parseFile', () => {
	it('imports all four statuses without changing their stored values', () => {
		const plan = makePlan(
			(['todo', 'in_progress', 'done', 'canceled'] as const).map((status) =>
				makeTask({ id: status, status })
			)
		);
		expect(parseFile(serializeFile(toPlanFile(plan)))).toEqual({ ok: true, plans: [plan] });
	});

	it.each(['legacy', 'unknown'] as const)(
		'rejects %s task status with the path and allowed values',
		(kind) => {
			const task: Record<string, unknown> = { ...makeTask({ id: 'task' }) };
			if (kind === 'legacy') {
				delete task.status;
				task.done = true;
			} else task.status = 'blocked';
			const plan = { ...makePlan([]), tasks: [task] };
			const text = JSON.stringify({ schemaVersion: 1, kind: 'plan', plan });
			const diagnostics: ImportDiagnostic[] = [];
			const result = parseFile(text, (diagnostic) => {
				diagnostics.push(diagnostic);
				return diagnostic.code;
			});
			expect(result).toEqual({ ok: false, errors: ['choice'] });
			expect(diagnostics).toEqual([
				expect.objectContaining({
					code: 'choice',
					path: 'plan.tasks.0.status',
					values: ['"todo"', '"in_progress"', '"done"', '"canceled"']
				})
			]);
			expect(parseFile(text)).toEqual({
				ok: false,
				errors: [
					'plan.tasks.0.status: Use one of these values: "todo", "in_progress", "done", "canceled".'
				]
			});
		}
	);

	it('reports a missing heading as a required field', () => {
		const file = toPlanFile(makePlan([]));
		const plan = { ...file.plan };
		Reflect.deleteProperty(plan, 'heading');
		expect(parseFile(JSON.stringify({ ...file, plan }))).toEqual({
			ok: false,
			errors: ['plan.heading: This field is required.']
		});
	});

	it('gives a missing heading the missing diagnostic code', () => {
		const file = toPlanFile(makePlan([]));
		const plan = { ...file.plan };
		Reflect.deleteProperty(plan, 'heading');
		expect(parseFile(JSON.stringify({ ...file, plan }), (diagnostic) => diagnostic.code)).toEqual({
			ok: false,
			errors: ['missing']
		});
	});

	it('reports a missing kind as a required field with the missing diagnostic code', () => {
		const text = JSON.stringify({ schemaVersion: SCHEMA_VERSION });
		const diagnostics: ImportDiagnostic[] = [];
		const result = parseFile(text, (diagnostic) => {
			diagnostics.push(diagnostic);
			return diagnostic.code;
		});
		expect(parseFile(text)).toEqual({
			ok: false,
			errors: ['kind: This field is required.']
		});
		expect(result).toEqual({ ok: false, errors: ['missing'] });
		expect(diagnostics).toEqual([
			expect.objectContaining({ code: 'missing', path: 'kind', values: undefined })
		]);
	});

	it('keeps the object diagnostic code for a range with the wrong type', () => {
		const file = toPlanFile(makePlan([]));
		const plan = { ...file.plan, range: 'x' };
		expect(parseFile(JSON.stringify({ ...file, plan }), (diagnostic) => diagnostic.code)).toEqual({
			ok: false,
			errors: ['object']
		});
	});

	it('includes JSON allowed values in the paper choice diagnostic', () => {
		const file = toPlanFile(makePlan([]));
		const diagnostics: ImportDiagnostic[] = [];
		const result = parseFile(
			JSON.stringify({ ...file, plan: { ...file.plan, paper: 'invalid' } }),
			(diagnostic) => {
				diagnostics.push(diagnostic);
				return diagnostic.code;
			}
		);
		expect(result).toEqual({ ok: false, errors: ['choice'] });
		expect(diagnostics).toEqual([
			expect.objectContaining({
				code: 'choice',
				path: 'plan.paper',
				values: ['"a4"', '"letter"']
			})
		]);
	});

	it('includes JSON allowed values in the top-level kind choice diagnostic', () => {
		const file = { ...toPlanFile(makePlan([])), kind: 'invalid' };
		const diagnostics: ImportDiagnostic[] = [];
		const result = parseFile(JSON.stringify(file), (diagnostic) => {
			diagnostics.push(diagnostic);
			return diagnostic.code;
		});
		expect(result).toEqual({ ok: false, errors: ['choice'] });
		expect(diagnostics).toEqual([
			expect.objectContaining({
				code: 'choice',
				path: 'kind',
				values: ['"plan"', '"backup"']
			})
		]);
	});

	it('lists allowed paper values in the English fallback', () => {
		const file = toPlanFile(makePlan([]));
		expect(
			parseFile(JSON.stringify({ ...file, plan: { ...file.plan, paper: 'invalid' } }))
		).toEqual({
			ok: false,
			errors: ['plan.paper: Use one of these values: "a4", "letter".']
		});
	});

	it('reads a plan file that the app wrote', () => {
		const plan = createExamplePlan('2027-04-01');
		const result = parseFile(JSON.stringify(toPlanFile(plan)));
		expect(result).toEqual({ ok: true, plans: [plan] });
	});

	it('reads a backup file', () => {
		const plans = [createEmptyPlan('2027-04-01'), createExamplePlan('2027-04-01')];
		const result = parseFile(JSON.stringify(toBackupFile(plans)));
		expect(result.ok && result.plans.length).toBe(2);
	});

	it('reads a file that still has the old locale key and drops the key', () => {
		const file = toPlanFile(createEmptyPlan('2027-04-01'));
		const old = { ...file, plan: { ...file.plan, locale: 'ja' } };
		const result = parseFile(JSON.stringify(old));
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.plans[0]).not.toHaveProperty('locale');
	});

	it('reads a backup file whose plans still have the old locale key', () => {
		const plan = createEmptyPlan('2027-04-01');
		const backup = toBackupFile([plan]);
		const old = { ...backup, plans: backup.plans.map((p) => ({ ...p, locale: 'de' })) };
		const result = parseFile(JSON.stringify(old));
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.plans[0]).not.toHaveProperty('locale');
	});

	it('writes plan and backup files without a language', () => {
		const plan = createEmptyPlan('2027-04-01');
		expect(toPlanFile(plan).plan).not.toHaveProperty('locale');
		expect(JSON.stringify(toBackupFile([plan]))).not.toContain('"locale"');
	});

	it('rejects text that is not JSON', () => {
		expect(parseFile('{')).toEqual({ ok: false, errors: ['The file is not valid JSON.'] });
	});

	it.each(['[]', 'null', '"text"', '42', 'true'])('rejects %s as not an object', (text) => {
		expect(parseFile(text)).toEqual({ ok: false, errors: ['The data is not an object.'] });
	});

	it('rejects an object without a schema version', () => {
		expect(parseFile('{}')).toEqual({ ok: false, errors: ['The data has no schema version.'] });
	});

	it('rejects a file from a newer app version', () => {
		const result = parseFile(JSON.stringify({ schemaVersion: 99, kind: 'plan' }));
		expect(result.ok).toBe(false);
	});

	it('gives the path of an invalid field', () => {
		const file = toPlanFile(createEmptyPlan('2027-04-01'));
		(file.plan.range as { start: string }).start = '2027-13-01';
		const result = parseFile(JSON.stringify(file));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors[0]).toContain('plan.range.start');
	});

	it('rejects a dependency on a task that does not exist', () => {
		const plan = makePlan([makeTask({ id: 'a', dependsOn: ['missing'] })]);
		expect(parseFile(JSON.stringify(toPlanFile(plan))).ok).toBe(false);
	});

	it('loads and imports legacy dependencies outside a subtask parent without changing them', () => {
		const plan = makePlan([
			makeTask({ id: 'p' }),
			makeTask({ id: 's', parentId: 'p', dependsOn: ['x', 'u'] }),
			makeTask({ id: 'x' }),
			makeTask({ id: 'q' }),
			makeTask({ id: 'u', parentId: 'q' })
		]);
		expect(parseFile(JSON.stringify(toPlanFile(plan)))).toEqual({ ok: true, plans: [plan] });
		expect(parsePlan(JSON.stringify({ schemaVersion: 1, plan }))).toEqual({
			ok: true,
			value: plan
		});
	});

	it('rejects an inverted plan range', () => {
		const plan = makePlan([]);
		plan.range = { start: '2027-02-01', end: '2027-01-01' };
		expect(parseFile(JSON.stringify(toPlanFile(plan)))).toEqual({
			ok: false,
			errors: ['plan: The range must start on or before it ends.']
		});
	});

	it('accepts a plan range that starts and ends on the same day', () => {
		const plan = makePlan([]);
		plan.range = { start: '2027-02-01', end: '2027-02-01' };
		expect(parseFile(JSON.stringify(toPlanFile(plan)))).toEqual({ ok: true, plans: [plan] });
	});

	it('rejects a task whose stage does not exist in the plan', () => {
		const plan = makePlan([makeTask({ id: 'a', stageId: 'missing' })], ['s1']);
		expect(parseFile(JSON.stringify(toPlanFile(plan)))).toEqual({
			ok: false,
			errors: ['plan: Each task must belong to a stage of the plan.']
		});
	});

	it.each([
		[[makeTask({ id: 'c', parentId: 'missing' })]],
		[
			[
				makeTask({ id: 'p' }),
				makeTask({ id: 'c', parentId: 'p' }),
				makeTask({ id: 'gc', parentId: 'c' })
			]
		],
		[[makeTask({ id: 'p', stageId: 's1' }), makeTask({ id: 'c', stageId: 's2', parentId: 'p' })]]
	])('rejects invalid subtask hierarchies (case %#)', (tasks) => {
		const plan = makePlan(tasks, ['s1', 's2']);
		expect(parseFile(JSON.stringify(toPlanFile(plan)))).toEqual({
			ok: false,
			errors: [
				'plan: A subtask must have a task of the same stage as its parent. The maximum depth is 2.'
			]
		});
	});

	it.each([
		['stages', 'Stage'],
		['tasks', 'Task'],
		['milestones', 'Milestone'],
		['bands', 'Band'],
		['remarks', 'Remark section']
	] as const)('rejects duplicate ids in %s', (collection, label) => {
		const plan = makePlan([makeTask({ id: 'a' })]);
		plan.milestones = [
			{ id: 'm', title: '', description: '', date: '2027-01-10', symbol: 'diamond' }
		];
		plan.bands = [{ id: 'b', title: '', start: '2027-01-01', end: '2027-01-10', color: 'gray' }];
		plan.remarks = [{ id: 'r', title: '', bullets: [] }];
		const items = plan[collection];
		items[items.length] = { ...items[0] };
		const result = parseFile(JSON.stringify(toPlanFile(plan)));
		expect(result).toEqual({ ok: false, errors: [`plan: ${label} ids must be unique.`] });
	});

	it('rejects a backup file with a repeated plan id', () => {
		const plan = createEmptyPlan('2027-04-01');
		const result = parseFile(JSON.stringify(toBackupFile([plan, { ...plan, heading: 'Other' }])));
		expect(result).toEqual({
			ok: false,
			errors: ['plans: Plan ids must be unique in a backup file.']
		});
	});

	it('rejects a backup file without plans', () => {
		expect(parseFile(JSON.stringify({ schemaVersion: 1, kind: 'backup', plans: [] }))).toEqual({
			ok: false,
			errors: ['plans: A backup file must contain at least one plan.']
		});
	});

	it('accepts a diamond dependency graph', () => {
		const diamond = makePlan([
			makeTask({ id: 'a' }),
			makeTask({ id: 'b', dependsOn: ['a'] }),
			makeTask({ id: 'c', dependsOn: ['a'] }),
			makeTask({ id: 'd', dependsOn: ['b', 'c'] })
		]);
		expect(parseFile(JSON.stringify(toPlanFile(diamond))).ok).toBe(true);
	});

	it('checks a chain of 10000 tasks in linear time', () => {
		const tasks = Array.from({ length: 10_000 }, (_, i) =>
			makeTask({ id: `t${i}`, dependsOn: i > 0 ? [`t${i - 1}`] : [] })
		);
		const text = JSON.stringify(toPlanFile(makePlan(tasks)));
		const start = performance.now();
		expect(parseFile(text).ok).toBe(true);
		expect(performance.now() - start).toBeLessThan(1000);
		tasks[0].dependsOn = ['t9999'];
		const cyclic = makePlan(tasks);
		expect(parseFile(JSON.stringify(toPlanFile(cyclic))).ok).toBe(true);
	});

	it('rejects a dependency on the task itself', () => {
		const plan = makePlan([makeTask({ id: 'a', dependsOn: ['a'] })]);
		expect(parseFile(JSON.stringify(toPlanFile(plan)))).toEqual({
			ok: false,
			errors: ['plan: Each dependency must point at a different task of the plan.']
		});
	});

	it.each(['parent', 'child'])('rejects a %s depending on its own child or parent', (source) => {
		const plan = makePlan([
			makeTask({ id: 'parent', dependsOn: source === 'parent' ? ['child'] : [] }),
			makeTask({
				id: 'child',
				parentId: 'parent',
				dependsOn: source === 'child' ? ['parent'] : []
			})
		]);
		expect(parseFile(JSON.stringify(toPlanFile(plan)))).toEqual({
			ok: false,
			errors: ['plan: A task must not depend on its own parent or subtask.']
		});
	});

	it.each([
		[makeTask({ id: 'a', dependsOn: ['b'] }), makeTask({ id: 'b', dependsOn: ['a'] })],
		[
			makeTask({ id: 'a', dependsOn: ['b'] }),
			makeTask({ id: 'b', dependsOn: ['c'] }),
			makeTask({ id: 'c', dependsOn: ['a'] })
		],
		[
			makeTask({ id: 'parent' }),
			makeTask({ id: 'a', parentId: 'parent', dependsOn: ['b'] }),
			makeTask({ id: 'b', parentId: 'parent', dependsOn: ['a'] })
		]
	])('accepts effective dependency cycles (case %#)', (...tasks) => {
		const plan = makePlan(tasks);
		const other = makePlan([]);
		for (const file of [toPlanFile(plan), toBackupFile([other, plan])]) {
			expect(parseFile(JSON.stringify(file))).toEqual({
				ok: true,
				plans: file.kind === 'plan' ? [plan] : [other, plan]
			});
		}
	});

	it('imports and loads an existing plan whose inherited parent edge introduces a cycle', () => {
		const plan = makePlan([
			makeTask({ id: 'p', dependsOn: ['x'] }),
			makeTask({ id: 's', parentId: 'p' }),
			makeTask({ id: 'x', dependsOn: ['s'] })
		]);
		expect(parseFile(JSON.stringify(toPlanFile(plan)))).toEqual({ ok: true, plans: [plan] });
		expect(parsePlan(JSON.stringify({ schemaVersion: 1, plan }))).toEqual({
			ok: true,
			value: plan
		});
	});

	it('reads valid inherited and sibling dependencies', () => {
		const plan = makePlan([
			makeTask({ id: 'parent', dependsOn: ['other'] }),
			makeTask({ id: 'a', parentId: 'parent', dependsOn: ['b'] }),
			makeTask({ id: 'b', parentId: 'parent' }),
			makeTask({ id: 'other' })
		]);
		expect(parseFile(JSON.stringify(toPlanFile(plan)))).toEqual({ ok: true, plans: [plan] });
	});

	it('reads dependencies that break the date rule', () => {
		const plan = makePlan([
			makeTask({ id: 'early', end: '2027-01-01', dependsOn: ['late'] }),
			makeTask({ id: 'late', start: '2027-02-01' })
		]);
		expect(parseFile(JSON.stringify(toPlanFile(plan)))).toEqual({ ok: true, plans: [plan] });
	});

	it.each(['plan', 'backup'])('normalizes imported owners in a %s file', (kind) => {
		const plan = makePlan([makeTask({ id: 'a', owners: [' Ana ', 'ana', '', 'Bo '] })]);
		const file = kind === 'plan' ? toPlanFile(plan) : toBackupFile([plan]);
		const result = parseFile(JSON.stringify(file));
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.plans[0].tasks[0].owners).toEqual(['Ana', 'Bo']);
	});
});

describe('file names', () => {
	it('makes a slug from the heading', () => {
		expect(slugify('  Café Relaunch — Phase 2! ')).toBe('cafe-relaunch-phase-2');
		expect(slugify('專案 計畫')).toBe('專案-計畫');
	});

	it('keeps Japanese and Indic marks, removes Latin accents', () => {
		expect(slugify('データベース計画')).toBe('データベース計画');
		expect(slugify('Café Plan')).toBe('cafe-plan');
		expect(slugify('योजना')).toBe('योजना');
	});

	it('cuts a long heading without a trailing hyphen or a split surrogate pair', () => {
		expect(slugify(`${'a'.repeat(59)} b`)).toBe('a'.repeat(59));
		const emoji = slugify(`${'a'.repeat(59)}\u{20BB7}b`);
		expect([...emoji]).toHaveLength(60);
		expect(emoji.endsWith('\u{20BB7}')).toBe(true);
		expect(slugify(`${'word '.repeat(14)}x`)).not.toMatch(/-$/);
	});

	it('uses the export file name pattern', () => {
		expect(exportFileName('Garden plan', '2027-04-01')).toBe(
			'taktblatt-garden-plan-2027-04-01.json'
		);
		expect(exportFileName('', '2027-04-01')).toBe('taktblatt-untitled-plan-2027-04-01.json');
	});
});

describe('withNewIds', () => {
	it('gives new ids and keeps all references', () => {
		const plan = createExamplePlan('2027-04-01');
		const copy = withNewIds(plan);
		expect(copy.id).not.toBe(plan.id);
		const ids = new Set(copy.tasks.map((t) => t.id));
		expect(copy.tasks.some((t) => plan.tasks.some((o) => o.id === t.id))).toBe(false);
		for (const t of copy.tasks) {
			for (const d of t.dependsOn) expect(ids.has(d)).toBe(true);
		}
		expect(parseFile(JSON.stringify(toPlanFile(copy))).ok).toBe(true);
		const mention = copy.tasks
			.find((t) => t.note.includes('@[task:'))!
			.note.match(/@\[task:([^\]]+)\]/)![1];
		expect(ids.has(mention)).toBe(true);
	});

	it('preserves an unreferenced mention token when the id is not in the plan', () => {
		const plan = makePlan([makeTask({ id: 'a', note: 'Ref @[task:unknown] and @[task:a]' })]);
		const copy = withNewIds(plan);
		expect(copy.tasks[0].note).toBe(`Ref @[task:unknown] and @[task:${copy.tasks[0].id}]`);
	});
});

describe('backupFileName', () => {
	it('uses the export date', () => {
		expect(backupFileName('2027-04-01')).toBe('taktblatt-backup-2027-04-01.json');
	});
});

describe('serializeFile', () => {
	it('writes a file that parseFile reads again', () => {
		const plan = createExamplePlan('2027-04-01');
		const text = serializeFile(toBackupFile([plan]));
		expect(text.endsWith('\n')).toBe(true);
		expect(parseFile(text)).toEqual({ ok: true, plans: [plan] });
	});
});

describe('limitErrors', () => {
	it('keeps a short list', () => {
		expect(limitErrors(['a', 'b'], 3)).toEqual({ shown: ['a', 'b'], more: 0 });
	});
	it('counts the errors that it hides', () => {
		expect(limitErrors(['a', 'b', 'c', 'd'], 3)).toEqual({ shown: ['a', 'b', 'c'], more: 1 });
	});
});

describe('planned windows on import', () => {
	it.each(['plan', 'backup'] as const)(
		'widens narrow parents and preserves wider windows in a %s file',
		(kind) => {
			const narrow = makeTask({
				id: 'narrow',
				start: '2027-02-05',
				end: '2027-02-10',
				owners: ['Own'],
				status: 'todo'
			});
			const wide = makeTask({
				id: 'wide',
				start: '2027-01-01',
				end: '2027-12-31',
				owners: ['Own', 'Child'],
				status: 'todo'
			});
			const plan = makePlan([
				narrow,
				makeTask({
					id: 'a',
					parentId: 'narrow',
					start: '2027-02-01',
					end: '2027-02-20',
					owners: ['Child'],
					status: 'done'
				}),
				wide,
				makeTask({
					id: 'b',
					parentId: 'wide',
					start: '2027-02-01',
					end: '2027-02-20',
					owners: ['Child'],
					status: 'done'
				})
			]);
			const file =
				kind === 'plan'
					? { schemaVersion: SCHEMA_VERSION, kind, plan }
					: { schemaVersion: SCHEMA_VERSION, kind, plans: [plan] };
			const result = parseFile(JSON.stringify(file));
			expect(result.ok).toBe(true);
			if (!result.ok) throw new Error('Expected the file to import');
			expect(result.plans[0].tasks.find((task) => task.id === 'narrow')).toMatchObject({
				start: '2027-02-01',
				end: '2027-02-20',
				owners: ['Own', 'Child'],
				status: 'done'
			});
			expect(result.plans[0].tasks.find((task) => task.id === 'wide')).toEqual({
				...wide,
				status: 'done'
			});
		}
	);
});
