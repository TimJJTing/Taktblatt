import { describe, expect, it } from 'vitest';
import { migrate, MigrationError } from './migrate.js';
import { SCHEMA_VERSION } from './schema.js';

describe('migrate', () => {
	it('rejects data without a schema version', () => {
		expect(() => migrate({})).toThrow(MigrationError);
	});

	it.each([null, undefined, 'text', 42, true])(
		'rejects a value that is not an object: %s',
		(data) => {
			expect(() => migrate(data)).toThrow(MigrationError);
		}
	);

	it.each(['1', 1.5, Number.NaN, null])(
		'rejects a schema version that is not an integer: %s',
		(version) => {
			expect(() => migrate({ schemaVersion: version })).toThrow(MigrationError);
		}
	);

	it('rejects data from a newer app version and gives the version', () => {
		expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 1 })).toThrow(
			`schema ${SCHEMA_VERSION + 1}`
		);
	});

	it('rejects an old version that has no migration', () => {
		expect(() => migrate({ schemaVersion: 0 })).toThrow('No migration for schema 0.');
	});

	it('returns data of the current version without a change', () => {
		const data = { schemaVersion: SCHEMA_VERSION, plan: { id: 'a' } };
		expect(migrate(data)).toEqual({ schemaVersion: SCHEMA_VERSION, plan: { id: 'a' } });
	});
});
