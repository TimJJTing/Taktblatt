/**
 * localStorage access. All keys of the app are in this file.
 * Refer to docs/spec.md, section 4.2.
 */
import * as v from 'valibot';
import { createId } from '#lib/domain/ids.js';
import { migrate } from '#lib/domain/migrate.js';
import { PlanSchema, SCHEMA_VERSION, type Plan } from '#lib/domain/schema.js';

export const KEYS = {
	index: 'taktblatt:index',
	plan: (id: string) => `taktblatt:plan:${id}`,
	planPrefix: 'taktblatt:plan:',
	viewer: 'taktblatt:ui',
	damaged: (stamp: string) => `taktblatt:damaged:${stamp}`
} as const;

export interface StoredIndex {
	planIds: string[];
	activeId: string | null;
}

const IndexSchema = v.object({ planIds: v.array(v.string()), activeId: v.nullable(v.string()) });

export type LoadResult<T> = { ok: true; value: T } | { ok: false; raw: string } | { ok: 'missing' };

/** The browser could not save the data. An import throws it after it undid its own writes. */
export class StorageWriteError extends Error {
	constructor(cause: unknown) {
		super('The browser could not save the data.', { cause });
		this.name = 'StorageWriteError';
	}
}

export class PlanStorage {
	constructor(private readonly storage: Storage) {}

	loadIndex(): LoadResult<StoredIndex> {
		const raw = this.storage.getItem(KEYS.index);
		if (raw === null) return { ok: 'missing' };
		try {
			return { ok: true, value: v.parse(IndexSchema, JSON.parse(raw)) };
		} catch {
			return { ok: false, raw };
		}
	}

	saveIndex(index: StoredIndex): void {
		this.storage.setItem(KEYS.index, JSON.stringify(index));
	}

	loadPlan(id: string): LoadResult<Plan> {
		const raw = this.storage.getItem(KEYS.plan(id));
		if (raw === null) return { ok: 'missing' };
		return parsePlan(raw);
	}

	savePlan(plan: Plan): void {
		this.storage.setItem(
			KEYS.plan(plan.id),
			JSON.stringify({ schemaVersion: SCHEMA_VERSION, plan })
		);
	}

	/** Returns the stored text of a plan. Use it with `restoreRawPlan` to undo a write. */
	rawPlan(id: string): string | null {
		return this.storage.getItem(KEYS.plan(id));
	}

	/** Puts back stored text from `rawPlan`. The value null removes the plan. */
	restoreRawPlan(id: string, raw: string | null): void {
		if (raw === null) this.storage.removeItem(KEYS.plan(id));
		else this.storage.setItem(KEYS.plan(id), raw);
	}

	rawIndex(): string | null {
		return this.storage.getItem(KEYS.index);
	}

	restoreRawIndex(raw: string | null): void {
		if (raw === null) this.storage.removeItem(KEYS.index);
		else this.storage.setItem(KEYS.index, raw);
	}

	removePlan(id: string): void {
		this.storage.removeItem(KEYS.plan(id));
	}

	/** Keeps damaged data under a backup key. Returns the key. */
	keepDamaged(raw: string, now: Date = new Date()): string {
		const prefix = KEYS.damaged(now.toISOString());
		let key = `${prefix}:${createId()}`;
		while (this.storage.getItem(key) !== null) key = `${prefix}:${createId()}`;
		this.storage.setItem(key, raw);
		return key;
	}

	/** Returns the ids of all plans in storage, also those that are not in the index. */
	storedPlanIds(): string[] {
		const ids: string[] = [];
		for (let i = 0; i < this.storage.length; i += 1) {
			const key = this.storage.key(i);
			if (key?.startsWith(KEYS.planPrefix)) ids.push(key.slice(KEYS.planPrefix.length));
		}
		return ids;
	}
}

/** Parses the stored text of one plan. Migrates old schema versions. */
export function parsePlan(raw: string): LoadResult<Plan> {
	try {
		const migrated = migrate(JSON.parse(raw)) as { plan?: unknown };
		return { ok: true, value: v.parse(PlanSchema, migrated.plan) };
	} catch {
		return { ok: false, raw };
	}
}
