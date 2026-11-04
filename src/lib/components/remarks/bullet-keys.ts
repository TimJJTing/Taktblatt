/**
 * Stable UI keys for the bullets of a remark section.
 * A key follows its bullet when the list shifts, for example after a change from another tab.
 */

let counter = 0;

/** A new unique key. */
export function newBulletKey(): string {
	return `k${++counter}`;
}

/**
 * Gives each bullet of `next` a key. Bullets at the start and at the end of the list keep their keys.
 * In the middle, a bullet keeps its key when the text is the same, or when only one text changed.
 */
export function reconcileKeys(
	prevTexts: readonly string[],
	prevKeys: readonly string[],
	next: readonly string[]
): string[] {
	let head = 0;
	while (head < prevTexts.length && head < next.length && prevTexts[head] === next[head]) head++;
	let tail = 0;
	while (
		tail < prevTexts.length - head &&
		tail < next.length - head &&
		prevTexts[prevTexts.length - 1 - tail] === next[next.length - 1 - tail]
	)
		tail++;

	const keys = prevKeys.slice(0, head);
	const prevMid = prevTexts.length - head - tail;
	const nextMid = next.length - head - tail;
	if (prevMid === nextMid) {
		// The same count: the bullets are edited in place.
		keys.push(...prevKeys.slice(head, head + prevMid));
	} else {
		const free = prevTexts
			.map((text, i) => ({ text, key: prevKeys[i] }))
			.slice(head, head + prevMid);
		for (let i = head; i < head + nextMid; i++) {
			const found = free.findIndex((item) => item.text === next[i]);
			keys.push(found >= 0 ? free.splice(found, 1)[0].key : newBulletKey());
		}
	}
	keys.push(...prevKeys.slice(prevKeys.length - tail));
	return keys;
}
