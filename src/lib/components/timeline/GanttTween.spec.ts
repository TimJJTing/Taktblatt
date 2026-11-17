import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';

interface Clock {
	now: () => number;
	tick: (callback: () => void) => void;
	tasks: Set<unknown>;
}

const timingPath = new URL('./internal/client/timing.js', import.meta.resolve('svelte'));
const { raf } = (await import(timingPath.href)) as { raf: Clock };
const originalNow = raf.now;
const originalTick = raf.tick;
afterEach(() => {
	raf.tasks.clear();
	raf.now = originalNow;
	raf.tick = originalTick;
});

it('keeps the geometry tween deadline when an optional endpoint recomputes to the same target', async () => {
	let time = 0;
	const pending: (() => void)[] = [];
	raf.now = () => time;
	raf.tick = (callback) => pending.push(callback);
	const frame = (at: number) => {
		time = at;
		for (const callback of pending.splice(0)) callback();
	};
	const effects: (() => void)[] = [];
	let current!: () => { x0: number; x1: number };
	// Compile the real component. Only its DOM shell is replaced; its effect and Tween run as written.
	const modules: Record<string, unknown> = {
		'svelte/internal/client': {
			push() {},
			pop() {},
			user_effect: (effect: () => void) => effects.push(effect),
			comment: () => ({}),
			first_child: () => ({}),
			snippet: (_node: unknown, _child: unknown, value: typeof current) => {
				current = value;
			},
			append() {}
		}
	};
	let code = compile(readFileSync(new URL('./GanttTween.svelte', import.meta.url), 'utf8'), {
		filename: 'GanttTween.svelte',
		generate: 'client'
	}).js.code;
	const imports = [...code.matchAll(/^import (?:.+ from )?'([^']+)';$/gm)].map((match) => match[1]);
	for (const source of imports) {
		if (!(source in modules)) modules[source] = await import(source);
	}
	code = code
		.replace(/^import '[^']+';$/gm, '')
		.replace(
			/^import \* as (\w+|\$) from '([^']+)';$/gm,
			(_all, name, source) => `const ${name} = modules[${JSON.stringify(source)}];`
		)
		.replace(
			/^import \{([^}]+)\} from '([^']+)';$/gm,
			(_all, names, source) => `const {${names}} = modules[${JSON.stringify(source)}];`
		)
		.replace('export default function', 'return function');
	const component = new Function('modules', code)(modules);
	const props: { x0: number; x1: number | undefined; child: () => void } = {
		x0: 0,
		x1: 0,
		child() {}
	};
	component({}, props);
	const recompute = () => {
		for (const effect of effects) effect();
	};
	recompute();
	frame(0);
	frame(300);
	props.x0 = props.x1 = 1;
	recompute();
	frame(300);
	frame(420);
	expect(current()).toEqual({ x0: 0.875, x1: 0.875 });
	props.x1 = undefined;
	recompute();
	frame(420);
	expect(current()).toEqual({ x0: 0.875, x1: 0.875 });
	frame(540);
	expect(current()).toEqual({ x0: 1, x1: 1 });
});
