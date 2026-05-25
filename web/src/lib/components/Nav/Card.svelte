<script lang="ts">
  import type { Card } from '$lib/types/card';
  import { currentSite } from '$lib/stores/visible';
  import { jiggleMode, jiggleEnteredAt } from '$lib/stores/jiggle';
  import { t } from '$lib/i18n/store';
  import { longPress } from '$lib/util/longPress';
  import { navDataStore } from '$lib/stores/navData';
  import { deleteCard, patchCard } from '$lib/api/cards';
  import { toast } from '$lib/components/ui/toast';
  import { mergeCandidate } from '$lib/stores/dragMerge';

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

  /** ms grace window after entering jiggle, during which a click on the
   *  same card is treated as the long-press release (no-op) rather than
   *  a fresh "edit me" click. */
  const POST_LONGPRESS_GRACE_MS = 350;

  function open() {
    if ($jiggleMode) {
      // Distinguish "long-press release that just entered jiggle" from
      // "a real click while already in jiggle". The former is the
      // gesture's tail and must not also pop the editor; the latter is
      // the §5.3 edit affordance.
      const sinceEnter = Date.now() - $jiggleEnteredAt;
      const isLongPressRelease = sinceEnter < POST_LONGPRESS_GRACE_MS;
      if (isLongPressRelease) {
        if (isFolder) onOpenFolder?.(card.id);
        return;
      }
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

  let renaming = $state(false);
  let renameValue = $state('');

  function startRename(e: MouseEvent) {
    e.stopPropagation();
    if (!isFolder) return;
    renaming = true;
    renameValue = card.name;
  }

  async function commitRename() {
    const next = renameValue.trim();
    renaming = false;
    if (!next || next === card.name) return;
    try {
      const updated = await patchCard(card.id, { name: next });
      navDataStore.applyCardPatch(card.id, { name: updated.name });
    } catch {
      toast.error($t('error.unknown'));
      navDataStore.refetch();
    }
  }

  function cancelRename() {
    renaming = false;
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
  class:merge-target={$mergeCandidate?.id === card.id}
  data-card-id={card.id}
  data-card-kind={card.kind}
  use:longPress={{ onTrigger: onLongPress }}
>
  {#if $jiggleMode}
    <button type="button" class="x-btn" aria-label={$t('common.delete')} onclick={onDelete}>
      ×
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

  {#if isFolder && $jiggleMode && renaming}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="rename-input"
      bind:value={renameValue}
      onkeydown={(e) => {
        if (e.key === 'Enter') commitRename();
        else if (e.key === 'Escape') cancelRename();
      }}
      onblur={commitRename}
      autofocus
    />
  {:else if isFolder && $jiggleMode}
    <button type="button" class="label rename" onclick={startRename}>{card.name}</button>
  {:else}
    <span class="label">{card.name}</span>
  {/if}
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
  .cell.jiggle .card,
  .cell.jiggle .folder {
    animation: jiggle-shake 0.25s ease-in-out infinite;
    transform-origin: center;
    cursor: inherit;
  }
  /* Phase-stagger: avoid every card jiggling in lock-step (LaunchPad
   * clue §4 "each card's phase offset"). Three offsets across 0/+80/
   * +160 ms cover the 250 ms period nicely. */
  .cell.jiggle:nth-child(3n + 2) .card,
  .cell.jiggle:nth-child(3n + 2) .folder {
    animation-delay: -80ms;
  }
  .cell.jiggle:nth-child(3n) .card,
  .cell.jiggle:nth-child(3n) .folder {
    animation-delay: -160ms;
  }
  /* Visual cue for "release here to merge / reparent". The hover
   * threshold (500ms) flips this on by setting the cell class. */
  .cell.merge-target .card,
  .cell.merge-target .folder {
    box-shadow:
      0 0 0 4px var(--c-accent, #4a6cf7),
      0 0 22px rgba(74, 108, 247, 0.55);
    transform: scale(1.06);
    transition:
      box-shadow 0.15s ease,
      transform 0.15s ease;
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
  .label.rename {
    cursor: text;
  }
  .rename-input {
    font-size: 14px;
    text-align: center;
    width: 110px;
    border: 1px solid var(--c-border, #999);
    border-radius: 6px;
    padding: 2px 6px;
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
