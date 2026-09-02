# Launchpad Drag Merge / Reorder Disambiguation — Design

**Status**: Approved 2026-05-26
**Scope**: Make Launchpad jiggle-mode drag behavior match macOS Launchpad on
two axes:
1. Item-on-item folder creation requires a deliberate **dwell** (cursor
   pause), not the current instant geometric trigger.
2. Surrounding cards **shift to make a visible gap** at the insertion point
   during reorder, on both root grid and folder panel, including cross-zone
   drags.

The previous Launchpad foundation is in
[2026-05-21-launchpad-unify-design.md](2026-05-21-launchpad-unify-design.md).
This spec is purely a UX refinement of that foundation. No data model, no
API surface changes.

This document is the design contract. The implementation plan and tasks
are produced separately by `writing-plans`.

---

## 1. Goals

1. A user dragging a card across the grid **never** accidentally creates a
   folder. Quick movement is unambiguously reorder.
2. A user **can** create a folder by dragging a card directly on top of
   another card and **pausing** for ~600 ms. Two-stage halo gives feedback
   that the merge is being armed.
3. During reorder, neighboring cards visibly shift to **open the slot**
   the dragged card would land in if released. The user has at-a-glance
   confirmation of the drop position.
4. The same shift-to-make-room animation applies inside an open folder
   panel, and across zones (drag from root into folder panel, drag from
   folder panel out to root).
5. Folder targets keep their existing behavior: instant merge on drop,
   plus 500 ms hover dwell to spring-load (open) the panel.

## 2. Non-goals

- Visual rework of jiggle (wobble) animation. Existing `@keyframes
  jiggle-shake` stays.
- Edge-pan tuning. Existing `EDGE_PAN_*` constants stay.
- Touch-specific gesture changes. Pointer Events already unify; the new
  behavior is identical on mouse and touch.
- Folder-in-folder nesting. Still forbidden (matches the unify design).
- Search-mode drag. Search still disables drag entirely.

## 3. User-facing behavior

### 3.1 Reorder (the common case)

While dragging, surrounding cards in the **hover zone** (root grid OR an
open folder panel) animate to open a slot at the insertion point. The
slot location follows the cursor's position relative to the target card:

- Cursor on the **left half** of a card → slot opens to its left.
- Cursor on the **right half** → slot opens to its right.
- Cursor outside any card but inside a zone → slot opens at the end of
  that zone.

The dragged card's source slot is rendered as an **empty placeholder**
(opacity 0) so the gap is visible there too. Cards between the source
and the cursor's target slot translate by exactly one cell-step toward
the source, animated with a 220 ms `cubic-bezier(0.4, 0, 0.2, 1)`
transition on `transform`.

Releasing the cursor commits the visible insertion: drop position equals
the slot the gap is currently occupying.

### 3.2 Merge (deliberate folder creation)

The merge gate is two-stage and time-based. Letting the cursor enter
inner 50 % of an item card alone is **not enough** to merge: the cursor
must stay there.

Timeline from the moment the cursor first enters the inner 50 % of an
item target T (call this `t=0`):

1. **0 ≤ t < 200 ms**: No visual change. Reorder shifts continue to
   compute against a "would-be before/after" insertion based on cursor
   side, so cards keep flowing. Releasing here commits **reorder** by
   cursor side, not merge.
2. **t = 200 ms** (`MERGE_ARM_MS`), cursor still inside T's merge zone
   and total displacement from `t=0` cursor < 8 px (`MERGE_CANCEL_MOVE_PX`):
   - Reorder shifts in this zone **collapse** back to neutral
     (cards animate back to their logical slots).
   - T enters **`merge-armed`** state: 2 px halo at 50 % accent opacity,
     scale 1.02. From this point onward, releasing **commits merge**.
3. **t = 600 ms** (`MERGE_READY_MS`): T promotes to **`merge-ready`**:
   4 px halo at full accent, scale 1.06 (existing visual). Functionally
   identical to `merge-armed` for drop commit; this state is purely a
   stronger visual cue.
4. Cursor exits T's merge zone OR moves > 8 px from arm-start position
   before t = 200 ms: timers cancel. No visible state was shown, so
   nothing to clean up. Reorder shifts continue without interruption.
