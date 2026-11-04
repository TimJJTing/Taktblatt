import { describe, expect, it } from 'vitest';
import { createExamplePlan } from './example';
import { createEmptyPlan } from './factory';
import { exportFileName, parseFile, slugify, toBackupFile, toPlanFile, withNewIds } from './io';
import { migrate } from './migrate';

describe('parseFile', () => {
	it('reads a plan file that the app wrote', () => {
		const plan = createExamplePlan('en', '2027-04-01');
		const result = parseFile(JSON.stringify(toPlanFile(plan)));
		expect(result).toEqual({ ok: true, plans: [plan] });
	});

	it('reads a backup file', () => {
		const plans = [createEmptyPlan('de', '2027-04-01'), createExamplePlan('ja', '2027-04-01')];
		const result = parseFile(JSON.stringify(toBackupFile(plans)));
		expect(result.ok && result.plans.length).toBe(2);
	});

	it('rejects text that is not JSON', () => {
		expect(parseFile('{')).toEqual({ ok: false, errors: ['The file is not valid JSON.'] });
	});

	it('rejects a file from a newer app version', () => {
		const result = parseFile(JSON.stringify({ schemaVersion: 99, kind: 'plan' }));
		expect(result.ok).toBe(false);
	});

	it('gives the path of an invalid field', () => {
		const file = toPlanFile(createEmptyPlan('en', '2027-04-01'));
		(file.plan.range as { start: string }).start = '2027-13-01';
		const result = parseFile(JSON.stringify(file));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors[0]).toContain('plan.range.start');
	});

	it('rejects a dependency on a task that does not exist', () => {
		const plan = createExamplePlan('en', '2027-04-01');
		plan.tasks[0].dependsOn = ['missing'];
		expect(parseFile(JSON.stringify(toPlanFile(plan))).ok).toBe(false);
	});
});

describe('migrate', () => {
	it('rejects data without a schema version', () => {
		expect(() => migrate({})).toThrow();
	});
});

describe('file names', () => {
	it('makes a slug from the heading', () => {
		expect(slugify('  Café Relaunch — Phase 2! ')).toBe('cafe-relaunch-phase-2');
		expect(slugify('專案 計畫')).toBe('專案-計畫');
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
		const plan = createExamplePlan('en', '2027-04-01');
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
});
