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
	// Stub: slice 4 implementation pending.
	edges?: readonly string[];
	key: string;
	trunk: string;
	point: Pt;
	kind: 'junction' | 'tap';
	/** Only taps name the source track that owns the mark. */
	source?: SceneId;
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
	/** Actual radii after clipping or shrinking each port. */
	inR: number;
	outR: number;
}

/** Resolved layout values and fixed routing distances. */
export interface RouteMetrics {
	width: number;
	/** Adapter input: the number of body rows. */
	rows: number;
	/** Adapter input: the body offset in pixels. */
	top: number;
	rowHeight: number;
	/** Adapter input: half the bar height in pixels. */
	barHalf: number;
	/** Adapter input: the port dot radius in pixels. */
	dotR: number;
	/** The outer radius of a junction ring. */
	ringR: number;
	stub: number;
	pitch: number;
	minSeg: number;
	/** Required bar clearance. Tests check this invariant. */
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
