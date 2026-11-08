/**
 * The workspace store. It holds the plan list and the active plan.
 * All changes to a plan go through `commit`. One commit is one undo step.
 * Plan lifecycle operations and undo/redo are the explicit exception in ADR 3.
 */
import { getContext, setContext } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import { dependencyEdgeKey, dependencyWarnings } from '#lib/domain/dependencies.ts';
import { nowISO } from '#lib/domain/date.ts';
import { indexTasks, type TaskIndex } from '#lib/domain/derive.ts';
import { createEmptyPlan } from '#lib/domain/factory.ts';
import { withNewIds } from '#lib/domain/io.ts';
import type { Plan } from '#lib/domain/schema.ts';
import { History } from './history.svelte.ts';
import { KEYS, PlanStorage, StorageWriteError, type LoadResult } from './storage.ts';

export interface PlanSummary {
	id: string;
	heading: string;
	updatedAt: string;
}

export interface DamagedNotice {
	key: string;
	raw: string;
}

/** What `deletePlan` returns, so that the UI can offer an undo. */
export interface DeletedPlan {
	plan: Plan;
	position: number;
	wasActive: boolean;
}

export type ImportConflict = { incoming: Plan; existing: PlanSummary };

const summaryOf = (plan: Plan): PlanSummary => ({
	id: plan.id,
	heading: plan.heading,
	updatedAt: plan.updatedAt
});

export class Workspace {
	/** All plans, in list order. */
	plans = $state<PlanSummary[]>([]);
	/** The active plan. Views read it and must not change it directly. Use `commit`. */
	plan = $state<Plan>(null as unknown as Plan);
	/** Damaged stored data that the app found. The UI shows a notice. */
	damaged = $state<DamagedNotice[]>([]);

	/** The task lookup tables. Every view uses this one index. */
	readonly index: TaskIndex = $derived(indexTasks(this.plan.tasks));

	readonly history = new History<Plan>();
	private readonly storage: PlanStorage;

	constructor(
		storage: Storage,
		private readonly notify: () => void = () => {}
	) {
		this.storage = new PlanStorage(storage);
		this.load();
	}

	// -------------------------------------------------------------------------
	// Loading
	// -------------------------------------------------------------------------

	private load(): void {
		const index = this.recoverStored(this.storage.loadIndex());
		let planIds: string[] = [];
		let activeId: string | null = null;
		if (index.ok === true) {
			planIds = index.value.planIds;
			activeId = index.value.activeId;
		}
		// Plans in storage that are not in the index are added at the end.
		for (const id of this.storage.storedPlanIds()) if (!planIds.includes(id)) planIds.push(id);

		const plans: Plan[] = [];
		for (const id of planIds) {
			const result = this.recoverStored(this.storage.loadPlan(id));
			if (result.ok === true) plans.push(result.value);
			else if (result.ok === false) {
				this.storage.removePlan(id);
			}
		}

		if (plans.length === 0) {
			const plan = createEmptyPlan();
			this.storage.savePlan(plan);
			plans.push(plan);
		}
		this.plans = plans.map(summaryOf);
		this.plan = plans.find((p) => p.id === activeId) ?? plans[0];
		this.saveIndex();
	}

	/** Keeps invalid stored text and adds a notice before the caller continues. */
	private recoverStored<T>(result: LoadResult<T>): LoadResult<T> {
		if (result.ok === false) {
			const key = this.storage.keepDamaged(result.raw);
			this.damaged = [...this.damaged, { key, raw: result.raw }];
		}
		return result;
	}

	private saveIndex(): void {
		this.storage.saveIndex({ planIds: this.plans.map((p) => p.id), activeId: this.plan.id });
	}

	private persist(): void {
		const snapshot = $state.snapshot(this.plan) as Plan;
		this.storage.savePlan(snapshot);
		const i = this.plans.findIndex((p) => p.id === snapshot.id);
		if (i >= 0) this.plans[i] = summaryOf(snapshot);
	}

	// -------------------------------------------------------------------------
	// Editing
	// -------------------------------------------------------------------------

