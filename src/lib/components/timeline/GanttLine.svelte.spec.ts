import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { render } from 'vitest-browser-svelte';
import type { DependencyLine } from '#lib/domain/gantt.ts';
import type { EdgeGeom, Pt } from '#lib/scene/types.ts';
import GanttLineTest from './GanttLine.test.svelte';

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('#lib/motion.ts', async (original) => ({
	...(await original<typeof import('#lib/motion.ts')>()),
	motionDuration: (ms: number) => (motion.reduced ? 0 : ms)
}));

const pt = (x: number, y: number): Pt => ({ x: { f: x, px: 0 }, y: { f: 0, px: y } });
function line(shift = 0, cycle = false): DependencyLine & EdgeGeom {
	return {
		key: 'a->b',
		from: 'a',
		to: 'b',
		fromId: 'a',
		toId: 'b',
		cycle,
		trunk: 'a',
		x0: 0.2 + shift,
		x1: 0.7 + shift,
		row0: 0,
		row1: 4,
		points: [
			pt(0.2 + shift, 42),
			pt(0.22 + shift, 42),
			pt(0.22 + shift, 140),
			pt(0.65 + shift, 140),
			pt(0.68 + shift, 158),
			pt(0.7 + shift, 170)
		]
	};
}
const coords = (path: SVGPathElement) =>
	path
		.getAttribute('d')!
		.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!
		.map(Number);
const target = (l: EdgeGeom, width = 600) =>
	l.points.flatMap((p) => [p.x.f * width + p.x.px, p.y.px]);
function near(actual: number[], expected: number[]) {
	expect(actual).toHaveLength(expected.length);
	for (const [i, n] of actual.entries()) expect(n).toBeCloseTo(expected[i], 4);
}

