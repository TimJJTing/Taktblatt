/** Returns a new random id. */
export function createId(): string {
	return crypto.randomUUID();
}
