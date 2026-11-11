/** Place the tag from date fractions and widths in CSS pixels. */
export function todayTagPlacement(
	today: number | null,
	milestones: readonly number[],
	chartWidth: number,
	tagWidth: number
): { side: 'left' | 'right' | 'hidden'; offset: number } {
	if (today === null || today < 0 || today > 1) return { side: 'hidden', offset: 0 };
	const position = today * chartWidth;
	const leftOffset = -tagWidth - 4;
	const leftFits = position + leftOffset >= 0;
	const rightFits = position + 4 + tagWidth <= chartWidth;
	const overlaps = milestones.some((milestone) => {
		const distance = (milestone - today) * chartWidth;
		// Signs extend 7 px on each side. The tag starts 4 px from the line.
		return distance + 7 > 0 && distance - 7 < tagWidth + 4;
	});
	const side = (overlaps || !rightFits) && leftFits ? 'left' : 'right';
	const offset = side === 'left' ? leftOffset : 4;
	return {
		side,
		offset: Math.max(-position, Math.min(offset, chartWidth - position - tagWidth))
	};
}