	/**
	 * Applies one change to the active plan. Records an undo step and saves the plan.
	 * The mutator changes the plan in place.
	 */
	commit(mutate: (plan: Plan) => void): void {
		const before = $state.snapshot(this.plan) as Plan;
		mutate(this.plan);
		if (JSON.stringify(before) === JSON.stringify($state.snapshot(this.plan))) return;
		this.plan.updatedAt = nowISO();
		this.history.record(before);
		this.persist();
		const previousCycles = new SvelteSet(
			dependencyWarnings(indexTasks(before.tasks))
				.filter((w) => w.kind === 'cycle')
				.map((w) => dependencyEdgeKey(w.taskId, w.dependencyId))
		);
		if (
			dependencyWarnings(indexTasks(this.plan.tasks)).some(
				(w) =>
					w.kind === 'cycle' && !previousCycles.has(dependencyEdgeKey(w.taskId, w.dependencyId))
			)
		)
			this.notify();
	}

	/**
	 * Reverts the newest commit and removes it from the history. There is no redo for it.
	 * Use it to discard a new entry that stayed empty, so that it does not leave an undo step.
	 */
	rollback(): boolean {
		const previous = this.history.drop();
		if (!previous) return false;
		this.plan = previous;
		this.persist();
		return true;
	}

	undo(): boolean {
		const previous = this.history.undo($state.snapshot(this.plan) as Plan);
		if (!previous) return false;
		this.plan = previous;
		this.persist();
		return true;
	}

	redo(): boolean {
		const next = this.history.redo($state.snapshot(this.plan) as Plan);
		if (!next) return false;
		this.plan = next;
		this.persist();
		return true;
	}

	/** Returns true when the active plan has no content. The UI then offers the example. */
	get isPristine(): boolean {
		const p = this.plan;
		return (
			p.heading === '' &&
			p.tasks.length === 0 &&
			p.milestones.length === 0 &&
			p.bands.length === 0 &&
			p.remarks.length === 0 &&
			p.stages.every((s) => s.title === '' && s.description === '')
		);
	}

	// -------------------------------------------------------------------------
	// Plan list
	// -------------------------------------------------------------------------

	private activate(plan: Plan): void {
		this.plan = plan;
		this.history.clear();
		this.saveIndex();
	}

	switchTo(id: string): void {
		if (id === this.plan.id) return;
		const result = this.recoverStored(this.storage.loadPlan(id));
		if (result.ok !== true) return;
		this.activate(result.value);
	}

	createPlan(): void {
		const plan = createEmptyPlan();
		this.storage.savePlan(plan);
		this.plans = [...this.plans, summaryOf(plan)];
		this.activate(plan);
	}

	duplicatePlan(suffix: string): void {
		const copy = withNewIds($state.snapshot(this.plan) as Plan);
		const now = nowISO();
		copy.heading = `${copy.heading}${suffix}`;
		copy.createdAt = now;
		copy.updatedAt = now;
		this.storage.savePlan(copy);
		const position = this.plans.findIndex((p) => p.id === this.plan.id) + 1;
		this.plans = [...this.plans.slice(0, position), summaryOf(copy), ...this.plans.slice(position)];
		this.activate(copy);
	}

	/** Deletes a plan. When it is the last plan, a new empty plan replaces it. */
	deletePlan(id: string): DeletedPlan | null {
		const position = this.plans.findIndex((p) => p.id === id);
		const loaded =
			id === this.plan.id
				? { ok: true as const, value: $state.snapshot(this.plan) as Plan }
				: this.recoverStored(this.storage.loadPlan(id));
		if (position < 0 || loaded.ok !== true) return null;
		const wasActive = id === this.plan.id;
		this.storage.removePlan(id);
		this.plans = this.plans.filter((p) => p.id !== id);
		if (this.plans.length === 0) {
			this.createPlan();
		} else if (wasActive) {
			this.switchTo(this.plans[Math.min(position, this.plans.length - 1)].id);
		} else {
			this.saveIndex();
		}
		return { plan: loaded.value, position, wasActive };
	}

	restorePlan(deleted: DeletedPlan): void {
		this.storage.savePlan(deleted.plan);
		const plans = this.plans.filter((p) => p.id !== deleted.plan.id);
		plans.splice(Math.min(deleted.position, plans.length), 0, summaryOf(deleted.plan));
		this.plans = plans;
		if (deleted.wasActive) this.activate(deleted.plan);
		else this.saveIndex();
	}

	// -------------------------------------------------------------------------
	// Import
	// -------------------------------------------------------------------------

