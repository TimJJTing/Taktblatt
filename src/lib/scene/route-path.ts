import type { Pt } from './types.ts';

/** Resolve scene points and omit consecutive duplicates from the SVG path. */
export function routePath(points: readonly Pt[], extent: { w: number; h: number }): string {
	const commands: string[] = [];
	let previous: { x: number; y: number } | undefined;
	for (const point of points) {
		const x = point.x.f * extent.w + point.x.px;
		const y = point.y.f * extent.h + point.y.px;
		if (previous?.x === x && previous.y === y) continue;
		commands.push(`${previous ? 'L' : 'M'} ${x} ${y}`);
		previous = { x, y };
	}
	return commands.join(' ');
}
