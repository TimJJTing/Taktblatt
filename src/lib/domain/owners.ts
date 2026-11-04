/** Owner names are plain strings. Compare them without case, after trimming. */

export function ownerKey(name: string): string {
	return name.trim().toLocaleLowerCase();
}

/** Trims the names, removes empty names and removes duplicates. The first spelling stays. */
export function normalizeOwners(names: readonly string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const raw of names) {
		const name = raw.trim();
		const key = ownerKey(name);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		result.push(name);
	}
	return result;
}

/** Returns all distinct owners, sorted for suggestions. */
export function allOwners(lists: Iterable<readonly string[]>): string[] {
	const merged: string[] = [];
	for (const list of lists) merged.push(...list);
	return normalizeOwners(merged).sort((a, b) => a.localeCompare(b));
}

/** Replaces `from` with `to` in a list of owners. */
export function renameOwner(names: readonly string[], from: string, to: string): string[] {
	const key = ownerKey(from);
	return normalizeOwners(names.map((name) => (ownerKey(name) === key ? to : name)));
}
