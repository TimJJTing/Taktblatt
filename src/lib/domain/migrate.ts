/**
 * Migrations for stored and imported data.
 * Add one function for each new schema version. Each function changes version N to N + 1.
 */
import { SCHEMA_VERSION } from './schema.ts';

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] changes version n to version n + 1. */
const MIGRATIONS: Record<number, Migration> = {};

export class MigrationError extends Error {}

/** Changes raw data to the current schema version. It does not validate the result. */
export function migrate(data: unknown): unknown {
	if (typeof data !== 'object' || data === null)
		throw new MigrationError('The data is not an object.');
	let current = data as Record<string, unknown>;
	let version = current.schemaVersion;
	if (typeof version !== 'number' || !Number.isInteger(version)) {
		throw new MigrationError('The data has no schema version.');
	}
	if (version > SCHEMA_VERSION) {
		throw new MigrationError(`The data is from a newer app version (schema ${version}).`);
	}
	while (version < SCHEMA_VERSION) {
		const step = MIGRATIONS[version];
		if (!step) throw new MigrationError(`No migration for schema ${version}.`);
		current = { ...step(current), schemaVersion: version + 1 };
		version += 1;
	}
	return current;
}
