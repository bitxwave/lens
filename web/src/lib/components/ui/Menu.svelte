<!-- web/src/lib/components/ui/Menu.svelte -->
<script lang="ts">
  interface MenuItem {
    label: string;
    onSelect: () => void;
    disabled?: boolean;
    intent?: 'default' | 'danger';
  }

  interface Props {
    open: boolean;
    x: number; // viewport coords
    y: number;
    items: MenuItem[];
    onClose?: () => void;
  }

  let { open = $bindable(false), x, y, items, onClose }: Props = $props();

  let menuEl: HTMLDivElement | undefined = $state();
  let focusedIdx = $state(0);

  function close() {
    open = false;
    onClose?.();
  }

  function onSelect(i: number) {
    const it = items[i];
    if (!it || it.disabled) return;
    it.onSelect();
    close();
  }

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIdx = Math.min(focusedIdx + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIdx = Math.max(focusedIdx - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onSelect(focusedIdx);
    }
  }

  $effect(() => {
    if (!open) return;
    focusedIdx = 0;
    requestAnimationFrame(() => menuEl?.focus());

    // Click-outside dismiss. Defer attaching so the click that opened the menu
    // doesn't immediately close it on the same event flow.
    let armed = false;
    const armTimer = setTimeout(() => (armed = true), 0);
    const handler = (e: MouseEvent) => {
      if (!armed || !menuEl) return;
      if (!menuEl.contains(e.target as Node)) close();
    };
    window.addEventListener('mousedown', handler);
    return () => {
      clearTimeout(armTimer);
      window.removeEventListener('mousedown', handler);
    };
  });
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <div bind:this={menuEl} class="menu" role="menu" tabindex="-1" style="left: {x}px; top: {y}px">
    {#each items as it, i (it.label)}
      <button
        class="item intent-{it.intent ?? 'default'}"
        class:focused={i === focusedIdx}
        role="menuitem"
        disabled={it.disabled}
        onclick={() => onSelect(i)}
        onmouseenter={() => (focusedIdx = i)}>{it.label}</button
      >
    {/each}
  </div>
{/if}

<style lang="scss">
  .menu {
    position: fixed;
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--rd-md);
    box-shadow: var(--sh-md);
    padding: var(--sp-1);
    min-width: 180px;
    z-index: 1200;
    outline: none;
  }

  .item {
    display: block;
    width: 100%;
    text-align: left;
    padding: var(--sp-2) var(--sp-3);
    border: 0;
    border-radius: var(--rd-sm);
    background: transparent;
    color: var(--c-text);
    font-size: var(--fs-sm);
    cursor: pointer;

    &:disabled {
      color: var(--c-text-3);
      cursor: not-allowed;
    }

    &.focused:not(:disabled) {
      background: var(--c-accent-bg);
      color: var(--c-accent);
    }

    &.intent-danger:not(:disabled).focused {
      background: var(--c-danger-bg);
      color: var(--c-danger);
    }
  }
</style>
