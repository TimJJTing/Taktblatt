import { describe, expect, it } from 'vitest';
import {
	fromEditorText,
	matchesWords,
	noteSegments,
	replaceEditorText,
	toEditorText
} from './mentions';

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
		const { text, mentions } = toEditorText(
			'After @[task:b].',
			(id) => tasks.find((t) => t.id === id)?.title
		);
		expect(text).toBe('After @[Sowing].');
		expect(fromEditorText(text, mentions, tasks)).toBe('After @[task:b].');
	});

	it('links a typed mention only when one task has the title', () => {
		expect(fromEditorText('@[Site survey]', [], tasks)).toBe('@[task:a]');
		expect(fromEditorText('@[Sowing]', [], tasks)).toBe('@[Sowing]');
	});

	it('keeps both ids when two mentions have the same title', () => {
		const editor = toEditorText(
			'@[task:b] and @[task:c]',
			(id) => tasks.find((t) => t.id === id)?.title
		);
		expect(editor.text).toBe('@[Sowing] and @[Sowing]');
		expect(fromEditorText(editor.text, editor.mentions, tasks)).toBe('@[task:b] and @[task:c]');
		const edited = replaceEditorText(editor, 0, 0, 'See ');
		expect(fromEditorText(edited.text, edited.mentions, tasks)).toBe('See @[task:b] and @[task:c]');
	});

	it.each([
		[0, 14, '@[task:c]'],
		[9, 23, '@[task:b]']
	])(
		'keeps the other id after deleting a duplicate-title mention at %i',
		(start, end, expected) => {
			const editor = toEditorText('@[task:b] and @[task:c]', () => 'Sowing');
			const edited = replaceEditorText(editor, start, end, '');
			expect(fromEditorText(edited.text, edited.mentions, tasks)).toBe(expected);
		}
	);

	it('keeps the chosen popup id when another mention has the same title', () => {
		const editor = toEditorText('@[task:b] @So', () => 'Sowing');
		const edited = replaceEditorText(editor, 10, 13, '@[Sowing] ', tasks[2]);
		expect(fromEditorText(edited.text, edited.mentions, tasks)).toBe('@[task:b] @[task:c] ');
	});

	it('does not give a typed duplicate title the id of an existing mention', () => {
		const editor = toEditorText('@[task:b]', () => 'Sowing');
		const edited = replaceEditorText(editor, 9, 9, ' @[Sowing]');
		expect(fromEditorText(edited.text, edited.mentions, tasks)).toBe('@[task:b] @[Sowing]');
	});

	it('matches all words without case', () => {
		expect(matchesWords('Site survey', 'surv SITE')).toBe(true);
		expect(matchesWords('Site survey', 'site plan')).toBe(false);
	});
});
