/**
 * The print model: the blocks of the printed plan, in sheet order.
 * It reads the plan and the task index. It does not use Svelte or the DOM.
 * The sheets component measures each block and gives the heights to the paginator.
 * Refer to docs/spec.md, section 7.
 */
import type { ISODate } from './date.ts';
import {
	stageDeliverables,
	stageProgress,
	stageSpan,
	type EffectiveValues,
	type Readiness,
	type TaskIndex
} from './derive.ts';
import {
	dependencyLines,
	ganttRows,
	monthTicks,
	todayX,
	visibleBands,
	visibleMilestones,
	type DependencyLine,
	type GanttRow,
	type MonthTick
} from './gantt.ts';
import { GANTT_VIEW_ID, type DiagramOrientation, type DiagramViewId } from './diagram.ts';
import type { Band, Milestone, Plan, RemarkSection, Stage, Task } from './schema.ts';

export type { DiagramOrientation } from './diagram.ts';

/** How a segment sits on the sheets. The paginator reads these values. */
interface Placement {
	/** The sheet orientation. Absent means portrait. An orientation change starts a new sheet. */
	orientation?: DiagramOrientation;
	/** The number of items that stay with the lead of the segment. */
	keep: number;
	/** The space above the segment, in CSS pixels. */
	gap: number;
	breakBefore: boolean;
}

export interface HeaderSegment extends Placement {
	kind: 'header';
	id: 'header';
}

export interface GanttSegment extends Placement {
	kind: 'gantt';
	/** `gantt`. The print model can prefix the id to keep it unique. */
	id: string;
	rows: GanttRow[];
	lines: DependencyLine[];
	ticks: MonthTick[];
	bands: { band: Band; x0: number; x1: number }[];
	milestones: { label: string; milestone: Milestone; x: number }[];
	/** The x of the today line, or null. */
	today: number | null;
}

export interface LegendSegment extends Placement {
	kind: 'legend';
	/** For example `legend-stages`. The print model can prefix the id to keep it unique. */
	id: string;
	which: 'stages' | 'milestones' | 'bands';
}

export interface Card {
	stage: Stage;
	number: number;
	span: { start: ISODate; end: ISODate } | null;
	deliverables: string[];
}

export interface CardsSegment extends Placement {
	kind: 'cards';
	id: 'cards';
	/** Rows of up to three cards. */
	rows: Card[][];
}

export interface TableRow {
	task: Task;
	/** 0 for a task, 1 for a subtask. */
	level: 0 | 1;
	eff: EffectiveValues;
	readiness: Readiness;
}

export interface StageSegment extends Placement {
	kind: 'stage';
	id: string;
	stage: Stage;
	number: number;
	span: { start: ISODate; end: ISODate } | null;
	progress: { done: number; inProgress: number; total: number };
	/** The visible rows. A stage without tasks has no rows and one item for the empty notice. */
	rows: TableRow[];
	/** The first stage shows the title of the work plan above its header. */
	workPlanTitle: boolean;
}

export interface RemarksSegment extends Placement {
	kind: 'remarks';
	id: 'remarks';
	/** Rows of up to two sections. */
	rows: RemarkSection[][];
}

/**
 * A generic diagram segment. A registered paper adapter builds it and renders it.
 * `items` are the legal split positions: the paginator splits only between items.
 * `data` is private to the adapter. The print model does not read it.
 */
export interface SceneSegment extends Placement {
	kind: 'scene';
	/** A stable id that is unique in the model, for example `route-map-scene`. */
	id: string;
	/** The id of the diagram view that renders the segment. */
	diagram: DiagramViewId;
	items: readonly unknown[];
	data?: unknown;
}

export type Segment =
	| HeaderSegment
	| GanttSegment
	| LegendSegment
	| CardsSegment
	| StageSegment
	| RemarksSegment
	| SceneSegment;

/** The segment kinds that a diagram paper adapter can return. */
export type DiagramSegment = GanttSegment | LegendSegment | SceneSegment;

/** A diagram prepared for print: its id, orientation and segments, including its legends. */
export interface PrintDiagram {
	id: DiagramViewId;
	orientation: DiagramOrientation;
	segments: readonly DiagramSegment[];
}

/** The number of items of a segment. The paginator splits only between items. */
export function itemCount(segment: Segment): number {
	switch (segment.kind) {
		case 'header':
		case 'legend':
			return 1;
		case 'gantt':
			return segment.rows.length;
		case 'cards':
		case 'remarks':
			return segment.rows.length;
		case 'stage':
			return Math.max(1, segment.rows.length);
		case 'scene':
			return segment.items.length;
	}
}

/** Space between blocks on a sheet, in CSS pixels. */
const GAP = { section: 16, legend: 6 } as const;
export const CARDS_PER_ROW = 3;
export const REMARKS_PER_ROW = 2;

function chunk<T>(list: readonly T[], size: number): T[][] {
	const rows: T[][] = [];
	for (let i = 0; i < list.length; i += size) rows.push(list.slice(i, i + size));
	return rows;
}

