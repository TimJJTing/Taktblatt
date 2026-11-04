/**
 * The paginator. It puts measured blocks on fixed sheets. It does not use Svelte or the DOM.
 * Refer to docs/spec.md, section 7, and ADR 2.
 *
 * A plan is a list of segments. A segment is one block that can split between its items:
 * the Gantt (items: rows), a stage table (items: rows), the stage cards (items: card rows),
 * the remarks (items: rows of sections), or a single block such as the header (one item).
 * The paginator splits a segment only between items. It never splits an item.
 */

export interface SegmentInput {
	/** A stable id for the segment. The renderer uses it to find the segment again. */
	id: string;
	/** The height of the blocks above the repeat header. They show on the first fragment only. */
	lead: number;
	/** The height of the header that repeats on every fragment (month header, table header). */
	repeat: number;
	/** The height of the blocks below the repeat header. They show on the first fragment only. */
	extra: number;
	/** The heights of the items. The paginator never splits an item. */
	items: readonly number[];
	/**
	 * The number of items that stay with the lead on the first fragment.
	 * This stops an orphan header. The paginator limits it to the number of items.
	 */
	keep: number;
	/** The space above the first fragment. It does not apply at the top of a sheet. */
	gap: number;
	/** Start the segment on a new sheet. */
	breakBefore: boolean;
}

/** A part of a segment on one sheet. */
export interface Fragment {
	/** The index of the segment in the input. */
	segment: number;
	id: string;
	/** The items from `from` (included) to `to` (not included). */
	from: number;
	to: number;
	/** True for the first fragment of the segment. It shows the lead and the extra blocks. */
	first: boolean;
	/** The space above the fragment. It is 0 at the top of a sheet. */
	gap: number;
}

export interface Sheet {
	/** The sheet number, from 1. */
	number: number;
	fragments: Fragment[];
}

/** The height of the head of a fragment. */
const headHeight = (segment: SegmentInput, first: boolean) =>
	first ? segment.lead + segment.repeat + segment.extra : segment.repeat;

/**
 * Puts the segments on sheets.
 * A sheet has `contentHeight` of space. A block that is taller than a sheet gets a sheet for itself
 * and overflows. The result always has one sheet or more.
 */
export function paginate(contentHeight: number, segments: readonly SegmentInput[]): Sheet[] {
	const sheets: Sheet[] = [{ number: 1, fragments: [] }];
	let used = 0;

	const newSheet = () => {
		sheets.push({ number: sheets.length + 1, fragments: [] });
		used = 0;
	};

	segments.forEach((segment, index) => {
		if (segment.breakBefore && used > 0) newSheet();
		const count = segment.items.length;
		const keep = Math.min(Math.max(segment.keep, count > 0 ? 1 : 0), count);
		let at = 0;
		let first = true;
		// A fragment that fits no item moves to the next sheet one time. On an empty sheet, it overflows.
		for (;;) {
			const head = headHeight(segment, first);
			const gap = used > 0 && first ? segment.gap : 0;
			const space = contentHeight - used - gap - head;
			let fit = 0;
			let total = 0;
			while (at + fit < count && total + segment.items[at + fit] <= space) {
				total += segment.items[at + fit];
				fit += 1;
			}
			const needed = first ? keep : Math.min(1, count - at);
			const fits = fit >= needed && (count > 0 || space >= 0);
			if (!fits && used > 0) {
				newSheet();
				continue;
			}
			if (!fits) {
				// The sheet is empty and the block is still too tall. Place the minimum and overflow.
				fit = Math.max(fit, needed);
				total = segment.items.slice(at, at + fit).reduce((sum, h) => sum + h, 0);
			}
			sheets[sheets.length - 1].fragments.push({
				segment: index,
				id: segment.id,
				from: at,
				to: at + fit,
				first,
				gap
			});
			used += gap + head + total;
			at += fit;
			first = false;
			if (at >= count) break;
			newSheet();
		}
	});

	return sheets;
}
