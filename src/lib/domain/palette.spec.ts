import { describe, expect, it } from 'vitest';
import { nextStageColor } from './palette';

describe('nextStageColor', () => {
	it('returns the first unused color', () => {
		expect(nextStageColor(['blue', 'amber'])).toBe('green');
	});
});
