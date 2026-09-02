import { writable } from 'svelte/store';
import type { CardKind } from '$lib/util/dragGrid';

// Visual feedback during a drag session.
//
//   - dragSource: { id, kind } of the card currently being dragged. Set
//                 the moment the drag is "lifted" (cursor moved past
//                 LIFT_THRESHOLD_PX); cleared when the gesture ends.
//   - mergeCandidate: set whenever the cursor's drop intent on a target
//                     would be a merge. Card.svelte uses this to render
//                     the `.merge-armed` (faint) or `.merge-ready`
//                     (full) halo on the target Card cell.
//   - cellShifts: per-card translation in pixels driven by reorder
//                 preview. Card.svelte applies these as
//                 `transform: translate(dx px, dy px)` on the cell.
//                 An entry of {dx:0,dy:0} or no entry means no shift.

export type MergePhase = 'armed' | 'ready';

export interface MergeCandidate {
  id: number;
  kind: CardKind;
  phase: MergePhase;
}

export interface DragSourceMeta {
  id: number;
  kind: CardKind;
}

export const dragSource = writable<DragSourceMeta | null>(null);
export const mergeCandidate = writable<MergeCandidate | null>(null);
export const cellShifts = writable<Map<number, { dx: number; dy: number }>>(new Map());
