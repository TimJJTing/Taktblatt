/** Translates import diagnostics at the UI boundary. */
import type { ImportDiagnostic, ImportDiagnosticCode } from '#lib/domain/import-diagnostics.ts';
import { joinList } from '#lib/domain/format.ts';
import { uiIntl } from '#lib/ui-language.ts';
import { m } from '#lib/paraglide/messages.js';

export function formatImportDiagnostic(diagnostic: ImportDiagnostic): string {
	const messages: Record<ImportDiagnosticCode, () => string> = {
		json: () => m.import_invalid_json(),
		not_object: () => m.import_not_object(),
		missing_version: () => m.import_missing_version(),
		newer_version: () => m.import_newer_version({ version: diagnostic.version ?? '' }),
		migration: () => m.import_no_migration({ version: diagnostic.version ?? '' }),
		string: () => m.validation_string(),
		boolean: () => m.validation_boolean(),
		array: () => m.validation_array(),
		object: () => m.validation_object(),
		missing: () => m.validation_missing(),
		choice: () =>
			diagnostic.values?.length
				? m.validation_choice_values({
						values: joinList(diagnostic.values, uiIntl(), 'disjunction')
					})
				: m.validation_choice(),
		timestamp: () => m.validation_timestamp(),
		empty: () => m.validation_empty(),
		value: () => m.validation_value(),
		validation_date: () => m.validation_date(),
		validation_range: () => m.validation_range(),
		validation_task_stage: () => m.validation_task_stage(),
		validation_task_parent: () => m.validation_task_parent(),
		validation_stage_ids: () => m.validation_stage_ids(),
		validation_task_ids: () => m.validation_task_ids(),
		validation_milestone_ids: () => m.validation_milestone_ids(),
		validation_band_ids: () => m.validation_band_ids(),
		validation_remark_ids: () => m.validation_remark_ids(),
		validation_dependency: () => m.validation_dependency(),
		validation_dependency_parent: () => m.validation_dependency_parent(),
		validation_dependency_cycle: () => m.validation_dependency_cycle(),
		validation_backup_empty: () => m.validation_backup_empty(),
		validation_plan_ids: () => m.validation_plan_ids()
	};
	const message = Object.hasOwn(messages, diagnostic.code)
		? messages[diagnostic.code]()
		: m.validation_value();
	return diagnostic.path ? m.field_value({ label: diagnostic.path, value: message }) : message;
}
