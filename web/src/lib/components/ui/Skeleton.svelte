<!-- web/src/lib/components/ui/Skeleton.svelte -->
<script lang="ts">
  interface Props {
    width?: string;
    height?: string;
    rounded?: 'sm' | 'md' | 'pill';
  }

  let { width = '100%', height = '14px', rounded = 'sm' }: Props = $props();
</script>

<span class="skeleton rd-{rounded}" style="width: {width}; height: {height}" aria-hidden="true"
></span>

<style lang="scss">
  @keyframes shimmer {
    0% {
      background-position: -200px 0;
    }
    100% {
      background-position: calc(200px + 100%) 0;
    }
  }

  .skeleton {
    display: inline-block;
    background: linear-gradient(
      90deg,
      var(--c-surface-2) 0px,
      var(--c-border) 80px,
      var(--c-surface-2) 160px
    );
    background-size: 200px 100%;
    background-repeat: no-repeat;
    animation: shimmer 1.4s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      animation: none;
    }
  }

  .rd-sm {
    border-radius: var(--rd-sm);
  }
  .rd-md {
    border-radius: var(--rd-md);
  }
  .rd-pill {
    border-radius: var(--rd-pill);
  }
</style>
