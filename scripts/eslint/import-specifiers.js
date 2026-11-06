// Local ESLint rule for module specifiers. Refer to AGENTS.md, "Coding Style & Naming Conventions".
//
// 1. A specifier to a TypeScript module names its `.js` file. A reactive module `x.svelte.ts` is
//    imported as `x.svelte.js`. A component keeps its `.svelte` extension.
// 2. In a file under `src/`, a relative specifier to a module in `src/lib/` points to a sibling
//    (`./x.js`) or to a file in a parent folder (`../x.js`). Other specifiers to `src/lib/` use the
//    `#lib/...` alias. Files outside `src/` (for example `e2e/`) keep relative paths, because
//    Playwright resolves `.js` to `.ts` only for relative specifiers.
//
// The rule ignores package specifiers and SvelteKit generated types (`./$types`).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SRC = path.join(ROOT, 'src');
const LIB = path.join(SRC, 'lib');

/** Extensions that name a file as it is. `.ts` is not one of them: use `.js`. */
const KEPT_EXTENSIONS = new Set([
	'.js',
	'.mjs',
	'.cjs',
	'.svelte',
	'.json',
	'.css',
	'.svg',
	'.png',
	'.jpg',
	'.jpeg',
	'.webp',
	'.ico',
	'.woff2',
	'.txt',
	'.html'
]);

/** @param {string} file */
const isFile = (file) => fs.existsSync(file) && fs.statSync(file).isFile();

/**
 * Tell if `file` is `dir` or is in it. Windows paths compare without case.
 * @param {string} file
 * @param {string} dir
 * @returns {boolean}
 */
function isInside(file, dir) {
	const relative = path.relative(dir, file);
	const inside = !relative.startsWith('..') && !path.isAbsolute(relative);
	if (process.platform !== 'win32') return inside;
	return inside || isInside(file.toLowerCase(), dir.toLowerCase());
}

/** @param {string} file */
const toPosix = (file) => file.split(path.sep).join('/');

/**
 * Get the file system path that a specifier names, before extension handling.
 * @param {string} spec
 * @param {string} filename
 * @returns {string | undefined}
 */
function targetOf(spec, filename) {
	if (spec === '#lib') return path.join(LIB, 'index.js');
	if (spec.startsWith('#lib/')) return path.join(LIB, spec.slice('#lib/'.length));
	if (spec.startsWith('./') || spec.startsWith('../')) {
		return path.resolve(path.dirname(filename), spec);
	}
	return undefined;
}

/**
 * Find the specifier ending that names an existing file, for a target without a usable extension.
 * @param {string} target
 * @returns {string | undefined} the suffix to append, for example `.js` or `.svelte.js`
 */
function missingSuffix(target) {
	if (isFile(`${target}.ts`) || isFile(`${target}.js`)) return '.js';
	if (isFile(`${target}.svelte.ts`) || isFile(`${target}.svelte.js`)) return '.svelte.js';
	if (isFile(`${target}.svelte`)) return '.svelte';
	if (isFile(path.join(target, 'index.ts')) || isFile(path.join(target, 'index.js'))) {
		return '/index.js';
	}
	return undefined;
}

/**
 * Check the extension of a specifier.
 * @param {string} spec specifier without a query
 * @param {string} target
 * @returns {{ messageId: string, fixed?: string } | undefined}
 */
function checkExtension(spec, target) {
	const ext = path.extname(target);
	if (ext === '.ts' || ext === '.mts') {
		return { messageId: 'tsExtension', fixed: `${spec.slice(0, -ext.length)}.js` };
	}
	if (ext === '.js') {
		if (isFile(target) || isFile(`${target.slice(0, -3)}.ts`)) return undefined;
		const base = target.slice(0, -3);
		if (isFile(`${base}.svelte.ts`) || isFile(`${base}.svelte.js`)) {
			return { messageId: 'reactiveExtension', fixed: `${spec.slice(0, -3)}.svelte.js` };
		}
		return undefined;
	}
	if (ext === '.svelte') {
		if (isFile(target)) return undefined;
		if (isFile(`${target}.ts`) || isFile(`${target}.js`)) {
			return { messageId: 'reactiveExtension', fixed: `${spec}.js` };
		}
		return undefined;
	}
	if (KEPT_EXTENSIONS.has(ext) || isFile(target)) return undefined;
	const suffix = missingSuffix(target);
	return { messageId: 'missingExtension', fixed: suffix ? `${spec}${suffix}` : undefined };
}

/**
 * A relative specifier is a sibling (`./x`) or a file in a parent folder (`../x`, `../../x`).
 * @param {string} spec
 */
function isSiblingOrParent(spec) {
	const parts = spec.split('/');
	const file = parts.pop();
	if (!file || file === '..' || file === '.') return false;
	if (parts.length === 1 && parts[0] === '.') return true;
	return parts.length > 0 && parts.every((part) => part === '..');
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
	meta: {
		type: 'suggestion',
		fixable: 'code',
		docs: { description: 'Require explicit module extensions and the #lib alias' },
		schema: [],
		messages: {
			missingExtension:
				'Add the file extension. Use ".js" for a TypeScript module, ".svelte.js" for a reactive module and ".svelte" for a component.',
			tsExtension: 'Import a TypeScript module with the ".js" extension.',
			reactiveExtension: 'Import a reactive module "x.svelte.ts" as "x.svelte.js".',
			useAlias:
				'Use "{{alias}}". In src/, relative imports from src/lib are only for siblings and parent folders.'
		}
	},
	create(context) {
		const filename = context.filename;

		const checksAlias = isInside(filename, SRC);

		/** @param {Parameters<import('eslint').Rule.RuleFixer['replaceText']>[0] | null | undefined} source */
		function check(source) {
			if (!source || source.type !== 'Literal' || typeof source.value !== 'string') return;
			const raw = source.value;
			const [spec, query] = raw.split('?');
			if (spec.endsWith('/$types') || spec === './$types') return;
			const target = targetOf(spec, filename);
			if (!target) return;
			const quote = /** @type {string} */ (source.raw)?.[0] ?? "'";
			/** @param {string} next */
			const replace = (next) => (/** @type {import('eslint').Rule.RuleFixer} */ fixer) =>
				fixer.replaceText(
					source,
					`${quote}${next}${query === undefined ? '' : `?${query}`}${quote}`
				);

			const extension = checkExtension(spec, target);
			const fixedSpec = extension?.fixed ?? spec;
			const relative = spec.startsWith('./') || spec.startsWith('../');
			if (checksAlias && relative && isInside(target, LIB) && !isSiblingOrParent(spec)) {
				const resolved = path.resolve(path.dirname(filename), fixedSpec);
				const alias = `#lib/${toPosix(path.relative(LIB, resolved))}`;
				context.report({
					node: source,
					messageId: 'useAlias',
					data: { alias },
					fix: extension && !extension.fixed ? undefined : replace(alias)
				});
				return;
			}
			if (extension) {
				context.report({
					node: source,
					messageId: extension.messageId,
					fix: extension.fixed ? replace(extension.fixed) : undefined
				});
			}
		}

		return {
			ImportDeclaration: (node) => check(node.source),
			ExportAllDeclaration: (node) => check(node.source),
			ExportNamedDeclaration: (node) => check(node.source),
			ImportExpression: (node) => check(node.source)
		};
	}
};

export default { rules: { 'import-specifiers': rule } };
