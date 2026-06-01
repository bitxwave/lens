<script lang="ts">
  type Variant = 'search' | 'offline' | 'empty';

  interface Props {
    title: string;
    hint?: string;
    variant?: Variant;
    actions?: import('svelte').Snippet;
  }

  let { title, hint, variant = 'empty', actions }: Props = $props();
</script>

<div class="empty" role="status" aria-live="polite">
  <div class="glyph glyph-{variant}" aria-hidden="true">
    {#if variant === 'search'}
      <svg
        viewBox="0 0 64 64"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="27" cy="27" r="16" opacity="0.85" />
        <path d="m38 38 12 12" opacity="0.85" />
        <path d="m22 22 10 10" opacity="0.5" />
        <path d="m32 22-10 10" opacity="0.5" />
      </svg>
    {:else if variant === 'offline'}
      <svg
        viewBox="0 0 64 64"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M6 22a36 36 0 0 1 52 0" opacity="0.55" />
        <path d="M14 32a24 24 0 0 1 36 0" opacity="0.7" />
        <path d="M22 42a12 12 0 0 1 20 0" opacity="0.85" />
        <circle cx="32" cy="52" r="2" fill="currentColor" />
        <path d="m8 8 48 48" stroke-width="1.6" />
      </svg>
    {:else}
      <svg
        viewBox="0 0 64 64"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect x="10" y="14" width="44" height="36" rx="4" opacity="0.65" />
        <path d="M10 24h44" opacity="0.65" />
        <path d="M32 32v10" opacity="0.85" />
        <path d="M27 37h10" opacity="0.85" />
      </svg>
    {/if}
  </div>

  <h2 class="title">{title}</h2>
  {#if hint}<p class="hint">{hint}</p>{/if}

  {#if actions}
    <div class="actions">{@render actions()}</div>
  {/if}
</div>

<style lang="scss">
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-7) var(--sp-4) var(--sp-6);
    color: var(--c-card-label);
    text-align: center;
    animation: empty-rise var(--tr-slow) ease-out;
  }

  @keyframes empty-rise {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .glyph {
    width: 96px;
    height: 96px;
    color: rgba(255, 255, 255, 0.55);
    filter: drop-shadow(0 2px 8px rgba(35, 25, 60, 0.18));
    margin-bottom: var(--sp-1);

    svg {
      width: 100%;
      height: 100%;
      display: block;
    }
  }

  .title {
    margin: 0;
    font-size: var(--fs-xl);
    font-weight: var(--fw-semibold);
    letter-spacing: 0.01em;
    color: var(--c-card-label);
    text-shadow: var(--sh-card-label);
  }

  .hint {
    margin: 0;
    font-size: var(--fs-md);
    line-height: var(--lh-base);
    color: var(--c-section-heading);
    opacity: 0.85;
    max-width: 32ch;
  }

  .actions {
    display: flex;
    gap: var(--sp-2);
    margin-top: var(--sp-3);
  }

  /* Style buttons sitting on the gradient backdrop. Lower priority than
   * intent-* on the button itself; primary buttons keep their accent. */
  .actions :global(button.intent-secondary),
  .actions :global(button.intent-ghost) {
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.32);
    color: var(--c-card-label);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    text-shadow: var(--sh-card-label);
    transition:
      background var(--tr-fast),
      border-color var(--tr-fast);
  }
  .actions :global(button.intent-secondary):hover:not(:disabled),
  .actions :global(button.intent-ghost):hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.22);
    border-color: rgba(255, 255, 255, 0.5);
  }

  @media (max-width: 500px) {
    .empty {
      padding: var(--sp-6) var(--sp-3) var(--sp-5);
    }
    .glyph {
      width: 80px;
      height: 80px;
    }
    .title {
      font-size: var(--fs-lg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .empty {
      animation: none;
    }
  }
</style>
