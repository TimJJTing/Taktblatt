/**
 * Mentions in notes. The stored note has tokens `@[task:<id>]`.
 * In the editor, a token shows as `@[Title]`, so a person can read it.
 */
import { MENTION_PATTERN, mentionToken } from './dependencies';

export type NoteSegment = { kind: 'text'; text: string } | { kind: 'mention'; id: string };

/** Splits a stored note into text and mention segments. */
export function noteSegments(note: string): NoteSegment[] {
	const segments: NoteSegment[] = [];
	let last = 0;
	for (const match of note.matchAll(MENTION_PATTERN)) {
		const index = match.index ?? 0;
		if (index > last) segments.push({ kind: 'text', text: note.slice(last, index) });
		segments.push({ kind: 'mention', id: match[1] });
		last = index + match[0].length;
	}
	if (last < note.length) segments.push({ kind: 'text', text: note.slice(last) });
	return segments;
}

/** Converts a stored note to editor text. Returns the text and the title-to-id map of this edit. */
export function toEditorText(
	note: string,
	titleOf: (id: string) => string | undefined
): { text: string; ids: Map<string, string> } {
	const ids = new Map<string, string>();
	const text = note.replace(MENTION_PATTERN, (token, id: string) => {
		const title = titleOf(id);
		if (title === undefined) return token;
		ids.set(title, id);
		return `@[${title}]`;
	});
	return { text, ids };
}

/**
 * Converts editor text back to a stored note. A `@[Title]` becomes a token when the title is in
 * the edit map, or when exactly one task has this title. Else the text stays as typed.
 */
export function fromEditorText(
	text: string,
	ids: ReadonlyMap<string, string>,
	tasks: readonly { id: string; title: string }[]
): string {
	return text.replace(/@\[([^\]]+)\]/g, (raw, title: string) => {
		if (title.startsWith('task:')) return raw;
		const known = ids.get(title);
		if (known) return mentionToken(known);
		const matches = tasks.filter((t) => t.title === title);
		return matches.length === 1 ? mentionToken(matches[0].id) : raw;
	});
}

/** Returns true when all words of the query are in the title (without case). */
export function matchesWords(title: string, query: string): boolean {
	const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
	const target = title.toLocaleLowerCase();
	return words.every((w) => target.includes(w));
}
