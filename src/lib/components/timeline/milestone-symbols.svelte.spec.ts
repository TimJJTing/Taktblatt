import '../../../routes/layout.css';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { MILESTONE_SYMBOLS } from './milestone-symbols.ts';

describe('milestone display forms', () => {
	it('draws the stored diamond as a 14 px open ring with a 2.5 px ink outline', async () => {
		const screen = await render(MILESTONE_SYMBOLS.diamond, {
			class: 'size-3.5 fill-current',
			'aria-hidden': 'true'
		});
		const svg = screen.container.querySelector('svg')!;
		const circle = svg.querySelector('circle');
		expect(circle, 'Default must replace the filled diamond').not.toBeNull();
		const style = getComputedStyle(circle!);
		const scale =
			svg.viewBox.baseVal.width > 0
				? svg.getBoundingClientRect().width / svg.viewBox.baseVal.width
				: 1;
		const stroke = parseFloat(style.strokeWidth) * scale;
		expect(circle!.r.baseVal.value * scale * 2 + stroke).toBeCloseTo(14, 1);
		expect(stroke).toBeCloseTo(2.5, 1);
		expect(style.stroke).not.toBe('none');
		// The caller's legacy fill-current class must not close the ring hole.
		expect(style.fill).toBe('none');
		expect(svg.getAttribute('aria-hidden')).toBe('true');
	});

	it('keeps Circle solid and the map pin hole when Default becomes a ring', async () => {
		const circle = await render(MILESTONE_SYMBOLS.circle, {
			class: 'size-3.5 fill-current',
			'aria-hidden': 'true'
		});
		const disk = circle.container.querySelector('circle')!;
		expect(getComputedStyle(disk).fill).not.toBe('none');
		const pin = await render(MILESTONE_SYMBOLS.pin, { class: 'size-3.5 fill-current' });
		const svg = pin.container.querySelector('svg')!;
		const isPainted = (x: number, y: number) => {
			const point = new DOMPoint(x, y);
			return Array.from(svg.querySelectorAll('*')).some((element) => {
				if (!(element instanceof SVGGeometryElement)) return false;
				const style = getComputedStyle(element);
				return (
					(style.fill !== 'none' && element.isPointInFill(point)) ||
					(style.stroke !== 'none' && element.isPointInStroke(point))
				);
			});
		};
		expect(isPainted(12, 10), 'The center of the pin stays open').toBe(false);
		expect(isPainted(6, 10), 'The ring around the open center stays painted').toBe(true);
	});
});
