import '../../../routes/layout.css';
import { afterEach, describe, expect, it } from 'vitest';
import {
	applyTransition,
	captureGeometry,
	routersCompatible,
	scrollContainerOf,
	sourceBox,
	type Box,
	type TaskGeometry
} from './diagram-motion.ts';

function near(a: DOMRect, b: DOMRect) {
	for (const key of ['x', 'y', 'width', 'height'] as const) {
		expect(Math.abs(a[key] - b[key]), key).toBeLessThanOrEqual(1);
	}
}

describe('motion adapter hooks', () => {
	const hosts: HTMLElement[] = [];
	afterEach(() => {
		for (const host of hosts.splice(0)) host.remove();
	});

	function build(html: string) {
		const host = document.createElement('div');
		host.innerHTML = html;
		document.body.append(host);
		hosts.push(host);
		return (selector: string) => host.querySelector<HTMLElement>(selector)!;
	}

	const scrolledStage = () => {
		const find = build(`
			<div id="stage" style="position: fixed; left: 30px; top: 40px; width: 600px; height: 400px">
				<div id="scroller" style="position: absolute; left: 10px; top: 20px; width: 300px; height: 200px; overflow: auto">
					<div style="position: relative; width: 1000px; height: 1000px">
						<div data-diagram-task="a" data-diagram-parent="p" style="position: absolute; left: 100px; top: 200px; width: 80px; height: 20px; border-radius: 4px">
							<span data-diagram-station="a" style="position: absolute; left: 2px; top: 3px; width: 10px; height: 10px"></span>
						</div>
						<span data-diagram-label="a" style="position: absolute; left: 100px; top: 230px">Alpha</span>
						<span data-diagram-label="b" style="position: absolute; left: 400px; top: 260px">Beta</span>
					</div>
				</div>
				<div id="free" style="position: absolute; left: 400px; top: 0; width: 10px; height: 10px"></div>
			</div>`);
		const scroller = find('#scroller');
		scroller.scrollLeft = 20;
		scroller.scrollTop = 50;
		return find;
	};

	const round = (value: object | null) =>
		value &&
		Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				typeof item === 'number' ? Math.round(item) : item
			])
		);

	it('captureGeometry returns stage boxes with scroll offsets and running transforms', () => {
		const find = scrolledStage();
		const animation = find('[data-diagram-task="a"]').animate(
			[{ transform: 'translateX(30px)' }, { transform: 'translateX(30px)' }],
			{ duration: 10_000 }
		);
		const records = captureGeometry(find('#stage'), find('#stage'));
		animation.cancel();
		const a = records.get('a')!;
		expect(round(a.box)).toEqual({ x: 120, y: 170, w: 80, h: 20, radius: 4 });
		expect(round(a.station)).toEqual({ x: 127, y: 178, r: 5 });
		expect(round(a.label)).toEqual({ x: 90, y: 200 });
		expect(a.parentId).toBe('p');
		const b = records.get('b')!;
		expect(b.box).toBeNull();
		expect(b.station).toBeNull();
		expect(round(b.label)).toEqual({ x: 390, y: 230 });
		expect([...records.keys()].sort()).toEqual(['a', 'b']);
	});

	it('captureGeometry keeps the drawn radius of a fully round box', () => {
		const find = build(`
			<div id="stage" style="position: fixed; left: 0; top: 0; width: 400px; height: 200px">
				<div data-diagram-task="pill" style="position: absolute; width: 80px; height: 20px; border-radius: 9999px"></div>
			</div>`);
		const box = captureGeometry(find('#stage'), find('#stage')).get('pill')!.box!;
		expect(box.radius).toBe(10);
	});

	it('sourceBox uses the own box, then the own label, then the parent, else nothing', () => {
		const box: Box = { x: 1, y: 2, w: 3, h: 4, radius: 1 };
		const parentBox: Box = { x: 10, y: 20, w: 30, h: 40, radius: 0 };
		const record = (geometry: Partial<TaskGeometry>): TaskGeometry => ({
			box: null,
			station: null,
			label: null,
			parentId: null,
			...geometry
		});
		const outgoing = new Map<string, TaskGeometry>([
			['own', record({ box, label: { x: 9, y: 9 } })],
			['labelled', record({ label: { x: 5, y: 6 } })],
			['parent', record({ box: parentBox })],
			['label-parent', record({ label: { x: 7, y: 8 } })]
		]);
		expect(sourceBox('own', 'parent', outgoing)).toEqual(box);
		expect(sourceBox('labelled', 'parent', outgoing)).toEqual({
			x: 5,
			y: 6,
			w: 0,
			h: 0,
			radius: 0
		});
		expect(sourceBox('child', 'parent', outgoing)).toEqual(parentBox);
		expect(sourceBox('child', 'label-parent', outgoing)).toEqual({
			x: 7,
			y: 8,
			w: 0,
			h: 0,
			radius: 0
		});
		expect(sourceBox('child', 'missing', outgoing)).toBeNull();
		expect(sourceBox('child', null, outgoing)).toBeNull();
	});

	it('routersCompatible needs the same router and the same connector meaning', () => {
		const gantt = { routerId: 'gantt-orthogonal', connectorSchema: 'gantt-orthogonal-v1' };
		expect(routersCompatible(gantt, { ...gantt })).toBe(true);
		expect(routersCompatible(gantt, { ...gantt, routerId: 'other' })).toBe(false);
		expect(routersCompatible(gantt, { ...gantt, connectorSchema: 'other-v1' })).toBe(false);
	});

	it('scrollContainerOf finds the scrolling ancestor and reads its offsets', () => {
		const find = scrolledStage();
		const container = scrollContainerOf(find('[data-diagram-task="a"]'), find('#stage'))!;
		expect(container.element).toBe(find('#scroller'));
		expect(round(container.bounds)).toEqual({ x: 10, y: 20, w: 300, h: 200, radius: 0 });
		expect(container.scrollLeft).toBe(20);
		expect(container.scrollTop).toBe(50);
		expect(scrollContainerOf(find('#free'), find('#stage'))).toBeNull();
	});

	it('applyTransition starts a retarget from the current rendered position', () => {
		const find = build(`
			<div id="stage" style="position: fixed; left: 0; top: 0; width: 800px; height: 400px">
				<div data-diagram-task="a" style="position: absolute; left: 300px; top: 0; width: 40px; height: 20px"></div>
			</div>`);
		const stage = find('#stage');
		const element = find('[data-diagram-task="a"]');
		const target = (x: number, y: number) =>
			new Map<string, TaskGeometry>([
				[
					'a',
					{ box: { x, y, w: 40, h: 20, radius: 0 }, station: null, label: null, parentId: null }
				]
			]);
		const first = applyTransition(stage, stage, target(0, 100), 1000, 'toward');
		expect(first).toHaveLength(1);
		first[0].pause();
		first[0].currentTime = 500;
		const middle = element.getBoundingClientRect();
		expect(Math.abs(middle.x - 300), 'The first motion is in flight').toBeGreaterThan(10);

		const second = applyTransition(stage, stage, target(600, 0), 1000, 'toward');
		expect(second).toHaveLength(1);
		second[0].pause();
		near(element.getBoundingClientRect(), middle);
		second[0].finish();
		const end = element.getBoundingClientRect();
		expect(Math.round(end.x)).toBe(600);
		expect(Math.round(end.y)).toBe(0);
		second[0].cancel();
	});

	it('applyTransition with duration 0 starts nothing', () => {
		const find = build(`
			<div id="stage" style="position: fixed; left: 0; top: 0; width: 800px; height: 400px">
				<div data-diagram-task="a" style="position: absolute; left: 300px; top: 0; width: 40px; height: 20px"></div>
			</div>`);
		const stage = find('#stage');
		const source = new Map<string, TaskGeometry>([
			[
				'a',
				{ box: { x: 0, y: 0, w: 40, h: 20, radius: 0 }, station: null, label: null, parentId: null }
			]
		]);
		expect(applyTransition(stage, stage, source, 0, 'from')).toEqual([]);
		expect(find('[data-diagram-task="a"]').getAnimations()).toHaveLength(0);
	});

	it('applyTransition tweens the corner radius against the scale', () => {
		const find = build(`
			<div id="stage" style="position: fixed; left: 0; top: 0; width: 800px; height: 400px">
				<div data-diagram-task="a" style="position: absolute; left: 0; top: 0; width: 80px; height: 20px"></div>
			</div>`);
		const stage = find('#stage');
		const element = find('[data-diagram-task="a"]');
		const source = new Map<string, TaskGeometry>([
			[
				'a',
				{
					box: { x: 0, y: 0, w: 40, h: 20, radius: 10 },
					station: null,
					label: null,
					parentId: null
				}
			]
		]);
		const [animation] = applyTransition(stage, stage, source, 1000, 'from');
		animation.pause();
		animation.currentTime = 0;
		// Half the width: the horizontal radius doubles, so the drawn corner is 10 px on both axes.
		const style = getComputedStyle(element);
		expect(parseFloat(style.borderTopLeftRadius.split(' ')[0])).toBeCloseTo(20, 0);
		expect(parseFloat(style.borderTopLeftRadius.split(' ')[1])).toBeCloseTo(10, 0);
		animation.finish();
		expect(parseFloat(getComputedStyle(element).borderTopLeftRadius)).toBe(0);
	});
});
