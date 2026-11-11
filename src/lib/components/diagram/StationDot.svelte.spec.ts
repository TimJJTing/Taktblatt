import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import StationDot from './StationDot.svelte';

/** Rasterize the rendered SVG with its computed paint, including theme and opacity. */
async function paint(container: HTMLElement) {
	const svg = container.querySelector('svg');
	expect(svg).not.toBeNull();
	const copy = svg!.cloneNode(true) as SVGSVGElement;
	const originals = [svg!, ...svg!.querySelectorAll('*')];
	const clones = [copy, ...copy.querySelectorAll('*')];
	const properties = [
		'fill',
		'fill-opacity',
		'stroke',
		'stroke-width',
		'stroke-opacity',
		'opacity',
		'color'
	];
	for (const [i, original] of originals.entries()) {
		const style = getComputedStyle(original);
		for (const property of properties) {
			(clones[i] as SVGElement).style.setProperty(property, style.getPropertyValue(property));
		}
	}
	let opacity = Number(getComputedStyle(svg!).opacity);
	for (let parent = svg!.parentElement; parent; parent = parent.parentElement) {
		opacity *= Number(getComputedStyle(parent).opacity);
	}
	copy.style.opacity = String(opacity);
	copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
	copy.setAttribute('width', '80');
	copy.setAttribute('height', '80');
	const url = URL.createObjectURL(
		new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' })
	);
	try {
		const image = new Image();
		image.src = url;
		await image.decode();
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 80;
		const context = canvas.getContext('2d')!;
		context.drawImage(image, 0, 0);
		const pixels = context.getImageData(0, 0, 80, 80).data;
		// Measure red paint. Neutral ground and transparent areas contribute zero.
		function coverage(start: number, end: number) {
			let sum = 0;
			for (let y = start; y < end; y++) {
				for (let x = start; x < end; x++) {
					const i = (y * 80 + x) * 4;
					sum += (Math.max(0, pixels[i] - pixels[i + 1]) / 255) * (pixels[i + 3] / 255);
				}
			}
			return sum / (end - start) ** 2;
		}
		const center = (39 * 80 + 39) * 4;
		return {
			interior: coverage(28, 52),
			whole: coverage(0, 80),
			center: Array.from(pixels.slice(center, center + 4))
		};
	} finally {
		URL.revokeObjectURL(url);
	}
}

describe('StationDot status fill (D6)', () => {
	it('uses the screen ground inside a todo ring and white ground on paper', async () => {
		const screen = await render(StationDot, {
			color: '#e02020',
			status: 'todo'
		});
		screen.container.style.setProperty('--background', '#13161a');
		expect((await paint(screen.container)).center).toEqual([19, 22, 26, 255]);
		await screen.rerender({ still: true });
		expect((await paint(screen.container)).center).toEqual([255, 255, 255, 255]);
	});

	it('exposes a supplied text alternative and keeps paper output still', async () => {
		const screen = await render(StationDot, {
			color: '#e02020',
			status: 'in_progress',
			label: 'Task in progress',
			still: true
		});
		const dot = screen.getByRole('img', { name: 'Task in progress' });
		await expect.element(dot).toBeVisible();
		expect(dot.element().getAnimations({ subtree: true })).toHaveLength(0);
	});

	it('renders a ring, half fill, solid fill, and a solid fill at 40% opacity', async () => {
		const screen = await render(StationDot, {
			color: '#e02020',
			status: 'todo',
			still: true,
			size: 40
		});
		const todo = await paint(screen.container);
		await screen.rerender({ status: 'in_progress' });
		const progress = await paint(screen.container);
		await screen.rerender({ status: 'done' });
		const done = await paint(screen.container);
		await screen.rerender({ status: 'canceled' });
		const canceled = await paint(screen.container);

		expect(todo.whole).toBeGreaterThan(0.01);
		expect(todo.interior).toBeLessThan(0.02);
		expect(done.interior).toBeGreaterThan(0.5);
		expect(progress.interior / done.interior).toBeCloseTo(0.5, 1);
		expect(canceled.interior / done.interior).toBeCloseTo(0.4, 1);
		expect(canceled.whole / done.whole).toBeCloseTo(0.4, 1);
	});
});
