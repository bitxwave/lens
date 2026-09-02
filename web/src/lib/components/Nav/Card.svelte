<script lang="ts">
  import type { Card } from '$lib/types/card';
  import { currentSite } from '$lib/stores/visible';
  import { jiggleMode } from '$lib/stores/jiggle';
  import { t } from '$lib/i18n/store';
  import { longPress } from '$lib/util/longPress';
  import { navDataStore } from '$lib/stores/navData';
  import { deleteCard } from '$lib/api/cards';
  import { toast } from '$lib/components/ui/toast';
  import { mergeCandidate, cellShifts } from '$lib/stores/dragMerge';

  interface Props {
    card: Card;
    /** Folder previews — first 4 children, rendered as the folder tile. */
    folderChildren?: Card[];
    onOpenFolder?: (folderId: number) => void;
    /** Called when user wants to edit this item. */
    onEdit?: (card: Card) => void;
  }
  let { card, folderChildren = [], onOpenFolder, onEdit }: Props = $props();

  const isItem = $derived(card.kind === 'item');
  const isFolder = $derived(card.kind === 'folder');

  const shift = $derived($cellShifts.get(card.id) ?? { dx: 0, dy: 0 });
  const mergePhase = $derived($mergeCandidate?.id === card.id ? $mergeCandidate.phase : null);
  // Jiggle animation delay derived from the card's stable id, NOT its
  // DOM position. Using `:nth-child(3n+2)` style selectors makes
  // `animation-delay` change whenever the grid is reordered (after a
  // drag commit), which snaps each affected card's animation to a new
  // phase — the user sees this as a flicker. Computing the offset
  // from `card.id` keeps each card's wobble continuous across
  // reorders.
  const jiggleDelay = $derived(`${(card.id % 3) * -80}ms`);

  const url = $derived(
    isItem && $currentSite.site && card.links ? (card.links[$currentSite.site.value] ?? null) : null
  );
  // Folder thumbnail: first 4 children.
  const previews = $derived(folderChildren.slice(0, 4));
  const SLOTS = [0, 1, 2, 3];

  function iconSrc(c: Card): string {
    switch (c.iconKind) {
      case 'asset':
        return `/navIcons/${c.iconValue}`;
      case 'url':
        return c.iconValue ?? '';
      case 'auto-favicon':
        return `/api/favicon?host=${encodeURIComponent(c.iconValue ?? '')}`;
      default:
        return '';
    }
  }

  function open() {
    // The trailing click after the long-press that entered jiggle is
    // swallowed in the longPress action itself (capture-phase eater),
    // so by the time `open` runs we know this is either: a tap from
    // outside jiggle, or a deliberate click while already in jiggle.
    if ($jiggleMode) {
      if (isItem) onEdit?.(card);
      else if (isFolder) onOpenFolder?.(card.id);
      return;
    }
    if (isItem && url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else if (isFolder) {
      onOpenFolder?.(card.id);
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if ($jiggleMode) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  }

  function onLongPress() {
    const entered = jiggleMode.enter();
    if (!entered) {
      // Auth-gated: surface a hint so the user knows why nothing happened.
      toast.error($t('home.editMode.signInRequired'));
    }
  }

  async function onDelete(e: MouseEvent) {
    e.stopPropagation();
    if (isFolder) {
      const childCount = folderChildren.length;
      const msg =
        childCount > 0
          ? $t('home.folder.deleteConfirm', { name: card.name, count: childCount })
          : $t('common.deleteConfirmGeneric', { name: card.name });
      if (!window.confirm(msg)) return;
    } else if (!window.confirm($t('common.deleteConfirmGeneric', { name: card.name }))) {
      return;
    }
    try {
      await deleteCard(card.id);
      navDataStore.refetch();
      toast.success($t('common.delete') + ' ✓');
    } catch {
      toast.error($t('error.unknown'));
    }
  }
</script>

<div
  class="cell"
  class:jiggle={$jiggleMode}
  class:merge-armed={mergePhase === 'armed'}
  class:merge-ready={mergePhase === 'ready'}
  data-card-id={card.id}
  data-card-kind={card.kind}
  style:--jiggle-delay={jiggleDelay}
  style:transform={shift.dx === 0 && shift.dy === 0
    ? null
    : `translate(${shift.dx}px, ${shift.dy}px)`}
  use:longPress={{ onTrigger: onLongPress }}
>
  {#if $jiggleMode}
    <button type="button" class="x-btn" aria-label={$t('common.delete')} onclick={onDelete}>
      −
    </button>
  {/if}

  {#if isFolder}
    <button class="folder" type="button" onclick={open} aria-label={card.name}>
      <div class="thumbs">
        {#each SLOTS as i (i)}
          {#if previews[i]}
            <img class="thumb" src={iconSrc(previews[i])} alt="" loading="lazy" draggable="false" />
          {:else}
            <span class="thumb empty" aria-hidden="true"></span>
          {/if}
        {/each}
      </div>
    </button>
  {:else}
    <button
      type="button"
      class="card"
      onclick={open}
      onkeydown={onKeydown}
      ondblclick={() => onEdit?.(card)}
      aria-label={card.name}
      disabled={!url && !$jiggleMode}
    >
      <img class="icon" src={iconSrc(card)} alt="" loading="lazy" draggable="false" />
    </button>
  {/if}

  <span class="label">{card.name}</span>
</div>

<style lang="scss">
  @keyframes jiggle-shake {
    0% {
      transform: rotate(-1deg);
    }
    50% {
      transform: rotate(1deg);
    }
    100% {
      transform: rotate(-1deg);
    }
  }
  .cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
    width: 120px;
    user-select: none;
    -webkit-user-drag: none;
  }
  /* Reorder preview translation. The cell uses `style:transform` set by
   * cellShifts; this keeps the inner card/folder element free for the
   * jiggle and merge-state transforms (they don't compose otherwise). */
  .cell {
    transition: transform var(--shift-duration, 160ms) cubic-bezier(0.4, 0, 0.2, 1);
  }
  /* While this cell is the active drag source, remove it from CSS
   * layout entirely. Neighbours slide forward and close the gap —
   * matching macOS Launchpad, where lifting an icon collapses its
   * slot instead of leaving a hole. dragGrid.ts's buildLayoutCache
   * skips `[data-dragging='true']` cells so its cache tracks the
   * post-removal grid geometry. The clone (position:fixed) follows
   * the cursor and provides the visual "held card".
   *
   * `data-dragging` is set imperatively in dragGrid.ts (not in this
   * template), so we mark the attribute selector :global so Svelte's
   * static analyzer doesn't flag it as unused. The `.cell` class stays
   * scoped, so this rule still only matches elements rendered by this
   * component. */
  .cell:global([data-dragging='true']) {
    display: none;
  }
  /* Wobble lives on .card / .folder (inner element), not .cell. The
   * outer .cell may receive a transient transform (e.g. translation
   * during drag); animating an inner element keeps .cell's transform
   * free for the dnd layer to use. */
  .cell.jiggle {
    cursor: grab;
    /* Suppress browser pan/zoom on touch so the drag gesture isn't
     * double-interpreted as a scroll. */
    touch-action: none;
  }
  .cell.jiggle:active {
    cursor: grabbing;
  }
  /* Phase-stagger via per-card CSS variable derived from card.id (set
   * inline by the template). Avoids :nth-child selectors, which would
   * re-bind the delay whenever the grid is reordered, snapping the
   * animation into a new phase and producing a visible flicker on
   * drop. */
  .cell.jiggle .card,
  .cell.jiggle .folder {
    animation: jiggle-shake 0.25s ease-in-out infinite;
    animation-delay: var(--jiggle-delay, 0ms);
    transform-origin: center;
    cursor: inherit;
  }
  /* Visual cue for "release here to merge / reparent". Two tiers:
   * - merge-armed: appears at MERGE_ARM_MS (200 ms) into a stationary
   *   hover. Faint halo + small scale. Releasing here ALSO commits a
   *   merge (the gate is "armed", not "ready").
   * - merge-ready: promotes at MERGE_READY_MS (600 ms). Stronger halo,
   *   larger scale. Functionally identical to armed for drop, but a
   *   clearer "release now = build folder" signal.
   * Folder targets are always set to ready immediately.
   * Note: jiggle keyframes own `transform: rotate(...)` on the same
   * inner element; pausing the animation lets our static scale apply
   * so the user actually sees the size cue while merging. */
  .cell.merge-armed .card,
  .cell.merge-armed .folder,
  .cell.merge-ready .card,
  .cell.merge-ready .folder {
    animation-play-state: paused;
  }
  /* Armed: visible immediately. Was a subtle 2px halo that users only
   * registered once ready promoted; bumped to 3px ring + light bloom
   * so the "you're hovering for merge" signal lands at first frame. */
  .cell.merge-armed .card,
  .cell.merge-armed .folder {
    box-shadow:
      0 0 0 3px rgba(99, 102, 241, 0.65),
      0 0 14px rgba(99, 102, 241, 0.35);
    transform: scale(1.04);
    transition:
      box-shadow 0.12s ease-out,
      transform 0.12s ease-out;
  }
  /* Ready: strongest form — high-contrast accent ring + larger bloom.
   * The transition from armed→ready stays the same property set so
   * the visual change reads as "intensifying" instead of restarting. */
  .cell.merge-ready .card,
  .cell.merge-ready .folder {
    box-shadow:
      0 0 0 4px var(--c-accent, #4a6cf7),
      0 0 28px rgba(99, 102, 241, 0.7);
    transform: scale(1.07);
    transition:
      box-shadow 0.12s ease-out,
      transform 0.12s ease-out;
  }
  .x-btn {
    position: absolute;
    top: -6px;
    left: -6px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 0;
    background: var(--c-danger, #d33);
    color: white;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    z-index: 2;
  }
  .card {
    width: 120px;
    height: 120px;
    padding: 14px;
    background: var(--c-surface);
    border: 0;
    border-radius: 22px;
    box-shadow: var(--sh-card);
    cursor: pointer;
    transition:
      box-shadow var(--tr-base),
      transform var(--tr-base);
    &:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .icon {
      width: 100%;
      height: 100%;
      object-fit: contain;
      border-radius: 12px;
    }
  }
  /* Dark theme: frosted glass over the indigo gradient instead of a
   * flat surface tile. The translucent white + blur lifts the icon
   * thumb (most icons are coloured logos on white/transparent, which
   * read flat on the solid #161a24 surface). The 1px white inner
   * border at low opacity is the same trick macOS uses on Big Sur+
   * widget tiles. */
  :global([data-theme='dark']) .card {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(14px) saturate(140%);
    -webkit-backdrop-filter: blur(14px) saturate(140%);
  }
  :global([data-theme='dark']) .cell:not(.jiggle) .card:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.14);
  }
  /* Hover lift only outside jiggle (jiggle owns the transform with its
   * own animation; an extra translate would fight the rotate keyframe). */
  .cell:not(.jiggle) .card:hover:not(:disabled),
  .cell:not(.jiggle) .folder:hover {
    box-shadow: var(--sh-card-hover);
    transform: translateY(-2px);
  }
  .folder {
    width: 120px;
    height: 120px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.35);
    border: 0;
    border-radius: 22px;
    box-shadow: var(--sh-card);
    cursor: pointer;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    transition:
      box-shadow var(--tr-base),
      transform var(--tr-base);
  }
  :global([data-theme='dark']) .folder {
    background: rgba(255, 255, 255, 0.08);
  }
  .thumbs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 6px;
    width: 100%;
    height: 100%;
    /* Grid items can grow past the container by their intrinsic min
     * content size — for an <img> that is the natural pixel size of
     * the favicon, which on a high-res icon will absolutely blow the
     * 120x120 folder out. Pinning min-width/min-height to 0 disables
     * that auto-expansion so each cell gets exactly 1fr. */
    > * {
      min-width: 0;
      min-height: 0;
    }
  }
  .thumb {
    /* Use display:block so the inline baseline of <img> doesn't push
     * the grid row down. width/height + max-* clamp the natural size
     * of the favicon to the cell. */
    display: block;
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    background: rgba(255, 255, 255, 0.7);
    border-radius: 8px;
    padding: 3px;
    box-sizing: border-box;
  }
  .thumb.empty {
    background: rgba(255, 255, 255, 0.25);
  }
  .label {
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--c-card-label);
    text-align: center;
    line-height: var(--lh-tight);
    word-break: break-word;
    background: transparent;
    border: 0;
    padding: 0;
  }
  @media (max-width: 500px) {
    .cell {
      width: 72px;
      gap: var(--sp-2);
    }
    .card,
    .folder {
      width: 72px;
      height: 72px;
      padding: 10px;
      border-radius: 16px;
    }
    .label {
      font-size: var(--fs-xs);
    }
  }
</style>
