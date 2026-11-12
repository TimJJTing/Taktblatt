/* eslint-disable svelte/prefer-svelte-reactivity -- DOM registries use explicit reconciliation. Refer to ADR 19. */
import { untrack } from 'svelte';
import type { Workspace } from './workspace.svelte.ts';
import type { TaskIndex } from '#lib/domain/derive.ts';

export const HOVER_COLD_MS = 300;
export const HOVER_WARM_MS = 120;
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
	#lastPointerType: string | null = null;
	get lastPointerType(): string | null {
		return this.#lastPointerType;
	}
	#hover = $state.raw<Candidate | null>(null);
	#touch = $state.raw<Candidate | null>(null);
	#focus = $state.raw<FocusCandidate | null>(null);
	#validIds = $state.raw<ReadonlyMap<string, unknown> | null>(null);
	#pending: Candidate | null = null;
	// An entry can arrive before the previous target's leave.
	#hoverTargets = new Map<string, string>();
	#timer: ReturnType<typeof setTimeout> | undefined;
	#graceTimer: ReturnType<typeof setTimeout> | undefined;
	#blurTimer: ReturnType<typeof setTimeout> | undefined;
	#sequence = 0;
	#planId: string | undefined;
	#floating = new Map<HTMLElement, { owner: RowFocusOwner; trigger: HTMLElement }>();
	#targetTokens = new WeakMap<Element, string>();
	#nextTargetToken = 0;
	#targets = new Map<HTMLElement, { id: string; token: string; view?: symbol }>();
	#views = new Map<symbol, () => ReadonlySet<string>>();
	#viewIds = new Map<symbol, ReadonlySet<string>>();
	#targetVersion = $state(0);
	#returnOwner: RowFocusOwner | null = null;

	constructor(private readonly detailsTask = (): string | null => null) {}

	attach(workspace: Workspace): () => void {
		const stopReconcile = $effect.root(() => {
			$effect(() => {
				const planId = workspace.plan.id;
				const index = workspace.index;
				void this.#targetVersion;
				const viewIds = new Map([...this.#views].map(([view, ids]) => [view, ids()]));
				untrack(() => {
					this.reset(planId);
					this.#viewIds = viewIds;
					const ids = new Set<string>();
					for (const [element, { id, token }] of this.#targets) {
						if (this.#targetActive(element)) ids.add(id);
						else this.#removeTarget(token);
					}
					this.reconcile(index, ids);
				});
			});
		});
		const pointerDown = (event: PointerEvent) => this.pointerInput(event.pointerType);
		const keyDown = (event: KeyboardEvent) => this.keyboardInput(event.key, event.target);
		const click = (event: MouseEvent) => {
			if (this.lastPointerType !== 'touch') return;
			if (!(event.target instanceof Element) || !event.target.closest('[data-route-touch]'))
				this.clearPointer();
		};
		const focusIn = (event: FocusEvent) =>
			this.resolveFocus(event.target, false, event.relatedTarget);
		const focusOut = (event: FocusEvent) => this.focusOut(event.target, event.relatedTarget);
		document.addEventListener('pointerdown', pointerDown, true);
		document.addEventListener('keydown', keyDown, true);
		document.addEventListener('click', click);
		document.addEventListener('focusin', focusIn);
		document.addEventListener('focusout', focusOut);
		const stopFloating = this.observeFloating();
		return () => {
			stopReconcile();
			document.removeEventListener('pointerdown', pointerDown, true);
			document.removeEventListener('keydown', keyDown, true);
			document.removeEventListener('click', click);
			document.removeEventListener('focusin', focusIn);
			document.removeEventListener('focusout', focusOut);
			stopFloating();
			this.dispose();
		};
	}

	tokenFor(element: Element): string {
		let token = this.#targetTokens.get(element);
		if (!token) {
			token = `target-${++this.#nextTargetToken}`;
			this.#targetTokens.set(element, token);
		}
		return token;
	}

	/** Register intended ids before outgoing DOM finishes its transition. */
	view(ids: () => ReadonlySet<string>) {
		const view = Symbol();
		return {
			target: (element: HTMLElement, id: string) => this.#registerTarget(element, id, view),
			register: () => {
				this.#views.set(view, ids);
				this.#targetVersion++;
				return () => {
					this.#views.delete(view);
					this.#viewIds.delete(view);
					for (const target of this.#targets.values()) {
						if (target.view === view) this.#removeTarget(target.token);
					}
					this.#targetVersion++;
				};
			}
		};
	}

	readonly target = (element: HTMLElement, id: string) => this.#registerTarget(element, id);

	/** Register only this view's target. Other views can show the same task. */
	#registerTarget(element: HTMLElement, id: string, view?: symbol) {
		const token = this.tokenFor(element);
		this.#targets.set(element, { id, token, view });
		this.#targetVersion++;
		return {
			update: (nextId: string) => {
				if (id === nextId) return;
				this.#removeTarget(token);
				id = nextId;
				this.#targets.set(element, { id, token, view });
				this.#targetVersion++;
			},
			destroy: () => {
				this.#targets.delete(element);
				this.#removeTarget(token);
				this.#targetVersion++;
			}
		};
	}

	#targetActive(element: HTMLElement): boolean {
		const target = this.#targets.get(element);
		return target?.view === undefined || this.#viewIds.get(target.view)?.has(target.id) === true;
	}

	#tokenActive(token: string): boolean {
		for (const [element, target] of this.#targets) {
			if (target.token === token) return this.#targetActive(element);
		}
		return true;
	}

	#removeTarget(token: string): void {
		const hovered = this.#hoverTargets.delete(token);
		if (
			hovered ||
			this.#pending?.token === token ||
			this.#hover?.token === token ||
			this.#touch?.token === token ||
			this.#focus?.token === token
		) {
			this.#cancelIntent();
			this.#cancelGrace();
		}
		if (this.#hover?.token === token) this.#hover = null;
		this.#leaveIfOutsideTargets();
		if (this.#touch?.token === token) this.#touch = null;
		if (this.#focus?.token === token) this.#focus = null;
		if (this.#returnOwner?.token === token) this.#returnOwner = null;
		for (const [root, { owner }] of this.#floating) {
			if (owner.token === token) this.#floating.delete(root);
		}
	}

	resolve(): string | null {
		const detailsTaskId = this.detailsTask();
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
		if (!this.#tokenActive(token)) return;
		if (pointerType === 'touch') return;
		if (this.detailsTask() !== null) {
			this.clearPointer();
			return;
		}
		this.#hoverTargets.set(token, id);
		this.#cancelGrace();
		if (this.#hover?.token === token && this.#hover.id === id) {
			this.#cancelIntent();
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
		this.#hoverTargets.delete(token);
		if (this.#pending?.token === token) this.#cancelIntent();
		this.#leaveIfOutsideTargets();
	}

	#leaveIfOutsideTargets(): void {
		if (!this.#hover || this.#hoverTargets.size > 0 || this.#graceTimer !== undefined) return;
		this.#graceTimer = setTimeout(() => {
			this.#graceTimer = undefined;
			this.#hover = null;
		}, HOVER_GRACE_MS);
	}

	focusEnter(id: string, token: string, cause: Cause): void {
		if (!this.#tokenActive(token)) return;
		if (
			cause === 'pointer' &&
			this.#hover !== null &&
			this.#hover.token !== token &&
			this.#pending?.token === token &&
			this.#pending.id === id
		) {
			this.#hover = { ...this.#pending, sequence: ++this.#sequence };
			this.#cancelGrace();
		}
		this.#cancelIntent();
		this.#focus = { id, token, cause, sequence: ++this.#sequence };
	}

	pointerInput(pointerType: string): void {
		this.#lastPointerType = pointerType;
		this.#returnOwner = null;
		this.#pruneContent();
		if (this.#focus?.navigationFrom != null) this.#focus = { ...this.#focus, navigationFrom: null };
	}

	/** Record navigation on the focus candidate. Esc does not change its cause. */
	keyboardInput(key: string, target: EventTarget | null): void {
		this.#lastPointerType = null;
		if (key === 'Escape') this.clearPointer();
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
		if (!this.#tokenActive(token)) return;
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
		this.#hoverTargets.clear();
		this.#hover = null;
		this.#touch = null;
	}

	/** Discover trigger links only inside row owners and their controlled content. */
	#syncFloating(): void {
		const next = new Map<HTMLElement, { owner: RowFocusOwner; trigger: HTMLElement }>();
		const scopes: { root: HTMLElement; owner: RowFocusOwner }[] = [];
		for (const [root, { id, token }] of this.#targets) {
			if (root.isConnected && this.#targetActive(root) && root.dataset.routeFocus !== 'keyboard')
				scopes.push({ root, owner: { id, token } });
		}
		const scanned = new Set<HTMLElement>();
		const triggers = new Set<HTMLElement>();
		const rootsById = new Map<string, HTMLElement | null>();
		for (const { root: scope, owner } of scopes) {
			if (scanned.has(scope)) continue;
			scanned.add(scope);
			const controlled = [...scope.querySelectorAll<HTMLElement>('[aria-controls]')];
			if (scope.hasAttribute('aria-controls')) controlled.unshift(scope);
			for (const trigger of controlled) {
				if (triggers.has(trigger)) continue;
				triggers.add(trigger);
				if (!this.#triggerOpen(trigger)) continue;
				const triggerOwner = this.#directOwner(trigger) ?? owner;
				for (const id of trigger.getAttribute('aria-controls')!.split(/\s+/)) {
					if (!rootsById.has(id)) rootsById.set(id, document.getElementById(id));
					const root = rootsById.get(id);
					if (!root || next.has(root)) continue;
					const owned = {
						...triggerOwner,
						cause:
							this.#focus?.token === triggerOwner.token
								? this.#focus.cause
								: (triggerOwner.cause ??
									this.#floating.get(root)?.owner.cause ??
									(this.lastPointerType === null ? ('keyboard' as const) : ('pointer' as const)))
					};
					next.set(root, { owner: owned, trigger });
					scopes.push({ root, owner: owned });
				}
			}
		}
		let closing: HTMLElement | null = null;
		for (const [root, { owner }] of this.#floating) {
			if (!next.has(root) && this.#focus?.token === owner.token) {
				this.#returnOwner = { ...owner, cause: this.#focus.cause };
				closing = root;
			}
		}
		this.#floating = next;
		if (closing) this.focusOut(closing, null);
	}

	#triggerOpen(trigger: HTMLElement): boolean {
		return (
			trigger.isConnected &&
			trigger.getAttribute('aria-expanded') !== 'false' &&
			trigger.getAttribute('data-state') !== 'closed'
		);
	}

	observeFloating(): () => void {
		const observer = new MutationObserver(() => this.#syncFloating());
		observer.observe(document, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['aria-controls', 'aria-expanded', 'data-state']
		});
		this.#syncFloating();
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

	#directOwner(target: Element): RowFocusOwner | null {
		const owner = target.closest<HTMLElement>('[data-route-target]');
		return owner?.dataset.routeTarget &&
			this.#targetActive(owner) &&
			owner.dataset.routeFocus !== 'keyboard'
			? { id: owner.dataset.routeTarget, token: this.tokenFor(owner) }
			: null;
	}

	/** Resolve a neutral owner or the trigger owner of controlled content. */
	rowOwner(target: EventTarget | null): RowFocusOwner | null {
		if (!(target instanceof Element)) return null;
		const owner = this.#directOwner(target);
		if (owner) return owner;
		this.#syncFloating();
		const root = this.#contentAt(target);
		return root ? this.#floating.get(root)!.owner : null;
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
				(!this.#triggerOpen(content.trigger) ||
					!content.trigger.getAttribute('aria-controls')?.split(/\s+/).includes(root.id))
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
				(current !== null && this.#lastPointerType === null);
			const cause = navigationTransfer
				? 'keyboard'
				: keepCause
					? (current?.cause ??
						(this.#returnOwner?.token === owner.token ? this.#returnOwner.cause : owner.cause) ??
						(this.#lastPointerType === null ? 'keyboard' : 'pointer'))
					: this.#lastPointerType === null
						? 'keyboard'
						: 'pointer';
			// Close reconciliation must not cancel fresh hover when focus has already returned.
			if (preserveCause && current?.cause === cause) return;
			// A repeated focus report is not another navigation step.
			const navigationFrom = current?.navigationFrom === target ? target : null;
			this.focusEnter(owner.id, owner.token, cause);
			if (navigationFrom !== null) this.#focus = { ...this.#focus!, navigationFrom };
			this.#returnOwner = null;
		} else {
			const routeTarget =
				target instanceof Element
					? target.closest<HTMLElement>('[data-route-target][data-route-focus="keyboard"]')
					: null;
			if (
				routeTarget?.dataset.routeTarget &&
				this.#targetActive(routeTarget) &&
				target instanceof Element &&
				target.matches(':focus-visible')
			)
				this.focusEnter(routeTarget.dataset.routeTarget, this.tokenFor(routeTarget), 'keyboard');
			else this.#focus = null;
		}
	}

	reconcile(index: TaskIndex, targetIds: ReadonlySet<string>): void {
		this.#validIds = index.byId;
		const valid = (candidate: Candidate) =>
			index.byId.has(candidate.id) && targetIds.has(candidate.id);
		let removed = false;
		for (const [token, id] of this.#hoverTargets) {
			if (!index.byId.has(id) || !targetIds.has(id)) {
				this.#hoverTargets.delete(token);
				removed = true;
			}
		}
		if (
			removed ||
			[this.#pending, this.#hover, this.#touch, this.#focus].some(
				(candidate) => candidate !== null && !valid(candidate)
			)
		) {
			this.#cancelIntent();
			this.#cancelGrace();
		}
		if (this.#hover && !valid(this.#hover)) this.#hover = null;
		this.#leaveIfOutsideTargets();
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
		this.#lastPointerType = null;
	}
}
