import { describe, expect, it } from 'vitest';
import { fromEditorText, matchesWords, noteSegments, toEditorText } from './mentions';

const tasks = [
	{ id: 'a', title: 'Site survey' },
	{ id: 'b', title: 'Sowing' },
	{ id: 'c', title: 'Sowing' }
];

describe('mentions', () => {
	it('splits a note into segments', () => {
		expect(noteSegments('See @[task:a] now')).toEqual([
			{ kind: 'text', text: 'See ' },
			{ kind: 'mention', id: 'a' },
			{ kind: 'text', text: ' now' }
		]);
	});

	it('converts tokens to readable text and back', () => {
		const { text, ids } = toEditorText(
			'After @[task:b].',
			(id) => tasks.find((t) => t.id === id)?.title
		);
		expect(text).toBe('After @[Sowing].');
		expect(fromEditorText(text, ids, tasks)).toBe('After @[task:b].');
	});

	it('links a typed mention only when one task has the title', () => {
		expect(fromEditorText('@[Site survey]', new Map(), tasks)).toBe('@[task:a]');
		expect(fromEditorText('@[Sowing]', new Map(), tasks)).toBe('@[Sowing]');
	});

	it('matches all words without case', () => {
		expect(matchesWords('Site survey', 'surv SITE')).toBe(true);
		expect(matchesWords('Site survey', 'site plan')).toBe(false);
	});
});