5. Cursor exits T's merge zone after t ≥ 200 ms (i.e. after armed
   appeared): timers cancel; merge-armed/ready clears; reorder shifts
   re-apply for the new cursor position.
6. Cursor moves to a **different** item's merge zone: prior target's
   timers cancel, new target's timers start fresh from t = 0.

### 3.3 Folder targets

Behavior unchanged from current implementation:
- Cursor entering inner 50 % of a `folder` card sets `merge` intent
  immediately (no dwell required for the merge itself — folders absorb
  by nature).
- Cursor remaining there for 500 ms (`HOVER_DWELL_MS`) triggers
  spring-load: the folder panel opens, allowing drop into its grid.
- Releasing on the folder body: source becomes a child of that folder.

The single new visual: while `merge` is active on a folder target, that
target's halo also uses the two-tier `armed → ready` progression
(consistent visual vocabulary), but both tiers fire near-instantly
since there is no dwell gate. In practice the user only sees `ready`.

### 3.4 Cross-zone drags

Cross-zone drag (root → folder panel, folder panel → root; folder ↔
folder is not possible because nesting is forbidden) shows shifts in
**both** zones simultaneously, matching macOS Launchpad:

- **Source zone**: source's slot visually closes. All cards with
  `logicalIdx > srcIdx` translate toward srcIdx by one cell-step, so
  the source zone appears continuous with no gap. (The source cell
  itself remains in its DOM slot at opacity 0 / pointer-events none —
  the visible "close" is achieved by translating its successors.)
- **Target zone**: cards from the cursor's insertion slot onward
  translate forward by one cell-step, opening a slot at `dropIdx`.

Released into target zone: server commit renumbers both zones; the
animations smoothly resolve into the new logical positions.

If the cursor returns to the source zone before release, the source
zone's "close" reverses (cards animate back to their original slots),
so the gap re-opens at srcIdx and the source zone treats this as a
same-zone reorder per §3.1.

### 3.5 Folder source

A `folder` source can never become a merge target's child (no nesting).
On root grid, dragging a folder shows reorder shifts only. On any
attempt to merge a folder onto another card, the gesture falls through
to `before/after` reorder (existing handleDrop logic).

## 4. Architecture

### 4.1 Data structures

#### LayoutCache (per drag session)

```ts
interface SlotRect {
  zone: string;          // 'root' | `folder:${id}`
  logicalIdx: number;
  rect: DOMRect;         // pixel rect of this slot
}
interface LayoutCache {
  byZone: Map<string, SlotRect[]>;     // sorted by logicalIdx
  byCardId: Map<number, { zone: string; logicalIdx: number; rect: DOMRect }>;
  cellSize: { w: number; h: number };  // for sanity, debug
  cellAdvance: Map<string, { dx: number; dy: number }>;  // per-zone next-slot vector
}
```

Built at lift time by walking every `[data-card-id]` element inside the
`dragGrid` node. Source's logical idx is stored separately on the
`DragSession`.

**Invalidation**: rebuild on any of:
- `onSpringLoad` callback fires (new folder cells appear)
- `onEdgePan` callback fires (page changes; root grid swaps content)
- `window` resize during drag (rare, defensive)

#### cellShifts store

```ts
// New store, sibling of mergeCandidate / dragSource in $lib/stores/dragMerge.ts
export const cellShifts = writable<Map<number, { dx: number; dy: number }>>(new Map());
```

Cleared at session start and at session end. Updated each tick.

#### mergeCandidate phase

```ts
// Replaces existing MergeCandidate type
export type MergePhase = 'armed' | 'ready';
export interface MergeCandidate {
  id: number;
  kind: CardKind;
  phase: MergePhase;
}
```

### 4.2 Drag session state machine

State additions on top of current `DragSession`:

```ts
interface DragSession {
  // … existing fields (sourceCell, source, cursorX/Y, lifted, clone, …)
  layoutCache: LayoutCache | null;          // null until lifted
  sourceLogicalIdx: number;                 // populated at lift
  mergeArmTimer: ReturnType<typeof setTimeout> | null;
  mergeReadyTimer: ReturnType<typeof setTimeout> | null;
  mergeArmTargetId: number | null;          // currently arming this id; null when no merge candidate
  mergeArmStartX: number;                   // cursor position when arming started (t=0)
  mergeArmStartY: number;
  mergeArmFired: boolean;                   // true once t≥200ms reached; persists through ready and is
                                            // the gate that flips drop semantics from reorder→merge
  // existing dwellTimer/dwellTargetId for spring-load stays separate
}
```

