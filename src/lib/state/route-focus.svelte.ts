import { SvelteMap } from 'svelte/reactivity';
import type { TaskIndex } from '#lib/domain/derive.ts';

export const HOVER_COLD_MS = 300;
export const HOVER_WARM_MS = 80;
export const HOVER_GRACE_MS = 250;

type Cause = 'keyboard' | 'pointer';
interface Candidate {
	id: string;
	token: string;
	sequence: number;
}
interface FocusCandidate extends Candidate {
	cause: Cause;
	/** Keyboard input changes the cause only when focus leaves this target. */
	navigationFrom?: EventTarget | null;
}
interface RowFocusOwner {
	id: string;
	token: string;
	cause?: Cause;
}

/** Transient input and ownership for the visual dependency route. */
export class RouteFocusState {
	lastPointerType: string | null = null;
	#hover = $state.raw<Candidate | null>(null);
	#touch = $state.raw<Candidate | null>(null);
	#focus = $state.raw<FocusCandidate | null>(null);
	#validIds = $state.raw<ReadonlyMap<string, unknown> | null>(null);
	#pending: Candidate | null = null;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#graceTimer: ReturnType<typeof setTimeout> | undefined;
	#blurTimer: ReturnType<typeof setTimeout> | undefined;
	#sequence = 0;
	#planId: string | undefined;
	#floating = new SvelteMap<
		HTMLElement,
		{ owner: RowFocusOwner; trigger: HTMLElement; open: boolean; connected: boolean }
	>();
	#rowTokens = new WeakMap<Element, string>();
	#nextRowToken = 0;
	#returnOwner: RowFocusOwner | null = null;

	constructor(private readonly detailsTask = (): string | null => null) {}

	resolve(detailsTaskId: string | null = this.detailsTask()): string | null {
		if (detailsTaskId !== null && (!this.#validIds || this.#validIds.has(detailsTaskId))) {
			return detailsTaskId;
		}
		if (this.#focus?.cause === 'keyboard') return this.#focus.id;
		// Active hover takes priority over pointer row focus, but touch can be newer.
		const pointer = this.#hover ?? this.#focus;
		return this.#touch && (!pointer || this.#touch.sequence > pointer.sequence)
			? this.#touch.id
			: (pointer?.id ?? null);
	}

	#cancelIntent() {
		clearTimeout(this.#timer);
		this.#timer = undefined;
		this.#pending = null;
	}

	#cancelGrace(): void {
		clearTimeout(this.#graceTimer);
		this.#graceTimer = undefined;
	}

	#armIntent(pending: Candidate, duration: number): void {
		this.#cancelIntent();
		this.#pending = pending;
		this.#timer = setTimeout(() => {
			if (this.#pending !== pending) return;
			if (this.detailsTask() !== null) {
				this.clearPointer();
				return;
			}
			this.#cancelGrace();
			this.#hover = { ...pending, sequence: ++this.#sequence };
			this.#pending = null;
			this.#timer = undefined;
		}, duration);
	}

