// Visual stores for the LaunchPad drag interaction.
//
// The actual hit-testing / dwell / clone-following logic lives in
// `$lib/util/dragGrid.ts` (a Svelte action attached to the grid
// container). This file is now just a pair of stores the action writes
// to and consumers read from for visual feedback.
//
//   - dragSource:     set on lift, cleared on drop. Useful for cursor
//                     theming (`grabbing`) and disabling stray clicks.
//   - mergeCandidate: set whenever the cursor's drop intent on a target
//                     is `merge`; cleared otherwise. Used to apply the
//                     `.merge-target` halo on the target Card cell.

import { writable } from 'svelte/store';

export interface DragSource {
  id: number;
  kind: 'folder' | 'item';
}

export interface MergeCandidate {
  id: number;
  kind: 'folder' | 'item';
}

export const dragSource = writable<DragSource | null>(null);
export const mergeCandidate = writable<MergeCandidate | null>(null);
