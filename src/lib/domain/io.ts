/** Import and export of plan files. Refer to docs/data-model.md. */
import * as v from 'valibot';
import type { ISODate } from './date';
import { createId } from './ids';
import { MENTION_PATTERN, mentionToken } from './mentions';
import { normalizeOwners } from './owners';
import { migrate, MigrationError } from './migrate';
import { AnyFileSchema, SCHEMA_VERSION, type BackupFile, type Plan, type PlanFile } from './schema';

export type ParseResult = { ok: true; plans: Plan[] } | { ok: false; errors: string[] };

/** Parses the text of a plan file or a backup file. */
export function parseFile(text: string): ParseResult {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return { ok: false, errors: ['The file is not valid JSON.'] };
	}
	try {
		raw = migrate(raw);
	} catch (error) {
		if (error instanceof MigrationError) return { ok: false, errors: [error.message] };
		throw error;
	}
	const result = v.safeParse(AnyFileSchema, raw);
	if (!result.success) {
		return {
			ok: false,
			errors: result.issues.map((issue) => {
				const path = v.getDotPath(issue);
				return path ? `${path}: ${issue.message}` : issue.message;
			})
		};
	}
	const plans = result.output.kind === 'plan' ? [result.output.plan] : result.output.plans;
	for (const plan of plans) {
		for (const task of plan.tasks) task.owners = normalizeOwners(task.owners);
	}
	return { ok: true, plans };
}

export function toPlanFile(plan: Plan): PlanFile {
	return { schemaVersion: SCHEMA_VERSION, kind: 'plan', plan };
}

export function toBackupFile(plans: Plan[]): BackupFile {
	return { schemaVersion: SCHEMA_VERSION, kind: 'backup', plans };
}

/** Makes a file-name part from a heading: lowercase letters, digits and hyphens. */
export function slugify(text: string): string {
	return text
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^\p{Letter}\p{Number}]+/gu, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
}

/** Returns the export file name: taktblatt-<heading-slug>-<YYYY-MM-DD>.json. */
export function exportFileName(heading: string, date: ISODate): string {
	const slug = slugify(heading) || 'untitled-plan';
	return `taktblatt-${slug}-${date}.json`;
}

/** Returns a copy of a plan with new ids for the plan and all its entities. References are updated. */
export function withNewIds(plan: Plan): Plan {
	const map = new Map<string, string>();
	const id = (old: string) => {
		if (!map.has(old)) map.set(old, createId());
		return map.get(old)!;
	};
	const copy = structuredClone(plan);
	copy.id = createId();
	for (const s of copy.stages) s.id = id(s.id);
	for (const t of copy.tasks) t.id = id(t.id);
	for (const t of copy.tasks) {
		t.stageId = id(t.stageId);
		t.parentId = t.parentId === null ? null : id(t.parentId);
		t.dependsOn = t.dependsOn.map(id);
		t.note = t.note.replace(MENTION_PATTERN, (token, old: string) =>
			map.has(old) ? mentionToken(map.get(old)!) : token
		);
	}
	for (const m of copy.milestones) m.id = createId();
	for (const b of copy.bands) b.id = createId();
	for (const r of copy.remarks) r.id = createId();
	return copy;
}
