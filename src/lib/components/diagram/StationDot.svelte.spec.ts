import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import StationDot from './StationDot.svelte';

/** Rasterize the rendered SVG with its computed paint, including theme and opacity. */
async function paint(container: HTMLElement, underlay = false) {
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
	if (underlay) {
		const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		rect.setAttribute('width', '100%');
		rect.setAttribute('height', '100%');
		rect.setAttribute('fill', '#00ffff');
		copy.prepend(rect);
	}
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
		const whiteAt = (x: number) => {
			const i = (39 * 80 + x) * 4;
			return (
				pixels[i] === 255 && pixels[i + 1] === 255 && pixels[i + 2] === 255 && pixels[i + 3] === 255
			);
		};
		let left = 39,
			right = 39;
		while (left > 0 && whiteAt(left - 1)) left--;
		while (right < 79 && whiteAt(right + 1)) right++;
		return {
			interior: coverage(28, 52),
			holePixels: whiteAt(39) ? right - left + 1 : 0,
			whole: coverage(0, 80),
			center: Array.from(pixels.slice(center, center + 4)),
			left: Array.from(pixels.slice((39 * 80 + 25) * 4, (39 * 80 + 25) * 4 + 4)),
			right: Array.from(pixels.slice((39 * 80 + 55) * 4, (39 * 80 + 55) * 4 + 4)),
			edge: Array.from(pixels.slice((39 * 80 + 2) * 4, (39 * 80 + 2) * 4 + 4))
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

	it('uses the declared physical outer diameter and a 1 px inset, including a paper dot taller than its line [AC2,AC9]', async () => {
		const screen = await render(StationDot, {
			color: '#e02020',
			status: 'todo',
			size: 8,
			still: true
		});
		const svg = screen.container.querySelector('svg')!;
		expect(svg.getBoundingClientRect().width).toBe(8);
		// At 80 px raster width the first opaque red pixel must reach the declared outer edge.
		expect((await paint(screen.container)).edge[3]).toBeGreaterThan(200);
		const circles = [...svg.querySelectorAll('circle')];
		const scale = 8 / svg.viewBox.baseVal.width;
		const outer = Math.max(
			...circles.map(
				(circle) =>
					(2 * circle.r.baseVal.value +
						(getComputedStyle(circle).stroke === 'none'
							? 0
							: parseFloat(getComputedStyle(circle).strokeWidth))) *
					scale
			)
		);
		expect(outer).toBeCloseTo(8, 2);
		expect(((await paint(screen.container)).holePixels * 8) / 80).toBeCloseTo(6, 0);
		await screen.rerender({ size: 6 });
		expect(svg.getBoundingClientRect().height).toBe(6);
		expect(((await paint(screen.container)).holePixels * 6) / 80).toBeCloseTo(4, 0);
		expect((await paint(screen.container)).edge[3]).toBeGreaterThan(200);
	});

	it('draws canceled as a ground-filled ring and slash while done stays solid on screen and paper', async () => {
		const screen = await render(StationDot, {
			color: '#e02020',
			status: 'done',
			size: 8,
			still: true
		});
		for (const still of [false, true]) {
			await screen.rerender({ status: 'done', still });
			await expect
				.poll(() => screen.container.querySelector('svg')!.getAnimations().length)
				.toBe(0);
			const done = await paint(screen.container);
			expect(done.left).toEqual([224, 32, 32, 255]);
			expect(done.right).toEqual(done.left);
			await screen.rerender({ status: 'canceled' });
			await expect
				.poll(() => screen.container.querySelector('svg')!.getAnimations().length)
				.toBe(0);
			const canceled = await paint(screen.container);
			expect(canceled.left).toEqual([255, 255, 255, 255]);
			expect(canceled.right).toEqual(canceled.left);
			expect(canceled.center).not.toEqual(canceled.left);
			expect(canceled.interior).toBeLessThan(done.interior);
			expect(canceled.whole).toBeGreaterThan(0.1);
			for (const node of screen.container.querySelectorAll('svg, svg *'))
				expect(Number(getComputedStyle(node).opacity)).toBe(1);
		}
	});

	it('keeps canceled and done forms distinct with grayscale paper ink', async () => {
		const screen = await render(StationDot, {
			color: '#555555',
			status: 'canceled',
			still: true,
			size: 8
		});
		const canceled = await paint(screen.container);
		expect(canceled.left).toEqual([255, 255, 255, 255]);
		expect(canceled.right).toEqual(canceled.left);
		expect(canceled.center).toEqual([85, 85, 85, 255]);
		await screen.rerender({ status: 'done' });
		const done = await paint(screen.container);
		expect(done.left).toEqual([85, 85, 85, 255]);
		expect(done.right).toEqual(done.left);
	});

	it('keeps the ring and half-fill opaque over contrasting connectors in both grounds [AC4]', async () => {
		const screen = await render(StationDot, { color: '#e02020', status: 'todo', size: 8 });
		for (const ground of ['#ffffff', '#13161a']) {
			screen.container.style.setProperty('--background', ground);
			for (const status of ['todo', 'in_progress', 'done', 'canceled'] as const) {
				await screen.rerender({ status });
				const plain = await paint(screen.container);
				const crossing = await paint(screen.container, true);
				expect(crossing.center).toEqual(plain.center);
				expect(crossing.left).toEqual(plain.left);
				expect(crossing.right).toEqual(plain.right);
				// The outer station ring must cover the underlying connector too.
				expect(crossing.edge).toEqual(plain.edge);
				if (status === 'todo') expect(plain.interior).toBeLessThan(0.02);
				if (status === 'in_progress')
					expect(plain.right[0] - plain.right[1]).toBeGreaterThan(plain.left[0] - plain.left[1]);
			}
		}
	});
});
