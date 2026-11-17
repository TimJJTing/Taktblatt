import { Tween } from 'svelte/motion';
import { cubicOut } from 'svelte/easing';
import { GEOMETRY_MOTION_MS, motionDuration } from '#lib/motion.ts';

interface GeometryUpdate {
	width?: number;
	still?: boolean;
	snap?: boolean;
}

function equalGeometry(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	const left = a as Record<string, unknown>;
	const right = b as Record<string, unknown>;
	const keys = Object.keys(left);
	return (
		keys.length === Object.keys(right).length &&
		keys.every((key) => equalGeometry(left[key], right[key]))
	);
}

/** Tween immutable numeric geometry. Width changes and explicit snaps apply at once. */
export class GeometryTween<T> {
	#tween: Tween<T>;
	#target: T;
	#width: number | undefined;

	constructor(initial: T, width?: number) {
		this.#tween = new Tween(initial);
		this.#target = initial;
		this.#width = width;
	}

	get current(): T {
		return this.#tween.current;
	}

	set(target: T, { width = this.#width, still = false, snap = false }: GeometryUpdate = {}): void {
		const resized = width !== this.#width;
		this.#width = width;
		const duration = motionDuration(resized || still || snap ? 0 : GEOMETRY_MOTION_MS);
		if (!resized && duration !== 0 && equalGeometry(target, this.#target)) return;
		this.#target = target;
		void this.#tween.set(target, {
			duration,
			easing: cubicOut
		});
	}
}
