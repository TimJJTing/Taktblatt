/**
 * Checks the Paraglide output after `paraglide-js compile`.
 * The inlang SDK does not fail when it cannot load a plugin. It then writes no messages.
 * This script fails when a message in messages/en.json has no compiled function.
 * Refer to docs/adr/0010-local-inlang-plugins.md.
 */
import { readFile } from 'node:fs/promises';

const source = JSON.parse(await readFile(new URL('../messages/en.json', import.meta.url), 'utf8'));
const keys = Object.keys(source).filter((key) => !key.startsWith('$'));
const compiled = await import('../src/lib/paraglide/messages/_index.js');
const missing = keys.filter((key) => typeof compiled[key] !== 'function');

if (missing.length > 0) {
	console.error(
		`Paraglide compiled ${keys.length - missing.length} of ${keys.length} messages. ` +
			'Make sure that the inlang plugins in project.inlang/settings.json load. ' +
			`Missing: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}`
	);
	process.exit(1);
}
