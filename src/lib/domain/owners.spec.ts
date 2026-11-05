import { describe, expect, it } from 'vitest';
import { allOwners, normalizeOwners, renameOwner } from './owners';

describe('owners', () => {
	it('trims, removes empty names and removes duplicates without case', () => {
		expect(normalizeOwners([' Ana', 'ana ', '', 'Bo'])).toEqual(['Ana', 'Bo']);
	});

	it('renames an owner and merges duplicates', () => {
		expect(renameOwner(['ana', 'Bo'], 'ANA', 'Bo')).toEqual(['Bo']);
	});

	it('sorts the suggestions in the order of the given language', () => {
		const lists = [['Zoe', 'Ärger']];
		expect(allOwners(lists, 'de')).toEqual(['Ärger', 'Zoe']);
		expect(allOwners(lists, 'sv')).toEqual(['Zoe', 'Ärger']);
	});
});
