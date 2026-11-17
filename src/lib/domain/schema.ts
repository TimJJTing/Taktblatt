/**
 * The plan data model. This Valibot schema is the import/export contract.
 * The TypeScript types come from the schema. Refer to docs/data-model.md.
 */
import * as v from 'valibot';
import { isISODate } from './date.ts';
import type { ValidationCode } from './import-diagnostics.ts';
import { BAND_TINT_KEYS, STAGE_COLOR_KEYS } from './palette.ts';

export const SCHEMA_VERSION = 1;
export const TASK_STATUSES = ['todo', 'in_progress', 'done', 'canceled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const MILESTONE_SYMBOLS = [
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
] as const;
export const PAPER_SIZES = ['a4', 'letter'] as const;

export const LIMITS = {
	heading: 80,
	objective: 250,
	stageTitle: 30
} as const;

const Id = v.pipe(v.string(), v.minLength(1));
const ISODateSchema = v.pipe(
	v.string(),
	v.check(isISODate, 'validation_date' satisfies ValidationCode)
);
const NullableDate = v.nullable(ISODateSchema);
const Timestamp = v.pipe(v.string(), v.isoTimestamp());

export const StageSchema = v.object({
	id: Id,
	title: v.string(),
	description: v.string(),
	color: v.picklist(STAGE_COLOR_KEYS)
});

export const TaskSchema = v.object({
	id: Id,
	stageId: Id,
	parentId: v.nullable(Id),
	title: v.string(),
	deliverable: v.string(),
	start: NullableDate,
	end: NullableDate,
	owners: v.array(v.string()),
	status: v.picklist(TASK_STATUSES),
	note: v.string(),
	dependsOn: v.array(Id),
	createdAt: Timestamp
});

export const MilestoneSchema = v.object({
	id: Id,
	title: v.string(),
	description: v.string(),
	date: ISODateSchema,
	symbol: v.picklist(MILESTONE_SYMBOLS)
});

export const BandSchema = v.object({
	id: Id,
	title: v.string(),
	start: ISODateSchema,
	end: ISODateSchema,
	color: v.picklist(BAND_TINT_KEYS)
});

export const RemarkSectionSchema = v.object({
	id: Id,
	title: v.string(),
	bullets: v.array(v.string())
});

export const PlanSchema = v.pipe(
	v.object({
		id: Id,
		heading: v.string(),
		subheading: v.string(),
		range: v.object({ start: ISODateSchema, end: ISODateSchema }),
		objective: v.string(),
		paper: v.picklist(PAPER_SIZES),
		footer: v.object({
			note: v.string(),
			version: v.string(),
			date: NullableDate,
			right: v.string()
		}),
		stages: v.array(StageSchema),
		tasks: v.array(TaskSchema),
		milestones: v.array(MilestoneSchema),
		bands: v.array(BandSchema),
		remarks: v.array(RemarkSectionSchema),
		createdAt: Timestamp,
		updatedAt: Timestamp
	}),
	v.check(
		(plan) => plan.range.start <= plan.range.end,
		'validation_range' satisfies ValidationCode
	),
	v.check((plan) => {
		const stageIds = new Set(plan.stages.map((s) => s.id));
		return plan.tasks.every((t) => stageIds.has(t.stageId));
	}, 'validation_task_stage' satisfies ValidationCode),
	v.check((plan) => {
		const byId = new Map(plan.tasks.map((t) => [t.id, t]));
		return plan.tasks.every((t) => {
			if (t.parentId === null) return true;
			const parent = byId.get(t.parentId);
			return parent !== undefined && parent.parentId === null && parent.stageId === t.stageId;
		});
	}, 'validation_task_parent' satisfies ValidationCode),
	v.check(
		(plan) => new Set(plan.stages.map((s) => s.id)).size === plan.stages.length,
		'validation_stage_ids' satisfies ValidationCode
	),
	v.check(
		(plan) => new Set(plan.tasks.map((t) => t.id)).size === plan.tasks.length,
		'validation_task_ids' satisfies ValidationCode
	),
	v.check(
		(plan) => new Set(plan.milestones.map((m) => m.id)).size === plan.milestones.length,
		'validation_milestone_ids' satisfies ValidationCode
	),
	v.check(
		(plan) => new Set(plan.bands.map((b) => b.id)).size === plan.bands.length,
		'validation_band_ids' satisfies ValidationCode
	),
	v.check(
		(plan) => new Set(plan.remarks.map((r) => r.id)).size === plan.remarks.length,
		'validation_remark_ids' satisfies ValidationCode
	),
	v.check((plan) => {
		const ids = new Set(plan.tasks.map((t) => t.id));
		return plan.tasks.every((t) => t.dependsOn.every((d) => d !== t.id && ids.has(d)));
	}, 'validation_dependency' satisfies ValidationCode),
	v.check((plan) => {
		const byId = new Map(plan.tasks.map((t) => [t.id, t]));
		return plan.tasks.every((t) =>
			t.dependsOn.every((d) => t.parentId !== d && byId.get(d)?.parentId !== t.id)
		);
	}, 'validation_dependency_parent' satisfies ValidationCode)
);

export const PlanFileSchema = v.object({
	schemaVersion: v.literal(SCHEMA_VERSION),
	kind: v.literal('plan'),
	plan: PlanSchema
});

export const BackupFileSchema = v.object({
	schemaVersion: v.literal(SCHEMA_VERSION),
	kind: v.literal('backup'),
	plans: v.pipe(
		v.array(PlanSchema),
		v.minLength(1, 'validation_backup_empty' satisfies ValidationCode),
		v.check(
			(plans) => new Set(plans.map((p) => p.id)).size === plans.length,
			'validation_plan_ids' satisfies ValidationCode
		)
	)
});

export const AnyFileSchema = v.variant('kind', [PlanFileSchema, BackupFileSchema]);

export type MilestoneSymbol = (typeof MILESTONE_SYMBOLS)[number];
export type PaperSize = (typeof PAPER_SIZES)[number];
export type Stage = v.InferOutput<typeof StageSchema>;
export type Task = v.InferOutput<typeof TaskSchema>;
export type Milestone = v.InferOutput<typeof MilestoneSchema>;
export type Band = v.InferOutput<typeof BandSchema>;
export type RemarkSection = v.InferOutput<typeof RemarkSectionSchema>;
export type Plan = v.InferOutput<typeof PlanSchema>;
export type PlanFile = v.InferOutput<typeof PlanFileSchema>;
export type BackupFile = v.InferOutput<typeof BackupFileSchema>;
export type AnyFile = v.InferOutput<typeof AnyFileSchema>;
