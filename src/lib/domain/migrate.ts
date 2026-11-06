/**
 * Migrations for stored and imported data.
 * Add one function for each new schema version. Each function changes version N to N + 1.
 */
import { SCHEMA_VERSION } from './schema.ts';
import type { MigrationCode } from './import-diagnostics.ts';

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] changes version n to version n + 1. */
const MIGRATIONS: Record<number, Migration> = {};

export class MigrationError extends Error {
	constructor(
		message: string,
		readonly code: MigrationCode,
		readonly version?: number
	) {
		super(message);
	}
}

/** Changes raw data to the current schema version. It does not validate the result. */
export function migrate(data: unknown): unknown {
	if (typeof data !== 'object' || data === null || Array.isArray(data))
		throw new MigrationError('The data is not an object.', 'not_object');
	let current = data as Record<string, unknown>;
	let version = current.schemaVersion;
	if (typeof version !== 'number' || !Number.isInteger(version)) {
		throw new MigrationError('The data has no schema version.', 'missing_version');
	}
	if (version > SCHEMA_VERSION) {
		throw new MigrationError(
			`The data is from a newer app version (schema ${version}).`,
			'newer_version',
			version
		);
	}
	while (version < SCHEMA_VERSION) {
		const step = MIGRATIONS[version];
		if (!step)
			throw new MigrationError(`No migration for schema ${version}.`, 'migration', version);
		current = { ...step(current), schemaVersion: version + 1 };
		version += 1;
	}
	return current;
}