### 4.3 Hit-test

**Continues to use live `elementsFromPoint`** (post-shift). Rationale:

- Cards visibly at position P are the cards the user expects to interact
  with at position P. Caching pre-shift rects would create a mismatch
  where the user sees card A at the cursor but the system reports card B.
- The original code comment on `dragGrid.ts:5-12` argued that FLIP
  shifting "actively defeats dwell". That argument applies to libraries
  that **shift the target itself away from the cursor**. Our shift rule
  (4.4) explicitly does not move the target during merge arming — once
  arming starts on a target, all shifts in that zone collapse and the
  target stays put for the full dwell window.

So no change to `computeHover` other than enriching the result with the
target's `logicalIdx` (looked up in `LayoutCache.byCardId`).

### 4.4 Shift computation

Run every rAF tick after hit-test. Inputs: source's zone + logicalIdx,
target's zone + logicalIdx (or null), intent (`before` | `after` |
`merge`), and `mergeArmFired` flag.

#### Step 1: determine `dropIdx` per zone

```
// Collapse all shifts when the merge gate is active. This covers:
//   - item target: armed (mergeArmFired=true) or ready
//   - folder target: instant-merge (treated as immediately ready)
let mergeActive := (intent == 'merge' AND target != null AND
                    (target.kind == 'folder' OR session.mergeArmFired))
if mergeActive:
   shifts := empty   // cards collapse; halo on target is the only feedback
   return

let targetZone := target.zone if target else hoverZone
if !targetZone:
   shifts := empty
   return

let bucket := layoutCache.byZone[targetZone]

// Note: when intent == 'merge' on an item target but mergeArmFired is
// false (cursor is in merge zone but the 200ms gate has not fired),
// fall through to side-based classification — keep showing reorder
// preview by cursor side. This avoids flicker when the cursor brushes
// through card centers without stopping.
let effectiveIntent := if (intent == 'merge' AND target != null
                            AND target.kind == 'item'
                            AND !session.mergeArmFired)
                       then (cursorOnLeftHalfOf(target) ? 'before' : 'after')
                       else intent

if target == null:
   dropIdx := bucket.length  // append at end
else if effectiveIntent == 'before':
   dropIdx := target.logicalIdx
else if effectiveIntent == 'after':
   dropIdx := target.logicalIdx + 1
```

#### Step 2: compute each card's display index

For same-zone (sourceZone == targetZone):

```
let srcIdx := session.sourceLogicalIdx

for each card c in bucket:
  if c.cardId == source.id:
     // source is hidden; no shift on it
     continue
  let i := c.logicalIdx
  let newIdx :=
    if srcIdx < dropIdx and srcIdx < i <= dropIdx - 1: i - 1
    else if dropIdx <= i < srcIdx: i + 1
    else: i
  shifts[c.cardId] := slotPos(newIdx) - slotPos(i)
```

For cross-zone (sourceZone != targetZone):

```
// Source zone: visually close the gap at srcIdx by shifting all cards
// with logicalIdx > srcIdx one slot toward srcIdx. Source cell itself
// stays in its DOM slot at opacity 0, so the visible result is "no gap".
let srcBucket := layoutCache.byZone[sourceZone]
let srcIdx := session.sourceLogicalIdx
for each card c in srcBucket:
  if c.cardId == source.id: continue
  let i := c.logicalIdx
  let newIdx := if i > srcIdx: i - 1 else: i
  shifts[c.cardId] := slotPos(sourceZone, newIdx) - slotPos(sourceZone, i)

// Target zone: open a slot at dropIdx by shifting cards with logicalIdx
// >= dropIdx one slot forward.
let tgtBucket := layoutCache.byZone[targetZone]
for each card c in tgtBucket:
  let i := c.logicalIdx
  let newIdx := if i >= dropIdx: i + 1 else: i
  shifts[c.cardId] := slotPos(targetZone, newIdx) - slotPos(targetZone, i)
```

