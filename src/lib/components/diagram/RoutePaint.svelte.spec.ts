import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RoutePaintTest from './RoutePaint.test.svelte';

function rgba(paint: string): number[] {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 1;
	const context = canvas.getContext('2d')!;
	context.fillStyle = paint;
	context.fillRect(0, 0, 1, 1);
	return [...context.getImageData(0, 0, 1, 1).data];
}
function painted(element: Element, property: string) {
	const style = getComputedStyle(element);
	return rgba(style.getPropertyValue(property).replaceAll('currentcolor', style.color));
}
function opaque(element: Element) {
	for (let node: Element | null = element; node; node = node.parentElement) {
		expect(getComputedStyle(node).opacity).toBe('1');
	}
}

describe('route paint', () => {
	it('paints off-route rings and taps once, lifts lit signs to ink and retains opaque ground holes', async () => {
		const screen = await render(RoutePaintTest);
		const rings = [
			...screen.container.querySelectorAll(
				'[data-testid="gantt-junction"], [data-testid="gantt-tap"]'
			)
		];
		const dim = rgba('color-mix(in oklab, #555555 30%, #ffffff)');
		for (const ring of rings) {
			expect(ring.getAttribute('data-route')).toBe('off');
			await expect.poll(() => painted(ring.querySelector('circle')!, 'stroke')).toEqual(dim);
			expect(painted(ring.querySelector('circle')!, 'fill')).toEqual([255, 255, 255, 255]);
			opaque(ring);
		}
		await screen.rerender({ route: 'lit' });
		for (const ring of rings) {
			await expect
				.poll(() => painted(ring.querySelector('circle')!, 'stroke'))
				.toEqual([17, 17, 17, 255]);
			expect(ring.getAttribute('aria-hidden')).toBe('true');
		}
	});

	it('ignores active route props in still signs and restores their normal status treatment', async () => {
		const screen = await render(RoutePaintTest, { status: 'done' });
		const line = screen.container.querySelector('[data-gantt-line]')!;
		await expect
			.poll(() => painted(line, 'background-color'))
			.toEqual(rgba('color-mix(in oklab, #cc0000 30%, #ffffff)'));
		await screen.rerender({ still: true, route: 'lit' });
		expect(painted(line, 'background-color')).toEqual(
			rgba('color-mix(in oklab, #cc0000 40%, #ffffff)')
		);
		expect(painted(screen.container.querySelector('.station-dot')!, 'color')).toEqual([
			204, 0, 0, 255
		]);
		expect(screen.container.querySelectorAll('[data-route]')).toHaveLength(0);
		expect(screen.container.querySelectorAll('[data-route-layer]')).toHaveLength(0);
		expect(screen.container.querySelectorAll('[data-testid^="sheet-gantt-"]')).toHaveLength(2);
	});
});
