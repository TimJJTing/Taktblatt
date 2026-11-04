/**
 * The plan data model. This Valibot schema is the import/export contract.
 * The TypeScript types come from the schema. Refer to docs/data-model.md.
 */
import * as v from 'valibot';
import { isISODate } from './date';
import { BAND_TINT_KEYS, STAGE_COLOR_KEYS } from './palette';

export const SCHEMA_VERSION = 1;
export const LOCALES = ['en', 'de', 'zh-TW', 'ja'] as const;
export const MILESTONE_SYMBOLS = ['diamond', 'flag', 'star', 'circle'] as const;
export const PAPER_SIZES = ['a4', 'letter'] as const;

export const LIMITS = {
	heading: 80,
	objective: 250,
	stageTitle: 30
} as const;

const Id = v.pipe(v.string(), v.minLength(1));
const ISODateSchema = v.pipe(v.string(), v.check(isISODate, 'Use a date in YYYY-MM-DD format.'));
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
	done: v.boolean(),
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
		locale: v.picklist(LOCALES),
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
	v.check((plan) => plan.range.start <= plan.range.end, 'The range must start before it ends.'),
	v.check((plan) => {
		const stageIds = new Set(plan.stages.map((s) => s.id));
		return plan.tasks.every((t) => stageIds.has(t.stageId));
	}, 'Each task must belong to a stage of the plan.'),
	v.check((plan) => {
		const byId = new Map(plan.tasks.map((t) => [t.id, t]));
		return plan.tasks.every((t) => {
			if (t.parentId === null) return true;
			const parent = byId.get(t.parentId);
			return parent !== undefined && parent.parentId === null && parent.stageId === t.stageId;
		});
	}, 'A subtask must have a task of the same stage as its parent. The maximum depth is 2.'),
	v.check(
		(plan) => new Set(plan.tasks.map((t) => t.id)).size === plan.tasks.length,
		'Task ids must be unique.'
	),
	v.check((plan) => {
		const ids = new Set(plan.tasks.map((t) => t.id));
		return plan.tasks.every((t) => t.dependsOn.every((d) => d !== t.id && ids.has(d)));
	}, 'Each dependency must point at a different task of the plan.')
);

export const PlanFileSchema = v.object({
	schemaVersion: v.literal(SCHEMA_VERSION),
	kind: v.literal('plan'),
	plan: PlanSchema
});

export const BackupFileSchema = v.object({
	schemaVersion: v.literal(SCHEMA_VERSION),
	kind: v.literal('backup'),
	plans: v.array(PlanSchema)
});

export const AnyFileSchema = v.variant('kind', [PlanFileSchema, BackupFileSchema]);

export type Locale = (typeof LOCALES)[number];
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
