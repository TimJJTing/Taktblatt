import type { TaskStatus } from '#lib/domain/schema.ts';

/** The task id stays the same in every diagram. */
export type SceneId = string;

/** A length resolves as f * extent + px. */
export interface Len {
	f: number;
	px: number;
}

export interface Pt {
	x: Len;
	y: Len;
}

export interface SceneNode {
	id: SceneId;
	stageId: string;
	status: TaskStatus;
}

export interface NodeGeom {
	id: SceneId;
	x: Len;
	y: Len;
	w: Len;
	h: Len;
	radius: number;
}

export interface EdgeRef {
	key: string;
	from: SceneId;
	to: SceneId;
	cycle: boolean;
}

export interface EdgeGeom extends EdgeRef {
	trunk: string;
	points: Pt[];
}

export interface Junction {
	key: string;
	trunk: string;
	point: Pt;
}

export interface Scene {
	view: string;
	nodes: readonly SceneNode[];
	edges: readonly EdgeRef[];
	geometry: {
		nodes: readonly NodeGeom[];
		edges: readonly EdgeGeom[];
		junctions: readonly Junction[];
	};
	/** Vertical split positions for pagination, in pixels. */
	breaks: readonly number[];
}

/** Ports and spans are resolved pixels at the current layout size. */
export interface Track {
	id: SceneId;
	center: number;
	half: number;
	span: readonly [number, number] | null;
	inX: number;
	outX: number;
}

export interface RouteMetrics {
	width: number;
	rows: number;
	top: number;
	rowHeight: number;
	barHalf: number;
	dotR: number;
	stub: number;
	pitch: number;
	minSeg: number;
	clearance: number;
	endZone: number;
	slots: number;
}

/** Diagnostics stay outside the geometry consumed by renderers. */
export interface RouteDebug {
	key: string;
	variant: 'forward' | 'direct' | 'hook';
	slot: number;
	lane: number;
	overflow: boolean;
}

export interface RouteResult {
	edges: EdgeGeom[];
	junctions: Junction[];
	debug: RouteDebug[];
}
