/**
 * Hints use the Tooltip, not the native `title` attribute. Refer to docs/spec.md.
 * This spec parses every app component and lists each HTML `title` attribute.
 * It checks HTML elements and the vendored UI primitives, because these pass `title` to the DOM.
 * A prop named `title` on an app component is data, not an HTML attribute, so the spec allows it.
 * The document `<title>` element is allowed.
 * Known limit: an app component that forwards `...rest` to the DOM can pass a `title` prop through.
 * This spec does not find that case. The e2e check for `body [title]` in e2e/tooltips.e2e.ts covers it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const excluded = [join(root, 'lib/components/ui'), join(root, 'lib/paraglide')];

function svelteFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (excluded.some((skip) => path === skip || path.startsWith(skip + sep))) return [];
		if (entry.isDirectory()) return svelteFiles(path);
		return entry.name.endsWith('.svelte') ? [path] : [];
	});
}

/** Names of components that the file imports from vendored primitives or from bits-ui. */
function primitiveNames(source: string): Set<string> {
	const names = new Set<string>();
	const imports = source.matchAll(
		/import\s+(?!type\b)([^;]+?)\s+from\s+['"]([^'"]*components\/ui\/[^'"]*|bits-ui)['"]/g
	);
	for (const [, clause] of imports) {
		const namespace = clause.match(/\*\s+as\s+(\w+)/);
		if (namespace) names.add(namespace[1]);
		const named = clause.match(/\{([^}]*)\}/);
		for (const part of named?.[1].split(',') ?? []) {
			const name = part
				.replace(/^\s*type\s+/, '')
				.split(/\s+as\s+/)
				.pop()
				?.trim();
			if (name) names.add(name);
		}
		const fallback = clause.match(/^\s*(\w+)\s*(?:,|$)/);
		if (fallback) names.add(fallback[1]);
	}
	return names;
}

interface Node {
	type?: string;
	name?: string;
	start?: number;
	attributes?: Node[];
	expression?: Node;
	properties?: Node[];
	key?: Node & { value?: unknown };
	[key: string]: unknown;
}

/** Offsets of HTML `title` attributes in the template. */
function titleOffsets(ast: Node, primitives: Set<string>): number[] {
	const found: number[] = [];
	const checksAttributes = (node: Node) => {
		if (node.type === 'RegularElement' || node.type === 'SvelteElement') return true;
		if (node.type === 'Component' && node.name) return primitives.has(node.name.split('.')[0]);
		return false;
	};
	const visit = (value: unknown, parentKey = '') => {
		if (Array.isArray(value)) {
			for (const item of value) visit(item, parentKey);
			return;
		}
		if (!value || typeof value !== 'object') return;
		const node = value as Node;
		if (checksAttributes(node)) {
			for (const attribute of node.attributes ?? []) {
				if (attribute.type === 'Attribute' && attribute.name === 'title') {
					found.push(attribute.start ?? 0);
				}
				if (
					attribute.type === 'SpreadAttribute' &&
					attribute.expression?.type === 'ObjectExpression'
				) {
					for (const property of attribute.expression.properties ?? []) {
						const key = property.key;
						if (key && (key.name === 'title' || key.value === 'title')) {
							found.push(property.start ?? attribute.start ?? 0);
						}
					}
				}
			}
		}
		for (const [key, child] of Object.entries(node)) {
			// Skip script blocks and positional data.
			if (key === 'instance' || key === 'module' || key === 'loc' || key === 'metadata') continue;
			if (parentKey === 'css') continue;
			visit(child, key);
		}
	};
	visit(ast.fragment);
	return found;
}

function lineOf(source: string, offset: number): number {
	return source.slice(0, offset).split('\n').length;
}

describe('hints', () => {
	const files = svelteFiles(root);

	it('finds the app components', () => {
		expect(files.length).toBeGreaterThan(20);
		expect(files.some((file) => file.endsWith('timeline/Timeline.svelte'))).toBe(true);
	});

	it('no app component uses a native title attribute', () => {
		const findings = files.flatMap((file) => {
			const source = readFileSync(file, 'utf8');
			const ast = parse(source, { modern: true, filename: file }) as unknown as Node;
			return titleOffsets(ast, primitiveNames(source)).map(
				(offset) => `src/${relative(root, file)}:${lineOf(source, offset)}`
			);
		});
		expect(findings).toEqual([]);
	});

	it('detects title attributes on elements and primitives, but not app component props', () => {
		const source = `<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import StageTitle from './StageTitle.svelte';
	let title = 'x';
</script>
<svelte:head><title>Page</title></svelte:head>
<span title="a"></span>
<span {title}></span>
<div {...{ title: 'b' }}></div>
<Button title="c" />
<Popover.Trigger title="d" />
<StageTitle title="e" />`;
		const ast = parse(source, { modern: true }) as unknown as Node;
		const lines = titleOffsets(ast, primitiveNames(source)).map((offset) => lineOf(source, offset));
		expect(lines).toEqual([8, 9, 10, 11, 12]);
	});
});
