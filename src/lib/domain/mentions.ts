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

export type EditorMention = { start: number; end: number; id: string };
export type EditorNote = { text: string; mentions: EditorMention[] };

/** Converts stored tokens to titles. Each text range keeps its task id. */
export function toEditorText(
	note: string,
	titleOf: (id: string) => string | undefined
): EditorNote {
	const mentions: EditorMention[] = [];
	let offset = 0;
	const text = note.replace(MENTION_PATTERN, (token, id: string, index: number) => {
		const title = titleOf(id);
		if (title === undefined) return token;
		const label = `@[${title}]`;
		const start = index + offset;
		mentions.push({ start, end: start + label.length, id });
		offset += label.length - token.length;
		return label;
	});
	return { text, mentions };
}

/** Replaces a text range. Keeps ids for mentions outside the changed range. */
export function replaceEditorText(
	editor: EditorNote,
	start: number,
	end: number,
	replacement: string,
	task?: { id: string; title: string }
): EditorNote {
	const shift = replacement.length - (end - start);
	const mentions = editor.mentions.flatMap((mention) => {
		if (mention.end <= start) return [mention];
		if (mention.start >= end) {
			return [{ ...mention, start: mention.start + shift, end: mention.end + shift }];
		}
		return [];
	});
	if (task) {
		mentions.push({ start, end: start + `@[${task.title}]`.length, id: task.id });
	}
	return {
		text: editor.text.slice(0, start) + replacement + editor.text.slice(end),
		mentions
	};
}

/**
 * Converts editor text to stored tokens. A known text range keeps its id.
 * A typed title becomes a token only when exactly one task has that title.
 */
export function fromEditorText(
	text: string,
	mentions: readonly EditorMention[],
	tasks: readonly { id: string; title: string }[]
): string {
	return text.replace(/@\[([^\]]+)\]/g, (raw, title: string, index: number) => {
		if (title.startsWith('task:')) return raw;
		const known = mentions.find(
			(mention) => mention.start === index && mention.end === index + raw.length
		);
		if (known) return mentionToken(known.id);
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
