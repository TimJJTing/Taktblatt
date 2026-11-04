import { describe, expect, it } from 'vitest';
import { migrate } from './migrate';

describe('migrate', () => {
	it('rejects data without a schema version', () => {
		expect(() => migrate({})).toThrow();
	});
});
