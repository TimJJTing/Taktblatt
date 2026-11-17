export class MinHeap<T> {
	private readonly entries: T[] = [];
	private readonly before: (a: T, b: T) => boolean;

	constructor(before: (a: T, b: T) => boolean) {
		this.before = before;
	}

	get length(): number {
		return this.entries.length;
	}

	push(entry: T): void {
		const { entries, before } = this;
		let index = entries.length;
		entries.push(entry);
		while (index) {
			const parent = Math.floor((index - 1) / 2);
			if (!before(entry, entries[parent])) break;
			entries[index] = entries[parent];
			index = parent;
		}
		entries[index] = entry;
	}

	pop(): T | undefined {
		const { entries, before } = this;
		const first = entries[0],
			last = entries.pop()!;
		if (entries.length) {
			let index = 0;
			while (index * 2 + 1 < entries.length) {
				let child = index * 2 + 1;
				if (child + 1 < entries.length && before(entries[child + 1], entries[child])) child++;
				if (!before(entries[child], last)) break;
				entries[index] = entries[child];
				index = child;
			}
			entries[index] = last;
		}
		return first;
	}
}
