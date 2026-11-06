import { describe, expect, it } from 'vitest';
import { allOwners, normalizeOwners, ownerKey, renameOwner } from './owners.ts';

describe('owners', () => {
	it('compares names after trimming and without case', () => {
		expect(ownerKey('  Ana ')).toBe(ownerKey('ANA'));
		expect(ownerKey('   ')).toBe('');
	});

	it('trims, removes empty names and removes duplicates without case', () => {
		expect(normalizeOwners([' Ana', 'ana ', '', 'Bo'])).toEqual(['Ana', 'Bo']);
	});

	it('keeps the order of the first spellings', () => {
		expect(normalizeOwners(['Bo', 'Ana', 'BO', 'ana'])).toEqual(['Bo', 'Ana']);
	});

	it('renames an owner and merges duplicates', () => {
		expect(renameOwner(['ana', 'Bo'], 'ANA', 'Bo')).toEqual(['Bo']);
	});

	it('keeps the position of a renamed owner and the other owners', () => {
		expect(renameOwner(['Ana', 'Bo', 'Cy'], 'bo', 'Dee')).toEqual(['Ana', 'Dee', 'Cy']);
	});

	it('does not change a list without the owner', () => {
		expect(renameOwner(['Ana'], 'Bo', 'Cy')).toEqual(['Ana']);
	});

	it('merges the lists of all tasks without duplicates', () => {
		expect(allOwners([['Bo', 'ana'], ['Ana', ' Cy '], []], 'en')).toEqual(['ana', 'Bo', 'Cy']);
	});

	it('sorts the suggestions in the order of the given language', () => {
		const lists = [['Zoe', 'Ärger']];
		expect(allOwners(lists, 'de')).toEqual(['Ärger', 'Zoe']);
		expect(allOwners(lists, 'sv')).toEqual(['Zoe', 'Ärger']);
	});
});
