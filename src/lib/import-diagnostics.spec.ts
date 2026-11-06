import { afterEach, describe, expect, it } from 'vitest';
import { VALIDATION_MESSAGES, type ImportDiagnosticCode } from '#lib/domain/import-diagnostics.ts';
import { getLocale, overwriteGetLocale } from '#lib/paraglide/runtime.js';
import { formatImportDiagnostic } from './import-diagnostics.ts';

describe('localized import diagnostics', () => {
	const original = getLocale;
	afterEach(() => overwriteGetLocale(original));
	const customCodes = Object.keys(VALIDATION_MESSAGES) as (keyof typeof VALIDATION_MESSAGES)[];
	const genericCodes: ImportDiagnosticCode[] = [
		'json',
		'not_object',
		'missing_version',
		'newer_version',
		'migration',
		'string',
		'boolean',
		'array',
		'object',
		'missing',
		'choice',
		'timestamp',
		'empty',
		'value'
	];

	it('matches every domain validation message in English', () => {
		overwriteGetLocale(() => 'en');
		for (const code of customCodes) {
			expect
				.soft(formatImportDiagnostic({ code, message: '' }), code)
				.toBe(VALIDATION_MESSAGES[code]);
		}
	});

	it('lists allowed choice values with an English disjunction', () => {
		overwriteGetLocale(() => 'en');
		const diagnostic = { code: 'choice' as const, values: ['"a4"', '"letter"'], message: '' };
		expect(formatImportDiagnostic(diagnostic)).toBe('Use one of these values: "a4" or "letter".');
	});

	it('localizes allowed choice values in de', () => {
		overwriteGetLocale(() => 'de');
		const diagnostic = { code: 'choice' as const, values: ['"a4"', '"letter"'], message: '' };
		const text = formatImportDiagnostic(diagnostic);
		expect.soft(text).toContain('"a4"');
		expect.soft(text).toContain('"letter"');
		expect.soft(text).not.toBe('Use one of these values: "a4" or "letter".');
		expect.soft(text).not.toBe(formatImportDiagnostic({ code: 'choice', message: '' }));
	});

	it.each(['en', 'de', 'zh-TW', 'ja'] as const)(
		'localizes every import failure category in %s without exposing library prose',
		(locale) => {
			overwriteGetLocale(() => locale);
			const custom = customCodes.map((code) =>
				formatImportDiagnostic({ code, message: VALIDATION_MESSAGES[code] })
			);
			// Each custom rule must retain a distinct explanation.
			expect(new Set(custom).size).toBe(customCodes.length);
			for (const code of [...customCodes, ...genericCodes]) {
				const text = formatImportDiagnostic({ code, version: 99, message: 'LIBRARY PROSE' });
				expect(text.length).toBeGreaterThan(0);
				expect(text).not.toContain('LIBRARY PROSE');
				if (locale === 'zh-TW') expect(text).toMatch(/\p{Script=Han}/u);
				if (locale === 'ja')
					expect(text).toMatch(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u);
			}
			if (locale !== 'en') {
				for (const [index, code] of customCodes.entries()) {
					expect(custom[index]).not.toBe(VALIDATION_MESSAGES[code]);
				}
			}
		}
	);

	it.each(['en', 'de', 'zh-TW', 'ja'] as const)(
		'keeps schema numbers and field paths in %s',
		(locale) => {
			overwriteGetLocale(() => locale);
			for (const code of ['newer_version', 'migration'] as const) {
				expect(formatImportDiagnostic({ code, version: 99, message: '' })).toContain('99');
			}
			expect(
				formatImportDiagnostic({ code: 'value', path: 'plan.tasks.3.done', message: '' })
			).toContain('plan.tasks.3.done');
		}
	);

	it('uses localized fallback text instead of an unknown English diagnostic', () => {
		overwriteGetLocale(() => 'ja');
		const text = formatImportDiagnostic({
			code: 'value',
			path: 'plan.heading',
			message: 'An unknown upstream validator failed.'
		});
		expect(text).toContain('plan.heading');
		expect(text).toMatch(/\p{Script=Han}/u);
		expect(text).not.toContain('An unknown upstream validator failed.');
	});

	it.each(['constructor', 'toString', 'future_validator'])(
		'uses the localized value fallback for runtime code %s',
		(code) => {
			overwriteGetLocale(() => 'zh-TW');
			const diagnostic = { path: 'plan.heading', message: 'Upstream English error.' };
			expect(formatImportDiagnostic({ ...diagnostic, code: code as ImportDiagnosticCode })).toBe(
				formatImportDiagnostic({ ...diagnostic, code: 'value' })
			);
		}
	);
});