	hoverEnter(id: string, token: string, pointerType = 'mouse'): void {
		if (pointerType === 'touch') return;
		if (this.detailsTask() !== null) {
			this.clearPointer();
			return;
		}
		if (this.#hover?.token === token && this.#hover.id === id) {
			this.#cancelIntent();
			this.#cancelGrace();
			return;
		}
		const shown =
			this.#hover !== null &&
			this.#focus?.cause !== 'keyboard' &&
			(!this.#touch || this.#touch.sequence <= this.#hover.sequence);
		this.#armIntent({ id, token, sequence: 0 }, shown ? HOVER_WARM_MS : HOVER_COLD_MS);
	}

	hoverLeave(token: string, pointerType = 'mouse'): void {
		if (pointerType === 'touch') return;
		if (this.#pending?.token === token) this.#cancelIntent();
		if (this.#hover?.token !== token || this.#graceTimer !== undefined) return;
		this.#graceTimer = setTimeout(() => {
			this.#graceTimer = undefined;
			this.#hover = null;
			// A waiting target starts a full cold rest when the shown route expires.
			if (this.#pending) this.#armIntent(this.#pending, HOVER_COLD_MS);
		}, HOVER_GRACE_MS);
	}

	focusEnter(id: string, token: string, cause: Cause): void {
		this.#cancelIntent();
		this.#focus = { id, token, cause, sequence: ++this.#sequence };
	}

	pointerInput(pointerType: string): void {
		this.lastPointerType = pointerType;
		this.#returnOwner = null;
		this.#pruneContent();
		if (this.#focus?.navigationFrom != null) this.#focus = { ...this.#focus, navigationFrom: null };
	}

	/** Record navigation on the focus candidate. Esc does not change its cause. */
	keyboardInput(key: string, target: EventTarget | null): void {
		if (key !== 'Escape') this.#returnOwner = null;
		if (!this.#focus) return;
		const navigation =
			/^(Tab|Arrow(Left|Right|Up|Down)|Home|End|PageUp|PageDown)$/.test(key) ||
			(key.length === 1 && key !== ' ');
		const navigationFrom = navigation ? target : null;
		if (this.#focus.navigationFrom !== navigationFrom)
			this.#focus = { ...this.#focus, navigationFrom };
	}

	focusLeave(token: string): void {
		if (this.#focus?.token === token) this.#focus = null;
	}

	toggleTouch(id: string, token: string): void {
		if (this.detailsTask() !== null) {
			this.clearPointer();
			return;
		}
		this.#cancelIntent();
		this.#touch = this.#touch?.token === token ? null : { id, token, sequence: ++this.#sequence };
	}

	clearPointer(): void {
		this.#cancelIntent();
		this.#cancelGrace();
		this.#hover = null;
		this.#touch = null;
	}

	/** Track controlled content for all row controls without app-component registration. */
	observeFloating(): () => void {
		const sync = () => {
			for (const trigger of document.querySelectorAll<HTMLElement>('[aria-controls]')) {
				for (const id of trigger.getAttribute('aria-controls')!.split(/\s+/)) {
					const root = document.getElementById(id);
					if (root) this.rowOwner(root);
				}
			}
			let closing: HTMLElement | null = null;
			for (const [root, content] of this.#floating) {
				const { owner, trigger } = content;
				const open =
					root.isConnected &&
					!!trigger.getAttribute('aria-controls')?.split(/\s+/).includes(root.id);
				if (content.open === open && content.connected === root.isConnected) continue;
				content.open = open;
				content.connected = root.isConnected;
				if (!open && this.#focus?.token === owner.token) {
					this.#returnOwner = { ...owner, cause: this.#focus.cause };
					closing = root;
				}
			}
			if (closing) this.focusOut(closing, null);
			else this.#pruneContent();
		};
		const observer = new MutationObserver(sync);
		observer.observe(document, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['aria-controls']
		});
		sync();
		return () => {
			observer.disconnect();
			this.#cancelBlur();
			this.#floating.clear();
		};
	}

	#pruneContent(): void {
		for (const root of this.#floating.keys()) {
			if (!root.isConnected) this.#floating.delete(root);
		}
	}

	#contentAt(target: EventTarget | null): HTMLElement | null {
		if (!(target instanceof Node)) return null;
		let match: HTMLElement | null = null;
		for (const root of this.#floating.keys()) {
			if (root.contains(target) && (!match || match.contains(root))) match = root;
		}
		return match;
	}

	/** Resolve controlled content through its trigger, also across nested portals. */
	rowOwner(target: EventTarget | null, visited: readonly Element[] = []): RowFocusOwner | null {
		if (!(target instanceof Element) || visited.includes(target)) return null;
		const row = target.closest<HTMLTableRowElement>('tr[data-task-id]');
		if (row?.dataset.taskId) {
			let token = this.#rowTokens.get(row);
			if (!token) {
				token = `row-${++this.#nextRowToken}`;
				this.#rowTokens.set(row, token);
			}
			return { id: row.dataset.taskId, token };
		}
		for (let root: Element | null = target; root; root = root.parentElement) {
			if (!(root instanceof HTMLElement) || !root.id) continue;
			const known = this.#floating.get(root);
			if (known) return known.owner;
			for (const trigger of document.querySelectorAll<HTMLElement>('[aria-controls]')) {
				if (!trigger.getAttribute('aria-controls')?.split(/\s+/).includes(root.id)) continue;
				const owner = this.rowOwner(trigger, [...visited, target]);
				if (!owner) continue;
				const owned = {
					...owner,
					cause:
						this.#focus?.token === owner.token
							? this.#focus.cause
							: this.lastPointerType === null
								? ('keyboard' as const)
								: ('pointer' as const)
				};
				this.#floating.set(root, {
					owner: owned,
					trigger,
					open: true,
					connected: root.isConnected
				});
				return owned;
			}
		}
		return null;
	}

	#cancelBlur(): void {
		clearTimeout(this.#blurTimer);
		this.#blurTimer = undefined;
	}

	/** Let portal transfers settle before resolving a blur without a next target. */
	focusOut(target: EventTarget | null, relatedTarget: EventTarget | null): void {
		if (relatedTarget !== null) {
			this.resolveFocus(relatedTarget, false, target);
			return;
		}
		this.#cancelBlur();
		this.#blurTimer = setTimeout(() => {
			this.#blurTimer = undefined;
			const root = this.#contentAt(target);
			const content = root && this.#floating.get(root);
			if (
				content &&
				!content.trigger.getAttribute('aria-controls')?.split(/\s+/).includes(root.id)
			) {
				this.#returnOwner = { ...content.owner, cause: this.#focus?.cause ?? content.owner.cause };
			}
			this.resolveFocus(document.activeElement, true, target);
			this.#pruneContent();
		}, 0);
	}

	/** Portal transfers keep their owner's input cause. New row input records a new cause. */
	resolveFocus(
		target: EventTarget | null,
		preserveCause = false,
		previous: EventTarget | null = null
	): void {
		this.#cancelBlur();
		const owner = this.rowOwner(target);
		if (owner) {
			const targetContent = this.#contentAt(target);
			const portalTransfer = targetContent !== null && targetContent !== this.#contentAt(previous);
			const current = this.#focus?.token === owner.token ? this.#focus : null;
			const navigationTransfer =
				current?.navigationFrom != null && current.navigationFrom !== target;
			const keepCause =
				preserveCause ||
				portalTransfer ||
				this.#returnOwner?.token === owner.token ||
				(current !== null && this.lastPointerType === null);
			const cause = navigationTransfer
				? 'keyboard'
				: keepCause
					? (current?.cause ??
						(this.#returnOwner?.token === owner.token ? this.#returnOwner.cause : owner.cause) ??
						(this.lastPointerType === null ? 'keyboard' : 'pointer'))
					: this.lastPointerType === null
						? 'keyboard'
						: 'pointer';
			// Close reconciliation must not cancel fresh hover when focus has already returned.
			if (preserveCause && current?.cause === cause) return;
			// A repeated focus report is not another navigation step.
			const navigationFrom = current?.navigationFrom === target ? target : null;
			this.focusEnter(owner.id, owner.token, cause);
			if (navigationFrom !== null) this.#focus = { ...this.#focus!, navigationFrom };
			this.#returnOwner = null;
		} else if (
			!(target instanceof Element) ||
			!target.matches(
				'[data-testid="gantt-bar"]:focus-visible, [data-testid="gantt-point"]:focus-visible, [data-testid="gantt-label"]:focus-visible, [data-testid="gantt-toggle"]:focus-visible'
			)
		) {
			this.#focus = null;
		}
	}

	reconcile(index: TaskIndex, rowIds: ReadonlySet<string>): void {
		this.#validIds = index.byId;
		const valid = (candidate: Candidate) =>
			index.byId.has(candidate.id) && rowIds.has(candidate.id);
		if (this.#pending && !valid(this.#pending)) this.#cancelIntent();
		if (this.#hover && !valid(this.#hover)) {
			this.#hover = null;
			this.#cancelGrace();
			if (this.#pending) this.#armIntent(this.#pending, HOVER_COLD_MS);
		}
		if (this.#touch && !valid(this.#touch)) this.#touch = null;
		if (this.#focus && !valid(this.#focus)) this.#focus = null;
		if (this.#returnOwner && !valid({ ...this.#returnOwner, sequence: 0 }))
			this.#returnOwner = null;
		for (const [root, { owner }] of this.#floating) {
			if (!root.isConnected || !valid({ ...owner, sequence: 0 })) this.#floating.delete(root);
		}
	}

	reset(planId: string): void {
		if (this.#planId === planId) return;
		this.dispose();
		this.#planId = planId;
	}

	dispose(): void {
		this.clearPointer();
		this.#cancelBlur();
		this.#focus = null;
		this.#validIds = null;
		this.#floating.clear();
		this.#returnOwner = null;
		this.lastPointerType = null;
	}
}