	/** Returns the plans whose id is already in the list. The UI asks the user about each one. */
	importConflicts(plans: readonly Plan[]): ImportConflict[] {
		return plans.flatMap((incoming) => {
			const existing = this.plans.find((p) => p.id === incoming.id);
			return existing ? [{ incoming, existing }] : [];
		});
	}

	/**
	 * Adds imported plans. For a plan whose id exists, `replace` replaces it and `keep-both` adds a copy.
	 * The last imported plan becomes active.
	 * The import is atomic. When the browser cannot save, it restores the stored text of the plans
	 * that it wrote, keeps the plan list unchanged and throws a `StorageWriteError`.
	 */
	importPlans(
		plans: readonly Plan[],
		decide: (plan: Plan) => 'replace' | 'keep-both',
		copySuffix: string
	): void {
		let last: Plan | null = null;
		let list = [...this.plans];
		// The stored text before the first write of this import, for each plan id.
		const previous: [id: string, raw: string | null][] = [];
		const previousIndex = this.storage.rawIndex();
		try {
			for (const incoming of plans) {
				let plan = incoming;
				const exists = list.some((p) => p.id === incoming.id);
				if (exists && decide(incoming) === 'keep-both') {
					plan = withNewIds(incoming);
					plan.heading = `${plan.heading}${copySuffix}`;
				}
				if (!previous.some(([id]) => id === plan.id))
					previous.push([plan.id, this.storage.rawPlan(plan.id)]);
				this.storage.savePlan(plan);
				if (list.some((p) => p.id === plan.id))
					list = list.map((p) => (p.id === plan.id ? summaryOf(plan) : p));
				else list = [...list, summaryOf(plan)];
				last = plan;
			}
			if (last) this.storage.saveIndex({ planIds: list.map((p) => p.id), activeId: last.id });
		} catch (error) {
			for (const [id, raw] of previous) {
				try {
					this.storage.restoreRawPlan(id, raw);
				} catch {
					// Keep going. Restore the other plans.
				}
			}
			try {
				this.storage.restoreRawIndex(previousIndex);
			} catch {
				// The index did not change when its write failed.
			}
			throw new StorageWriteError(error);
		}
		this.plans = list;
		if (last) {
			this.plan = last;
			this.history.clear();
		}
	}

	/** Returns a snapshot of the active plan, for export. */
	activePlan(): Plan {
		return $state.snapshot(this.plan) as Plan;
	}

	/** Returns all plans, for "Export all plans". */
	allPlans(): Plan[] {
		return this.plans.flatMap((summary) => {
			if (summary.id === this.plan.id) return [this.activePlan()];
			const result = this.recoverStored(this.storage.loadPlan(summary.id));
			return result.ok === true ? [result.value] : [];
		});
	}

	// -------------------------------------------------------------------------
	// Sync between browser tabs
	// -------------------------------------------------------------------------

	/** Handles a `storage` event from a different tab. The last write wins. */
	handleStorageEvent(event: Pick<StorageEvent, 'key' | 'newValue'>): void {
		if (event.key === KEYS.index) {
			const index = this.recoverStored(this.storage.loadIndex());
			if (index.ok !== true) return;
			const plans = index.value.planIds.flatMap((id) => {
				const r = this.recoverStored(this.storage.loadPlan(id));
				return r.ok === true ? [summaryOf(r.value)] : [];
			});
			if (plans.length > 0) this.plans = plans;
			// The other tab can delete the active plan. Then this tab changes to an available plan.
			if (!plans.some((p) => p.id === this.plan.id) && plans.length > 0) this.switchTo(plans[0].id);
			return;
		}
		if (event.key?.startsWith(KEYS.planPrefix)) {
			// Read the current value. A queued event can contain an older value.
			const result = this.recoverStored(
				this.storage.loadPlan(event.key.slice(KEYS.planPrefix.length))
			);
			if (result.ok !== true) return;
			if (event.key === KEYS.plan(this.plan.id)) {
				this.plan = result.value;
				this.history.clear();
			}
			this.plans = this.plans.map((p) => (p.id === result.value.id ? summaryOf(result.value) : p));
		}
	}
}

const CONTEXT = Symbol('workspace');

export function setWorkspace(workspace: Workspace): Workspace {
	return setContext(CONTEXT, workspace);
}

export function getWorkspace(): Workspace {
	return getContext<Workspace>(CONTEXT);
}
