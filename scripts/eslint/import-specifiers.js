// Local ESLint rule for module specifiers. Refer to AGENTS.md, "Coding Style & Naming Conventions".
//
// 1. A specifier names the file on disk. A TypeScript module is imported with `.ts`, a reactive
//    module with `.svelte.ts`, a component with `.svelte` and a JavaScript file with `.js`.
// 2. A relative specifier to a module in `src/lib/` points to a sibling (`./x.ts`) or to a file in
//    a parent folder (`../x.ts`). Other specifiers to `src/lib/` use the `#lib/...` alias.
//
// Refer to docs/adr/0012-import-file-extensions.md.
//
// The rule ignores package specifiers and SvelteKit generated types (`./$types`).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const LIB = path.join(ROOT, 'src', 'lib');

/** Extensions of files that are not TypeScript or JavaScript modules. */
const ASSET_EXTENSIONS = new Set([
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
	if (spec === '#lib') return path.join(LIB, 'index.ts');
	if (spec.startsWith('#lib/')) return path.join(LIB, spec.slice('#lib/'.length));
	if (spec.startsWith('./') || spec.startsWith('../')) {
		return path.resolve(path.dirname(filename), spec);
	}
	return undefined;
}

/**
 * Find the specifier ending that names an existing file, for a target without a usable extension.
 * @param {string} target
 * @returns {string | undefined} the suffix to append, for example `.ts` or `.svelte.ts`
 */
function missingSuffix(target) {
	for (const suffix of ['.ts', '.js', '.svelte.ts', '.svelte.js', '.svelte']) {
		if (isFile(`${target}${suffix}`)) return suffix;
	}
	for (const index of ['index.ts', 'index.js']) {
		if (isFile(path.join(target, index))) return `/${index}`;
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
	if (isFile(target)) return undefined;
	const ext = path.extname(target);
	if (ext === '.js') {
		// The file is TypeScript: `x.js` names `x.ts`, or `x.svelte.js` names `x.svelte.ts`.
		const base = target.slice(0, -3);
		if (isFile(`${base}.ts`)) {
			const messageId = base.endsWith('.svelte') ? 'reactiveExtension' : 'jsExtension';
			return { messageId, fixed: `${spec.slice(0, -3)}.ts` };
		}
		if (isFile(`${base}.svelte.ts`)) {
			return { messageId: 'reactiveExtension', fixed: `${spec.slice(0, -3)}.svelte.ts` };
		}
		return undefined;
	}
	if (ext === '.svelte') {
		if (isFile(`${target}.ts`)) return { messageId: 'reactiveExtension', fixed: `${spec}.ts` };
		if (isFile(`${target}.js`)) return undefined;
		return undefined;
	}
	if (ext === '.ts' || ASSET_EXTENSIONS.has(ext)) return undefined;
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
				'Add the file extension: ".ts" for a TypeScript module, ".svelte.ts" for a reactive module, ".svelte" for a component.',
			jsExtension: 'Import a TypeScript module with its ".ts" extension.',
			reactiveExtension: 'Import a reactive module "x.svelte.ts" with its ".svelte.ts" extension.',
			useAlias:
				'Use "{{alias}}". Relative imports from src/lib are only for siblings and parent folders.'
		}
	},
	create(context) {
		const filename = context.filename;

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
			if (relative && isInside(target, LIB) && !isSiblingOrParent(spec)) {
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