export interface PrintModelInput {
	plan: Plan;
	index: TaskIndex;
	isExpanded: (taskId: string) => boolean;
	/** The date of the today line: the footer date, else the current date. */
	today: ISODate;
}

/** The date of the today line in print: the footer date, else today. */
export function printToday(plan: Plan, today: ISODate): ISODate {
	return plan.footer.date ?? today;
}

export interface PrintModelOptions extends PrintModelInput {
	/**
	 * The selected diagrams in print order, each prepared by its paper adapter.
	 * The default is Gantt only.
	 */
	diagrams?: readonly PrintDiagram[];
}

/** The Gantt segment and its legends. The Gantt paper adapter uses this function. */
export function ganttPrintSegments({
	plan,
	index,
	isExpanded,
	today
}: PrintModelInput): DiagramSegment[] {
	const win = plan.range;
	const rows = ganttRows(
		index,
		plan.stages.map((s) => s.id),
		isExpanded,
		win
	);
	const segments: DiagramSegment[] = [
		{
			kind: 'gantt',
			id: 'gantt',
			rows,
			lines: dependencyLines(index, rows),
			ticks: monthTicks(win),
			bands: visibleBands(win, plan.bands),
			milestones: visibleMilestones(win, plan.milestones),
			today: todayX(win, today),
			keep: 3,
			gap: GAP.section,
			breakBefore: false
		},
		{
			kind: 'legend',
			id: 'legend-stages',
			which: 'stages',
			keep: 1,
			gap: GAP.legend,
			breakBefore: false
		}
	];
	if (plan.milestones.length > 0) {
		segments.push({
			kind: 'legend',
			id: 'legend-milestones',
			which: 'milestones',
			keep: 1,
			gap: GAP.legend,
			breakBefore: false
		});
	}
	if (plan.bands.length > 0) {
		segments.push({
			kind: 'legend',
			id: 'legend-bands',
			which: 'bands',
			keep: 1,
			gap: GAP.legend,
			breakBefore: false
		});
	}
	return segments;
}

/**
 * Builds the print blocks: header, the selected diagrams, stage cards, the work plan and remarks.
 * Each diagram after the first starts on a new sheet. The segments of a diagram get its orientation.
 * The paginator starts a new sheet at each orientation change.
 */
export function buildPrintModel(options: PrintModelOptions): Segment[] {
	const { plan, index, isExpanded } = options;
	const diagrams = options.diagrams ?? [
		{ id: GANTT_VIEW_ID, orientation: 'portrait', segments: ganttPrintSegments(options) }
	];
	const segments: Segment[] = [
		{ kind: 'header', id: 'header', keep: 1, gap: 0, breakBefore: false }
	];
	// Segment ids must be unique: the sheets key their blocks by id.
	// A repeated id gets the diagram prefix, then a number if it is still taken.
	const seen = new Set(['header', 'cards', 'remarks']);
	const uniqueId = (diagram: DiagramViewId, id: string) => {
		let unique = seen.has(id) ? `${diagram}:${id}` : id;
		for (let n = 2; seen.has(unique); n++) unique = `${diagram}:${id}:${n}`;
		seen.add(unique);
		return unique;
	};
	diagrams.forEach((diagram, i) => {
		diagram.segments.forEach((segment, j) => {
			segments.push({
				...segment,
				id: uniqueId(diagram.id, segment.id),
				orientation: diagram.orientation,
				breakBefore: segment.breakBefore || (i > 0 && j === 0)
			});
		});
	});
	segments.push({
		kind: 'cards',
		id: 'cards',
		rows: chunk(
			plan.stages.map((stage, i) => ({
				stage,
				number: i + 1,
				span: stageSpan(index, stage.id),
				deliverables: stageDeliverables(index, stage.id)
			})),
			CARDS_PER_ROW
		),
		keep: 1,
		gap: GAP.section,
		breakBefore: false
	});

	plan.stages.forEach((stage, i) => {
		const tableRows: TableRow[] = [];
		for (const task of index.stageTasks.get(stage.id) ?? []) {
			const children = index.children.get(task.id) ?? [];
			tableRows.push({
				task,
				level: 0,
				eff: index.state.get(task.id)!.eff,
				readiness: index.state.get(task.id)!.readiness
			});
			if (!isExpanded(task.id)) continue;
			for (const child of children) {
				tableRows.push({
					task: child,
					level: 1,
					eff: index.state.get(child.id)!.eff,
					readiness: index.state.get(child.id)!.readiness
				});
			}
		}
		segments.push({
			kind: 'stage',
			id: `stage-${stage.id}`,
			stage,
			number: i + 1,
			span: stageSpan(index, stage.id),
			progress: stageProgress(index, stage.id),
			rows: tableRows,
			workPlanTitle: i === 0,
			// A stage header stays with its first two rows.
			keep: 2,
			gap: GAP.section,
			breakBefore: i === 0
		});
	});

	if (plan.remarks.length > 0) {
		segments.push({
			kind: 'remarks',
			id: 'remarks',
			rows: chunk(plan.remarks, REMARKS_PER_ROW),
			keep: 1,
			gap: GAP.section,
			breakBefore: false
		});
	}
	return segments;
}
