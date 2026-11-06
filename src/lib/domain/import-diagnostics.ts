/** Stable import diagnostics. Domain code does not use the UI language. */
export const VALIDATION_MESSAGES = {
	validation_date: 'Use a date in YYYY-MM-DD format.',
	validation_range: 'The range must start on or before it ends.',
	validation_task_stage: 'Each task must belong to a stage of the plan.',
	validation_task_parent:
		'A subtask must have a task of the same stage as its parent. The maximum depth is 2.',
	validation_stage_ids: 'Stage ids must be unique.',
	validation_task_ids: 'Task ids must be unique.',
	validation_milestone_ids: 'Milestone ids must be unique.',
	validation_band_ids: 'Band ids must be unique.',
	validation_remark_ids: 'Remark section ids must be unique.',
	validation_dependency: 'Each dependency must point at a different task of the plan.',
	validation_dependency_parent: 'A task must not depend on its own parent or subtask.',
	validation_dependency_cycle: 'Task dependencies must not form a cycle in the effective graph.',
	validation_backup_empty: 'A backup file must contain at least one plan.',
	validation_plan_ids: 'Plan ids must be unique in a backup file.'
} as const;

export type ValidationCode = keyof typeof VALIDATION_MESSAGES;
export type MigrationCode = 'not_object' | 'missing_version' | 'newer_version' | 'migration';
export type ImportDiagnosticCode =
	| ValidationCode
	| MigrationCode
	| 'json'
	| 'string'
	| 'boolean'
	| 'array'
	| 'object'
	| 'missing'
	| 'choice'
	| 'timestamp'
	| 'empty'
	| 'value';

export interface ImportDiagnostic {
	code: ImportDiagnosticCode;
	path?: string;
	version?: number;
	values?: string[];
	/** English diagnostic for domain callers that do not supply a formatter. */
	message: string;
}

export function isValidationCode(code: string): code is ValidationCode {
	return Object.hasOwn(VALIDATION_MESSAGES, code);
}

/** Keeps English diagnostics available to callers outside the UI. */
export function englishImportDiagnostic(diagnostic: ImportDiagnostic): string {
	return diagnostic.path ? `${diagnostic.path}: ${diagnostic.message}` : diagnostic.message;
}
