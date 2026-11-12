import type { TaskIndex } from '#lib/domain/derive.ts';

// Stub: slice 4 implementation pending.
export class RouteFocusState {
	lastPointerType: string | null = null;

	resolve(_detailsTaskId: string | null = null): string | null {
		void _detailsTaskId;
		return null;
	}
	hoverEnter(_id: string, _token: string, _pointerType = 'mouse'): void {
		void [_id, _token, _pointerType];
	}
	hoverLeave(_token: string, _pointerType = 'mouse'): void {
		void [_token, _pointerType];
	}
	focusEnter(_id: string, _token: string, _cause: 'keyboard' | 'pointer'): void {
		void [_id, _token, _cause];
	}
	focusLeave(_token: string): void {
		void _token;
	}
	toggleTouch(_id: string, _token: string): void {
		void [_id, _token];
	}
	clearPointer(): void {}
	reconcile(_index: TaskIndex, _rowIds: ReadonlySet<string>): void {
		void [_index, _rowIds];
	}
	reset(_planId: string): void {
		void _planId;
	}
	dispose(): void {}
}