If the cursor crosses **back** into the source zone (now treated as a
same-zone drag again), the cross-zone branch isn't taken: same-zone
math applies and the source zone's "close" naturally reverses (each
card's `newIdx` returns to its `logicalIdx` since target == source
zone with cursor not pointing at any same-zone insertion further than
srcIdx).

`slotPos(idx)` returns the upper-left of slot idx in the zone, looked up
from `layoutCache.byZone[zone][idx].rect`.

`cellAdvance(zone)` is the per-step displacement vector between two
consecutive slot rects, derived from the zone's first two cached rects
(or, if only one slot exists, falls back to `cellSize.w` along the row
axis). Used when extrapolating beyond the cached array — for example
when `newIdx === bucket.length` (the dragged source is being appended
to the end of a non-empty zone): the slot at index `bucket.length`
doesn't exist in the snapshot, so we compute it as
`slotPos(bucket.length - 1) + cellAdvance`. For empty zones (target zone
contains no other cards), the slot rect is the zone container's
content origin (top-left of the zone's first row).

#### Step 3: write to store

```ts
cellShifts.set(new Map(allShifts));
```

CSS transition on Card.svelte handles the smooth animation.

### 4.5 Dwell state machine (item targets only)

Triggered by `applyHover` when `intent === 'merge' && target.kind === 'item'`:

```
on enter merge zone of an item target T (target.id !== mergeArmTargetId,
or first entry):
  cancel existing arm/ready timers and clear mergeCandidate
  mergeArmTargetId := T.id
  mergeArmFired := false
  mergeArmStartX, Y := current cursor X, Y
  start mergeArmTimer (200 ms) →
    if cursor still hovering same T's merge zone AND
       displacement from (startX, startY) ≤ MERGE_CANCEL_MOVE_PX:
       mergeArmFired := true
       mergeCandidate := { id: T.id, kind: 'item', phase: 'armed' }
       (rAF tick will recompute shifts; with mergeArmFired=true they collapse)
    else: cancel arming (timer fired but cursor moved away — same as cancel)
  start mergeReadyTimer (600 ms) →
    if mergeArmFired (still on same target):
       mergeCandidate := { id: T.id, kind: 'item', phase: 'ready' }
    else: no-op (arming was cancelled or pre-empted)

on each tick while arming (mergeArmTargetId !== null):
  if intent != 'merge' OR target?.id != mergeArmTargetId:
     cancel arming
  else if NOT mergeArmFired AND
          Math.hypot(cursorX - mergeArmStartX, cursorY - mergeArmStartY) > MERGE_CANCEL_MOVE_PX:
     cancel arming  // jittered before arm timer fired; restart on next entry
  // Note: once mergeArmFired is true, jitter is allowed. Cursor staying in
  // merge zone is the only requirement to remain armed.

on cancel arming:
  clear arm/ready timers
  mergeArmTargetId := null
  mergeArmFired := false
  mergeCandidate := null
```

**Re-entering the same target**: if the cursor leaves T's merge zone,
arming cancels (above). When the cursor re-enters T (or any item),
arming restarts from t = 0. This means a user who briefly slides past T
and comes back must hold for another full 200 ms to see armed.

**Folder targets** (`kind === 'folder'`): skip the dwell entirely. On
entering merge zone, set:
```
mergeArmTargetId := T.id
mergeArmFired := true
mergeCandidate := { id: T.id, kind: 'folder', phase: 'ready' }
```
(plus the existing `HOVER_DWELL_MS = 500` spring-load timer fires
independently to open the folder panel.)

### 4.6 Drop commit (`finish` → `onDrop`)

The `DragDropInfo` passed to `onDrop` carries the **resolved** intent,
not the raw geometric one:

```ts
function resolveFinalIntent(session: DragSession): DropIntent {
  const t = session.hover.target;
  // Merge gate: armed/ready on item, or any folder target with merge intent.
  if (session.mergeArmFired && t) return 'merge';
  // Item target inside merge zone but arm never fired: fall back to side.
  if (session.hover.intent === 'merge' && t && t.kind === 'item') {
    const r = session.layoutCache?.byCardId.get(t.id);
    return cursorOnLeftHalfOfSlot(r, session.cursorX) ? 'before' : 'after';
  }
  return session.hover.intent ?? 'after';
}
```

So an item target where merge arm never fired → falls back to
before/after by cursor side. This is the central rule.

`+page.svelte` `handleDrop` then operates exactly as today: branch 1
(merge → autoFolder/patchCard) only fires if `info.intent === 'merge'`.
No logic change in handleDrop itself.

## 5. Constants

```ts
// dragGrid.ts (new + modified)
const MERGE_INNER_FRACTION = 0.5;     // was 0.6 — tighter zone since dwell-gated
const MERGE_ARM_MS = 200;             // armed halo appears
const MERGE_READY_MS = 600;           // total dwell to lock merge
const MERGE_CANCEL_MOVE_PX = 8;       // jitter tolerance during arming
const SHIFT_DURATION_MS = 220;        // CSS transition
const SHIFT_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

// Unchanged
const LIFT_THRESHOLD_PX = 5;
const HOVER_DWELL_MS = 500;           // spring-load (folder panel open)
const EDGE_PAN_THRESHOLD_PX = 80;
const EDGE_PAN_DWELL_MS = 600;
const EDGE_PAN_INTERVAL_MS = 800;
const CLONE_OPACITY = 0.88;
const CLONE_LIFT_SCALE = 1.05;
```

## 6. CSS / visual changes

`web/src/lib/components/Nav/Card.svelte`:

```scss
/* New: hide source cell during drag */
.cell[data-dragging='true'] {
  opacity: 0;
  pointer-events: none;
}

/* New: shift transitions */
.cell {
  transition: transform var(--shift-duration, 220ms) cubic-bezier(0.4, 0, 0.2, 1);
}

/* Renamed: existing .merge-target → .merge-ready */
.cell.merge-armed .card,
.cell.merge-armed .folder {
  box-shadow: 0 0 0 2px rgba(74, 108, 247, 0.5);
  transform: scale(1.02);
  transition:
    box-shadow 0.15s ease,
    transform 0.15s ease;
}
.cell.merge-ready .card,
.cell.merge-ready .folder {
  box-shadow:
    0 0 0 4px var(--c-accent, #4a6cf7),
    0 0 22px rgba(74, 108, 247, 0.55);
  transform: scale(1.06);
  transition:
    box-shadow 0.15s ease,
    transform 0.15s ease;
}
```

The cell has both a transform from `cellShifts` (positional) and a scale
from merge state (visual). These compose because:
- `.cell` element receives `transform: translate(dx, dy)` (positional)
- `.card` / `.folder` inner element receives `transform: scale(...)` (visual)

So they don't fight each other. (Same pattern as existing jiggle: outer
cell handles position, inner card/folder handles wobble.)

