export function svgPolyline(points: readonly { x: number; y: number }[]): string {
	return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
}
