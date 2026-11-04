/**
 * A bounded undo/redo history of snapshots.
 * The stacks are reactive, so `canUndo` and `canRedo` update the UI.
 * The stacks use `$state.raw`: snapshots are never changed, so deep proxies are not necessary.
 */
export class History<T> {
	private past = $state.raw<T[]>([]);
	private future = $state.raw<T[]>([]);

	constructor(private readonly limit = 50) {}

	/** Records the state from before a commit. */
	record(before: T): void {
		this.past = [...this.past, before].slice(-this.limit);
		this.future = [];
	}

	/** Returns the state to restore, or null. `current` goes to the redo stack. */
	undo(current: T): T | null {
		if (this.past.length === 0) return null;
		const previous = this.past[this.past.length - 1];
		this.past = this.past.slice(0, -1);
		this.future = [...this.future, current];
		return previous;
	}

	redo(current: T): T | null {
		if (this.future.length === 0) return null;
		const next = this.future[this.future.length - 1];
		this.future = this.future.slice(0, -1);
		this.past = [...this.past, current];
		return next;
	}

	/** Returns the newest step without a change. */
	peek(): T | null {
		return this.past.length > 0 ? this.past[this.past.length - 1] : null;
	}

	/** Removes and returns the newest step. Clears the redo stack. */
	drop(): T | null {
		if (this.past.length === 0) return null;
		const previous = this.past[this.past.length - 1];
		this.past = this.past.slice(0, -1);
		this.future = [];
		return previous;
	}

	clear(): void {
		this.past = [];
		this.future = [];
	}

	get canUndo(): boolean {
		return this.past.length > 0;
	}

	get canRedo(): boolean {
		return this.future.length > 0;
	}
}