## 7. File changes summary

| File | Change | Lines (approx) |
|------|--------|----------------|
| `web/src/lib/util/dragGrid.ts` | Major: layout cache, dwell state machine, shift compute, drop intent override | +180 / -30 |
| `web/src/lib/stores/dragMerge.ts` | Add `phase` to `MergeCandidate`; add `cellShifts` store | +25 |
| `web/src/lib/components/Nav/Card.svelte` | Subscribe to `cellShifts`, apply translate transform; rename `.merge-target` to `.merge-ready`; add `.merge-armed`; CSS for `[data-dragging]` invisibility | +20 / -2 |
| `web/src/routes/+page.svelte` | Pass `onLayoutChange` callback (rebuilds cache after spring-load / edge-pan) | +5 |
| `web/src/lib/components/Nav/InlineFolderExpand.svelte` | None expected — zone container already has `[data-zone]` and contains Card.svelte cells | 0 |

## 8. Risk and mitigation

| Risk | Mitigation |
|------|-----------|
| Shift transitions interrupt mid-flight on rapid cursor movement | CSS `transition: transform` handles interruption gracefully (smooth retarget). No JS animation manager needed. |
| Layout cache stale after spring-load (folder panel adds cells) | `+page.svelte`'s `onSpringLoad` now also calls `rebuildLayoutCache` exposed by `dragGrid`. |
| Layout cache stale after edge-pan (root content swaps to next page) | Same — `onEdgePan` rebuilds cache. |
| `slotPos(idx)` for `idx >= bucket.length` (drop at end of zone) | Extrapolate: `slotPos(N-1) + cellAdvance`, where `cellAdvance` is the per-step displacement derived from the first 2 slot rects. For empty zone, place at zone container's content origin. |
| Source's hidden cell still steals pointer events | `pointer-events: none` on `[data-dragging='true']` cell. |
| `merge-armed` halo flickers on cursor jitter inside merge zone | `MERGE_CANCEL_MOVE_PX = 8` absorbs natural mouse tremor. |
| Existing `merge-target` class consumers break after rename | Grep: only consumer is `Card.svelte:103` and `Card.svelte:197-198`. Rename is local. No external store reads the class name. |
| Touch / tablet behavior diverges | Pointer Events unify input. Same code path. Existing `touch-action: none` on jiggle cell stays. |