describe('GanttLine geometry and cycle paint', () => {
	let time = 0;
	let nextId = 0;
	let pending = new Map<number, FrameRequestCallback>();
	function frame(at: number) {
		time = at;
		const batch = [...pending.values()];
		pending.clear();
		for (const fn of batch) fn(time);
		flushSync();
	}
	beforeEach(() => {
		time = 0;
		pending = new Map();
		motion.reduced = false;
		vi.spyOn(performance, 'now').mockImplementation(() => time);
		vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
			pending.set(++nextId, fn);
			return nextId;
		});
		vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id));
	});
	afterEach(() => {
		frame(time + 1000);
		frame(time + 1000);
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('renders all six scene points instead of rebuilding an elbow from endpoints', async () => {
		const l = line();
		const screen = await render(GanttLineTest, { line: l });
		near(coords(screen.container.querySelector('[data-testid="gantt-dependency"]')!), target(l));
	});

	it('uses 2 px top-level and 1.5 px sibling connector strokes', async () => {
		const screen = await render(GanttLineTest, { line: line(), strokeWidth: 2 });
		const path = screen.container.querySelector<SVGPathElement>(
			'[data-testid="gantt-dependency"]'
		)!;
		expect(getComputedStyle(path).strokeWidth).toBe('2px');
		await screen.rerender({ strokeWidth: 1.5 });
		expect(getComputedStyle(path).strokeWidth).toBe('1.5px');
	});

	it('moves every bend with cubicOut over 240 ms for a row and range change', async () => {
		const old = line();
		const next = line(0.1);
		next.row1 = 5;
		next.points = next.points.map((p, i) => ({ ...p, y: { f: 0, px: p.y.px + (i > 1 ? 28 : 0) } }));
		const screen = await render(GanttLineTest, { line: old });
		frame(300);
		const path = screen.container.querySelector<SVGPathElement>(
			'[data-testid="gantt-dependency"]'
		)!;
		await screen.rerender({ line: next });
		frame(300);
		frame(420);
		const a = target(old),
			b = target(next);
		near(
			coords(path),
			a.map((v, i) => v + (b[i] - v) * 0.875)
		);
		frame(540);
		near(coords(path), b);
	});

	it('retargets a fast second range change from the current six points without a jump', async () => {
		const screen = await render(GanttLineTest, { line: line() });
		frame(300);
		const path = screen.container.querySelector<SVGPathElement>(
			'[data-testid="gantt-dependency"]'
		)!;
		await screen.rerender({ line: line(0.1) });
		frame(300);
		frame(380);
		const halfway = coords(path);
		await screen.rerender({ line: line(-0.05) });
		frame(380);
		near(coords(path), halfway);
		frame(500);
		const b = target(line(-0.05));
		near(
			coords(path),
			halfway.map((v, i) => v + (b[i] - v) * 0.875)
		);
		frame(620);
		near(coords(path), b);
	});

	it('keeps the original tween deadline when status supplies an equal geometry object mid-flight', async () => {
		const screen = await render(GanttLineTest, { line: line() });
		frame(300);
		const path = screen.container.querySelector<SVGPathElement>(
			'[data-testid="gantt-dependency"]'
		)!;
		const next = line(0.1);
		await screen.rerender({ line: next });
		frame(300);
		frame(420);
		const moving = coords(path);
		await screen.rerender({ line: structuredClone(next), muted: true });
		frame(420);
		near(coords(path), moving);
		expect(screen.container.querySelector('[data-testid="gantt-dependency"]')).toBe(path);
		frame(540);
		near(coords(path), target(next));
	});

	it('applies new-width routes immediately during a running tween and cancels its stale target', async () => {
		const screen = await render(GanttLineTest, { line: line(), width: 600 });
		frame(300);
		await screen.rerender({ line: line(0.1) });
		frame(300);
		frame(380);
		const resized = line(0.1);
		resized.points[1].x = { f: 0.3, px: 6 };
		resized.points[2].x = { f: 0.3, px: 6 };
		await screen.rerender({ width: 400, line: resized });
		flushSync();
		const path = screen.container.querySelector<SVGPathElement>(
			'[data-testid="gantt-dependency"]'
		)!;
		near(coords(path), target(resized, 400));
		frame(700);
		near(coords(path), target(resized, 400));
	});

	it('makes row and range geometry immediate when motionDuration returns zero', async () => {
		motion.reduced = true;
		const screen = await render(GanttLineTest, { line: line() });
		await screen.rerender({ line: line(0.1) });
		flushSync();
		near(
			coords(screen.container.querySelector('[data-testid="gantt-dependency"]')!),
			target(line(0.1))
		);
	});

	it('keeps warning paint on the counted base and a matching hidden 4 px casing immediately below it', async () => {
		const screen = await render(GanttLineTest, { line: line(0, true), muted: true });
		const path = screen.container.querySelector<SVGPathElement>(
			'[data-testid="gantt-dependency"]'
		)!;
		const casing = path.previousElementSibling!;
		expect(path.getAttribute('data-cycle')).toBe('true');
		expect(getComputedStyle(path).strokeWidth).toBe('2px');
		expect(getComputedStyle(path).strokeDasharray.replaceAll(',', '')).toBe('1px 4px');
		expect(getComputedStyle(path).strokeLinecap).toBe('round');
		expect(casing?.getAttribute('data-overlay-for')).toBe('a->b');
		expect(casing.getAttribute('aria-hidden')).toBe('true');
		expect(casing.getAttribute('d')).toBe(path.getAttribute('d'));
		expect(getComputedStyle(casing).strokeWidth).toBe('4px');
		expect(casing.hasAttribute('data-testid')).toBe(false);
		expect(screen.container.querySelectorAll('[data-testid="gantt-dependency"]')).toHaveLength(1);
		await screen.rerender({ line: line(0.1, true) });
		frame(0);
		frame(120);
		expect(casing.getAttribute('d')).toBe(path.getAttribute('d'));
	});

	it('dims an off-route satisfied base once and preserves cycle warning attributes', async () => {
		const screen = await render(GanttLineTest, { line: line(), muted: true, route: 'off' });
		frame(300);
		const path = screen.container.querySelector<SVGPathElement>(
			'[data-testid="gantt-dependency"]'
		)!;
		expect(path.getAttribute('data-route')).toBe('off');
		expect(getComputedStyle(path).opacity).toBe('1');
		const probe = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.parentElement!.append(probe);
		probe.style.stroke = 'color-mix(in oklab, currentColor 30%, var(--background, #FFFFFF))';
		expect(getComputedStyle(path).stroke).toBe(getComputedStyle(probe).stroke);
		probe.remove();
		await screen.rerender({ line: line(0, true), route: 'off' });
		frame(600);
		await expect.poll(() => path.getAnimations().length).toBe(0);
		expect(path.hasAttribute('data-route')).toBe(false);
		expect(getComputedStyle(path).strokeDasharray.replaceAll(',', '')).toBe('1px 4px');
		const warning = getComputedStyle(path).stroke;
		await screen.rerender({ route: 'lit' });
		frame(900);
		expect(path.getAttribute('data-route')).toBe('lit');
		expect(getComputedStyle(path).stroke).toBe(warning);
		expect(screen.container.querySelectorAll('[data-route-layer="ink"]')).toHaveLength(0);
	});
});
