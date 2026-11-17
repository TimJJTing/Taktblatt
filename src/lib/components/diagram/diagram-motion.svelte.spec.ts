import '../../../routes/layout.css';
import { afterEach, describe, expect, it } from 'vitest';
import {
	captureGeometry,
	createFlight,
	cueOf,
	routersCompatible,
	scrollContainerOf
} from './diagram-motion.ts';

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
	function fixture(kind: 'station' | 'label' = 'station') {
		const cue = (id: string, size: number) =>
			kind === 'station'
				? `<div data-diagram-task="${id}"><button id="${id}" tabindex="0" data-diagram-station="${id}" data-route-target="${id}" style="display:block;width:${size}px;height:${size}px"><span tabindex="0" id="child-${id}" data-diagram-label="${id}">x</span></button></div>`
				: `<button data-diagram-label="${id}" style="width:${size}px;height:20px">label</button>`;
		const find =
			build(`<div id="stage" style="position:fixed;left:30px;top:40px;width:500px;height:300px">
			<div id="out" style="position:absolute;left:10px;top:10px;width:180px;height:150px;overflow:auto"><div style="width:600px;height:600px"><div id="out-inner" style="width:400px;height:400px;overflow:auto"><div style="position:relative;width:600px;height:600px"><div style="position:absolute;left:100px;top:100px">${cue('a', 16)}</div></div></div></div></div>
			<div id="in" style="position:absolute;left:230px;top:30px;width:180px;height:150px;overflow:auto"><div style="width:600px;height:600px"><div id="in-inner" style="width:400px;height:400px;overflow:auto"><div style="position:relative;width:600px;height:600px"><div style="position:absolute;left:110px;top:120px">${cue('a', 8)}</div></div></div></div></div>
			<div data-diagram-flight style="position:absolute;inset:0;overflow:hidden;pointer-events:none" inert aria-hidden="true"></div></div>`);
		for (const selector of ['#out', '#in', '#out-inner', '#in-inner']) {
			find(selector).scrollLeft = 30;
			find(selector).scrollTop = 40;
		}
		const stage = find('#stage');
		return {
			find,
			stage,
			outgoing: captureGeometry(find('#out'), stage),
			incoming: captureGeometry(find('#in'), stage)
		};
	}
	function pause(animations: Animation[], time: number) {
		for (const animation of document.getAnimations()) {
			animation.pause();
			animation.currentTime = time;
		}
		expect(animations.length).toBeGreaterThan(0);
	}
	function close(a: number, b: number) {
		expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
	}
	function center(rect: DOMRect) {
		return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
	}

	it('captures station and label geometry including scroll and running transforms', () => {
		const { find, stage } = fixture();
		const node = find('#out [data-diagram-task]');
		const animation = node.animate(
			[{ transform: 'translateX(30px)' }, { transform: 'translateX(30px)' }],
			{ duration: 10000 }
		);
		animation.pause();
		animation.currentTime = 5000;
		const record = captureGeometry(find('#out'), stage).get('a')!;
		const origin = stage.getBoundingClientRect();
		const station = find('#out [data-diagram-station]');
		const rect = station.getBoundingClientRect();
		const label = find('#out [data-diagram-label]').getBoundingClientRect();
		expect(record.station).toEqual({
			x: rect.left + rect.width / 2 - origin.left,
			y: rect.top + rect.height / 2 - origin.top,
			r: rect.width / 2
		});
		expect(record.label).toEqual({
			x: label.left - origin.left,
			y: label.top - origin.top,
			w: label.width,
			h: label.height
		});
		expect(record.elements).toEqual([station]);
		animation.cancel();
		const labels = fixture('label');
		expect(labels.outgoing.get('a')!.elements).toEqual([labels.find('#out [data-diagram-label]')]);
	});
	it('selects the station, then the label, then no cue', () => {
		const { outgoing } = fixture();
		const record = outgoing.get('a')!;
		expect(cueOf(record)).toEqual({
			kind: 'station',
			x: record.station!.x,
			y: record.station!.y,
			w: 2 * record.station!.r,
			h: 2 * record.station!.r
		});
		expect(cueOf({ ...record, station: null })).toEqual({ kind: 'label', ...record.label });
		expect(cueOf({ ...record, station: null, label: null })).toBeNull();
	});
	it('keeps station centers at scrolled anchors and scales 16 to 8 pixels', () => {
		const { find, stage, outgoing, incoming } = fixture();
		const from = center(find('#out [data-diagram-station]').getBoundingClientRect());
		const to = center(find('#in [data-diagram-station]').getBoundingClientRect());
		const flight = createFlight(stage, outgoing, incoming, 1000);
		expect(stage.querySelectorAll('[data-flight-copy]')).toHaveLength(1);
		const copy = stage.querySelector<HTMLElement>('[data-flight-copy]')!;
		pause(flight.animations, 0);
		let rect = copy.getBoundingClientRect();
		close(center(rect).x, from.x);
		close(center(rect).y, from.y);
		close(rect.width, 16);
		pause(flight.animations, 1000);
		rect = copy.getBoundingClientRect();
		close(center(rect).x, to.x);
		close(center(rect).y, to.y);
		close(rect.width, 8);
		flight.cancel();
	});
	it('moves label top-left without scaling', () => {
		const { find, stage, outgoing, incoming } = fixture('label');
		const from = find('#out [data-diagram-label]').getBoundingClientRect();
		const to = find('#in [data-diagram-label]').getBoundingClientRect();
		const flight = createFlight(stage, outgoing, incoming, 1000);
		expect(stage.querySelectorAll('[data-flight-copy]')).toHaveLength(1);
		const copy = stage.querySelector<HTMLElement>('[data-flight-copy]')!;
		pause(flight.animations, 0);
		let rect = copy.getBoundingClientRect();
		close(rect.left, from.left);
		close(rect.top, from.top);
		close(rect.width, to.width);
		pause(flight.animations, 1000);
		rect = copy.getBoundingClientRect();
		close(rect.left, to.left);
		close(rect.top, to.top);
		close(rect.width, to.width);
		flight.cancel();
	});
	it('starts an emerging child at its parent and omits tasks without destinations', () => {
		const { stage, outgoing, incoming } = fixture();
		const parent = outgoing.get('a')!;
		const child = incoming.get('a')!;
		const flight = createFlight(
			stage,
			new Map([
				['parent', parent],
				['gone', parent]
			]),
			new Map([['child', { ...child, parentId: 'parent' }]]),
			1000
		);
		expect(stage.querySelectorAll('[data-flight-copy]')).toHaveLength(1);
		const copy = stage.querySelector<HTMLElement>('[data-flight-copy="child"]')!;
		pause(flight.animations, 0);
		const rect = copy.getBoundingClientRect();
		const origin = stage.getBoundingClientRect();
		close(center(rect).x - origin.left, parent.station!.x);
		close(center(rect).y - origin.top, parent.station!.y);
		flight.cancel();
	});
	it('culls cues outside the stage while retaining an inside task', () => {
		const { stage, outgoing, incoming } = fixture();
		const outside = (record: NonNullable<ReturnType<typeof outgoing.get>>) => ({
			...record,
			station: { x: 900, y: 900, r: 4 }
		});
		const flight = createFlight(
			stage,
			new Map([...outgoing, ['outside', outside(outgoing.get('a')!)]]),
			new Map([...incoming, ['outside', outside(incoming.get('a')!)]]),
			1000
		);
		expect(stage.querySelectorAll('[data-flight-copy]')).toHaveLength(1);
		expect(stage.querySelector('[data-flight-copy="a"]')).not.toBeNull();
		flight.cancel();
	});
	for (const finish of [false, true])
		it(`restores prior cue visibility after ${finish ? 'finish and cancel' : 'cancel'}`, () => {
			const { find, stage, outgoing, incoming } = fixture();
			const from = find('#out [data-diagram-station]');
			const to = find('#in [data-diagram-station]');
			from.style.visibility = 'visible';
			const flight = createFlight(stage, outgoing, incoming, 1000);
			expect(stage.querySelectorAll('[data-flight-copy]')).toHaveLength(1);
			expect(getComputedStyle(from).visibility).toBe('hidden');
			expect(getComputedStyle(to).visibility).toBe('hidden');
			if (finish) for (const animation of flight.animations) animation.finish();
			flight.cancel();
			flight.cancel();
			expect(from.style.visibility).toBe('visible');
			expect(to.style.visibility).toBe('');
			expect(stage.querySelector('[data-flight-copy]')).toBeNull();
		});
	it('strips identity and focus from the entire decorative copy', () => {
		const { stage, outgoing, incoming } = fixture();
		const flight = createFlight(stage, outgoing, incoming, 1000);
		const copy = stage.querySelector<HTMLElement>('[data-flight-copy]');
		expect(copy).not.toBeNull();
		const active = document.activeElement;
		for (const element of [copy!, ...copy!.querySelectorAll<HTMLElement>('*')]) {
			for (const attr of element.getAttributeNames())
				expect(
					/^(id|tabindex|data-diagram-.*|data-route-.*|data-testid|aria-describedby|aria-controls|aria-labelledby)$/.test(
						attr
					)
				).toBe(false);
			element.focus();
			expect(document.activeElement).toBe(active);
		}
		flight.cancel();
	});
	it('does not create a flight at zero duration', () => {
		const { find, stage, outgoing, incoming } = fixture();
		const flight = createFlight(stage, outgoing, incoming, 0);
		expect(flight.animations).toHaveLength(0);
		expect(stage.querySelector('[data-flight-copy]')).toBeNull();
		expect(getComputedStyle(find('#out [data-diagram-station]')).visibility).not.toBe('hidden');
	});
	it('captures the current rendered copy at a paused frame', () => {
		const { stage, outgoing, incoming } = fixture();
		const flight = createFlight(stage, outgoing, incoming, 1000);
		expect(stage.querySelectorAll('[data-flight-copy]')).toHaveLength(1);
		pause(flight.animations, 500);
		const rect = stage.querySelector<HTMLElement>('[data-flight-copy]')!.getBoundingClientRect();
		const origin = stage.getBoundingClientRect();
		const captured = flight.capture().get('a')!;
		close(captured.station!.x, center(rect).x - origin.left);
		close(captured.station!.y, center(rect).y - origin.top);
		close(captured.station!.r, rect.width / 2);
		expect(captured.elements).toEqual([]);
		flight.cancel();
	});
	it('routersCompatible needs the same router and connector meaning', () => {
		const gantt = { routerId: 'gantt-orthogonal', connectorSchema: 'gantt-orthogonal-v1' };
		expect(routersCompatible(gantt, { ...gantt })).toBe(true);
		expect(routersCompatible(gantt, { ...gantt, routerId: 'other' })).toBe(false);
		expect(routersCompatible(gantt, { ...gantt, connectorSchema: 'other-v1' })).toBe(false);
	});
	it('scrollContainerOf reads the nearest scrolling ancestor and offsets', () => {
		const { find, stage } = fixture();
		const scroller = find('#out-inner');
		const container = scrollContainerOf(find('#out [data-diagram-task]'), stage)!;
		expect(container.element).toBe(scroller);
		expect(container.scrollLeft).toBe(30);
		expect(container.scrollTop).toBe(40);
		expect(scrollContainerOf(find('[data-diagram-flight]'), stage)).toBeNull();
	});
});
