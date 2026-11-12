/** Place the tag from date fractions and widths in CSS pixels. */
export function todayTagPlacement(
	today: number | null,
	milestones: readonly number[],
	chartWidth: number,
	tagWidth: number
): { side: 'left' | 'right' | 'hidden'; offset: number } {
	if (today === null || today < 0 || today > 1) return { side: 'hidden', offset: 0 };
	const position = today * chartWidth;
	const distances = milestones.map((milestone) => (milestone - today) * chartWidth);
	let leftEdge = -4;
	let rightOffset = 4;
	for (const distance of distances) {
		if (distance - 7 < 0 && distance + 7 > 0) {
			leftEdge = Math.min(leftEdge, distance - 7);
			rightOffset = Math.max(rightOffset, distance + 7);
		}
	}
	const leftOffset = leftEdge - tagWidth;
	const leftFits = position + leftOffset >= 0;
	const rightFits = position + rightOffset + tagWidth <= chartWidth;
	const overlaps = distances.some((distance) => {
		// Signs extend 7 px on each side. The default tag gap is 4 px.
		return distance + 7 > 0 && distance - 7 < tagWidth + 4;
	});
	const side = (overlaps || !rightFits) && leftFits ? 'left' : 'right';
	const offset = side === 'left' ? leftOffset : rightOffset;
	return {
		side,
		offset: Math.max(-position, Math.min(offset, chartWidth - position - tagWidth))
	};
}
