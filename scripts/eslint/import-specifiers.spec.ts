import path from 'node:path';
import { RuleTester } from 'eslint';
import { afterAll, describe, expect, it } from 'vitest';
import ts from 'typescript-eslint';
import plugin from './import-specifiers.js';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
// RuleTester checks with node:assert. Count one Vitest assertion per case, because the project
// requires an assertion in every test.
const counted = (run: typeof it | typeof it.only) => (name: string, test: () => void) =>
	run(name, () => {
		expect(test).not.toThrow();
	});
RuleTester.it = counted(it);
RuleTester.itOnly = counted(it.only);

const root = path.resolve(import.meta.dirname, '../..');
const file = (name: string) => path.join(root, name);
const ruleTester = new RuleTester({
	languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: ts.parser }
});
const rule = plugin.rules['import-specifiers'];

ruleTester.run('import-specifiers', rule, {
	valid: [
		{ code: "import { a } from './history.svelte.ts';", filename: file('src/lib/state/x.ts') },
		{ code: "import { a } from './commands.ts';", filename: file('src/lib/state/x.ts') },
		{ code: "import { a } from '../motion.ts';", filename: file('src/lib/state/x.ts') },
		{ code: "import { a } from '../../motion.ts';", filename: file('src/lib/domain/x/y.ts') },
		{ code: "import { a } from '#lib/domain/date.ts';", filename: file('src/lib/state/x.ts') },
		{ code: "import { a } from '#lib/state/viewer.svelte.ts';", filename: file('e2e/x.ts') },
		{ code: "import { a } from '#lib';", filename: file('src/routes/x.ts') },
		{ code: "import A from './AddLine.svelte';", filename: file('src/lib/components/edit/x.ts') },
		{
			code: "import A from '#lib/components/ui/button/index.ts';",
			filename: file('src/lib/components/edit/x.ts')
		},
		{
			code: "import { m } from '#lib/paraglide/messages/_index.js';",
			filename: file('scripts/x.mjs')
		},
		{ code: "import en from '../messages/en.json';", filename: file('e2e/x.ts') },
		{ code: "import { a } from './helpers.ts';", filename: file('e2e/x.ts') },
		{ code: "import icon from './favicon.png?url';", filename: file('static/x.ts') },
		{
			code: "import { a } from '../../static/manifest.webmanifest';",
			filename: file('src/routes/x.ts')
		},
		{ code: "import { a } from 'svelte/motion';", filename: file('src/lib/state/x.ts') },
		{ code: "import type { A } from './$types';", filename: file('src/routes/x.ts') },
		{ code: "const a = import('./commands.ts');", filename: file('src/lib/state/x.ts') }
	],
	invalid: [
		{
			code: "import { a } from './commands';",
			filename: file('src/lib/state/x.ts'),
			output: "import { a } from './commands.ts';",
			errors: [{ messageId: 'missingExtension' }]
		},
		{
			code: "import { a } from './commands.js';",
			filename: file('src/lib/state/x.ts'),
			output: "import { a } from './commands.ts';",
			errors: [{ messageId: 'jsExtension' }]
		},
		{
			code: "import { a } from './history.svelte';",
			filename: file('src/lib/state/x.ts'),
			output: "import { a } from './history.svelte.ts';",
			errors: [{ messageId: 'reactiveExtension' }]
		},
		{
			code: "import { a } from './history.svelte.js';",
			filename: file('src/lib/state/x.ts'),
			output: "import { a } from './history.svelte.ts';",
			errors: [{ messageId: 'reactiveExtension' }]
		},
		{
			code: "import { a } from './history.js';",
			filename: file('src/lib/state/x.ts'),
			output: "import { a } from './history.svelte.ts';",
			errors: [{ messageId: 'reactiveExtension' }]
		},
		{
			code: "import { a } from './history';",
			filename: file('src/lib/state/x.ts'),
			output: "import { a } from './history.svelte.ts';",
			errors: [{ messageId: 'missingExtension' }]
		},
		{
			code: "import { a } from '#lib/domain/date';",
			filename: file('src/lib/state/x.ts'),
			output: "import { a } from '#lib/domain/date.ts';",
			errors: [{ messageId: 'missingExtension' }]
		},
		{
			code: "import { a } from '#lib/domain/date.js';",
			filename: file('e2e/x.ts'),
			output: "import { a } from '#lib/domain/date.ts';",
			errors: [{ messageId: 'jsExtension' }]
		},
		{
			code: "import { a } from './helpers.js';",
			filename: file('e2e/x.ts'),
			output: "import { a } from './helpers.ts';",
			errors: [{ messageId: 'jsExtension' }]
		},
		{
			code: "import { a } from './commands?raw';",
			filename: file('src/lib/state/x.ts'),
			output: "import { a } from './commands.ts?raw';",
			errors: [{ messageId: 'missingExtension' }]
		},
		{
			code: 'import { a } from "./commands";',
			filename: file('src/lib/state/x.ts'),
			output: 'import { a } from "./commands.ts";',
			errors: [{ messageId: 'missingExtension' }]
		},
		{
			code: "import * as B from '#lib/components/ui/button';",
			filename: file('src/lib/components/edit/x.ts'),
			output: "import * as B from '#lib/components/ui/button/index.ts';",
			errors: [{ messageId: 'missingExtension' }]
		},
		{
			code: "import A from './AddLine';",
			filename: file('src/lib/components/edit/x.ts'),
			output: "import A from './AddLine.svelte';",
			errors: [{ messageId: 'missingExtension' }]
		},
		{
			code: "import { a } from './missing';",
			filename: file('src/lib/state/x.ts'),
			output: null,
			errors: [{ messageId: 'missingExtension' }]
		},
		{
			code: "import { a } from '../domain/date.ts';",
			filename: file('src/lib/state/x.ts'),
			output: "import { a } from '#lib/domain/date.ts';",
			errors: [{ messageId: 'useAlias' }]
		},
		{
			code: "import { a } from '../domain/date.js';",
			filename: file('src/lib/state/x.ts'),
			output: "import { a } from '#lib/domain/date.ts';",
			errors: [{ messageId: 'useAlias' }]
		},
		{
			code: "import { a } from './edit/AddLine.svelte';",
			filename: file('src/lib/components/x.ts'),
			output: "import { a } from '#lib/components/edit/AddLine.svelte';",
			errors: [{ messageId: 'useAlias' }]
		},
		{
			code: "import { a } from '../src/lib/domain/palette.js';",
			filename: file('e2e/x.ts'),
			output: "import { a } from '#lib/domain/palette.ts';",
			errors: [{ messageId: 'useAlias' }]
		},
		{
			code: "export * from '../domain/date.ts';",
			filename: file('src/lib/state/x.ts'),
			output: "export * from '#lib/domain/date.ts';",
			errors: [{ messageId: 'useAlias' }]
		},
		{
			code: "export { a } from '../domain/date';",
			filename: file('src/lib/state/x.ts'),
			output: "export { a } from '#lib/domain/date.ts';",
			errors: [{ messageId: 'useAlias' }]
		},
		{
			code: "const a = import('./commands');",
			filename: file('src/lib/state/x.ts'),
			output: "const a = import('./commands.ts');",
			errors: [{ messageId: 'missingExtension' }]
		}
	]
});
