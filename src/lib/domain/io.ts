/** Import and export of plan files. Refer to docs/data-model.md. */
import * as v from 'valibot';
import {
	englishImportDiagnostic,
	isValidationCode,
	VALIDATION_MESSAGES,
	type ImportDiagnostic,
	type ImportDiagnosticCode
} from './import-diagnostics.ts';
import type { ISODate } from './date.ts';
import { createId } from './ids.ts';
import { MENTION_PATTERN, mentionToken } from './mentions.ts';
import { normalizeOwners } from './owners.ts';
import { migrate, MigrationError } from './migrate.ts';
import {
	AnyFileSchema,
	SCHEMA_VERSION,
	type BackupFile,
	type Plan,
	type PlanFile
} from './schema.ts';

export type ParseResult = { ok: true; plans: Plan[] } | { ok: false; errors: string[] };

/** Parses the text of a plan file or a backup file. */
export function parseFile(
	text: string,
	formatDiagnostic: (diagnostic: ImportDiagnostic) => string = englishImportDiagnostic
): ParseResult {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return {
			ok: false,
			errors: [formatDiagnostic({ code: 'json', message: 'The file is not valid JSON.' })]
		};
	}
	try {
		raw = migrate(raw);
	} catch (error) {
		if (error instanceof MigrationError)
			return {
				ok: false,
				errors: [
					formatDiagnostic({ code: error.code, version: error.version, message: error.message })
				]
			};
		throw error;
	}
	const result = v.safeParse(AnyFileSchema, raw);
	if (!result.success) {
		return {
			ok: false,
			errors: result.issues.map((issue) => {
				const custom = isValidationCode(issue.message) ? issue.message : undefined;
				const code = custom ?? issueCode(issue);
				const values =
					code === 'choice' && issue.expected
						? issue.expected.replace(/^\((.*)\)$/, '$1').split(' | ')
						: undefined;
				const message = custom
					? VALIDATION_MESSAGES[custom]
					: code === 'missing'
						? 'This field is required.'
						: values?.length
							? `Use one of these values: ${values.join(', ')}.`
							: issue.message;
				return formatDiagnostic({
					code,
					values,
					path: v.getDotPath(issue) ?? undefined,
					message
				});
			})
		};
	}
	const plans = result.output.kind === 'plan' ? [result.output.plan] : result.output.plans;
	for (const plan of plans) {
		for (const task of plan.tasks) task.owners = normalizeOwners(task.owners);
	}
	return { ok: true, plans };
}

/** Unknown library issues use a translatable fallback. */
function issueCode(issue: v.BaseIssue<unknown>): ImportDiagnosticCode {
	if ((issue.type === 'object' || issue.type === 'variant') && issue.received === 'undefined')
		return 'missing';
	switch (issue.type) {
		case 'string':
		case 'boolean':
		case 'array':
			return issue.type;
		case 'object':
			return 'object';
		case 'picklist':
		case 'literal':
		case 'variant':
			return 'choice';
		case 'iso_timestamp':
			return 'timestamp';
		case 'min_length':
			return 'empty';
		default:
			return 'value';
	}
}

export function toPlanFile(plan: Plan): PlanFile {
	return { schemaVersion: SCHEMA_VERSION, kind: 'plan', plan };
}

export function toBackupFile(plans: Plan[]): BackupFile {
	return { schemaVersion: SCHEMA_VERSION, kind: 'backup', plans };
}

/**
 * Makes a file-name part from a heading: lowercase letters, digits and hyphens.
 * It removes Latin accents only. Other marks stay (for example Japanese dakuten and Indic vowel signs).
 */
export function slugify(text: string): string {
	const slug = text
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.normalize('NFC')
		.toLowerCase()
		.replace(/[^\p{Letter}\p{Number}\p{Mark}]+/gu, '-')
		.replace(/^-+/, '');
	// Cut by code points, so that a surrogate pair stays whole.
	return [...slug].slice(0, 60).join('').replace(/-+$/, '');
}

/** Returns the export file name: taktblatt-<heading-slug>-<YYYY-MM-DD>.json. */
export function exportFileName(heading: string, date: ISODate): string {
	const slug = slugify(heading) || 'untitled-plan';
	return `taktblatt-${slug}-${date}.json`;
}

/** Returns the file name of a backup: taktblatt-backup-<YYYY-MM-DD>.json. */
export function backupFileName(date: ISODate): string {
	return `taktblatt-backup-${date}.json`;
}

/** Writes a file as text. Two spaces of indentation keep the file readable. */
export function serializeFile(file: PlanFile | BackupFile): string {
	return `${JSON.stringify(file, null, 2)}\n`;
}

/** Splits a list of import errors into the first `max` errors and the number of other errors. */
export function limitErrors(errors: readonly string[], max = 8): { shown: string[]; more: number } {
	return { shown: errors.slice(0, max), more: Math.max(0, errors.length - max) };
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
