<script lang="ts">
  import { navDataStore } from '$lib/stores/navData';

  const meta = $derived($navDataStore.bundle?.meta);
  const name = $derived(meta?.siteName ?? '');
  const avatar = $derived(meta?.siteAvatarPath ?? null);
</script>

<a class="brand" href="/" aria-label={name}>
  {#if avatar}<img src={avatar} alt="" class="avatar" />{/if}
  <span class="name">{name}</span>
</a>

<style lang="scss">
  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    text-decoration: none;
    color: var(--c-text);
    font-weight: var(--fw-semibold);
    font-size: var(--fs-md);

    &:hover {
      color: var(--c-accent);
    }
  }
  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
  }
  .name {
    white-space: nowrap;
  }
</style>