## 9. Testing strategy

### 9.1 Manual verification (golden path)

In browser at `vite dev`, after seeding cards (≥ 6 root items) and entering
jiggle mode (long-press any card):

- [ ] Drag card across row. Surrounding cards visibly shift to make a gap
      following the cursor. No halo on any card during quick movement.
- [ ] Drag card directly on top of another item card and stop. Within
      ~200 ms a faint halo appears on target. Within ~600 ms it fully
      brightens. Release: folder created.
- [ ] Drag card on top of another item, stop briefly (< 600 ms), then move
      away. Halo disappears. Move to between two cards. Release: reorder
      committed at the visible gap.
- [ ] Drag card on top of a folder card. Halo appears immediately (no
      dwell). Release: card becomes child of that folder.
- [ ] Drag card on top of a folder card and hold for 500 ms. Folder panel
      opens (existing spring-load). Release inside panel: card is added
      to that folder at insertion point.
- [ ] Drag card from inside a folder panel out to the root grid. Root
      cards shift to make a gap at insertion point. Release: card moves
      to root.
- [ ] Drag card from inside a folder panel and drop on empty area outside
      any zone (`outOfZone`). Existing behavior: card moves to root end.
- [ ] During drag, source's slot stays visibly empty (gap shown).
- [ ] After releasing, all cards animate to final positions smoothly (no
      jump-and-snap).

### 9.2 Touch verification

Same checklist on a touch device (or Chrome DevTools touch emulation).
Pointer Events should give identical behavior; no separate touch path.

### 9.3 Regression checks

- [ ] Search mode still disables drag entirely.
- [ ] Edge-pan (drag near left/right viewport edge) still pages, and
      after page change cards animate to new layout.
- [ ] Long-press without authentication still no-ops (`jiggleMode.enter`
      gates on `sessionStore.authed`).
- [ ] Click on a card body still navigates (longPress's `consumeNextClick`
      still fires).
- [ ] Folder rename / delete buttons inside cells still work (drag
      cellFromEvent guard `button.card, button.folder` already excludes
      these).

### 9.4 Unit tests

`web/src/lib/util/dragGrid.ts` does not currently have unit tests. The
shift math (`displayIndex` for both same-zone and cross-zone) is pure
and worth testing. New file `dragGrid.test.ts` with cases:

- Same-zone, srcIdx < dropIdx: cards in (srcIdx, dropIdx-1] shift -1.
- Same-zone, srcIdx > dropIdx: cards in [dropIdx, srcIdx) shift +1.
- Same-zone, srcIdx == dropIdx: no shifts.
- Cross-zone: target zone cards in [dropIdx, end) shift +1; source zone
  unchanged during drag.
- Drop at end of zone (target = null, hoverZone = root): dropIdx =
  bucket.length, no shifts in target zone.

`vitest run` in CI (`web/package.json:scripts:test:unit`).

## 10. Rollout

Single PR. No feature flag, no incremental migration. The change is a
pure UX refinement; if reverted, behavior returns to current. Worktree
already isolated (`lens/.worktrees/rust-backend`).

PR title: `feat(launchpad): macos-style drag with dwell-gated merge and shift-to-make-room`

## 11. Open questions / parking lot

(None — addressed during brainstorm.)
