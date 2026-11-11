interface Extent {
	client: number;
	scroll: number;
}
interface Track extends Extent {
	track: number;
}
const clamp = (value: number, max: number) => Math.max(0, Math.min(value, Math.max(0, max)));

export function thumbMetrics({
	client,
	scroll,
	track,
	min,
	position
}: Track & { min: number; position: number }) {
	if (scroll <= client || client <= 0 || track <= 0) return null;
	const size = Math.min(track, Math.max(min, (track * client) / scroll));
	return { size, offset: (clamp(position, scroll - client) / (scroll - client)) * (track - size) };
}

export function positionFromThumb({
	client,
	scroll,
	track,
	size,
	offset
}: Track & { size: number; offset: number }) {
	return track <= size
		? 0
		: (clamp(offset, track - size) / (track - size)) * Math.max(0, scroll - client);
}
